"""Independent proof verifier. No database access is used here."""

from dataclasses import dataclass
from datetime import datetime

from .crypto import digest, verify_payload
from .ledger import GENESIS_HASH
from .policy import evaluate, policy_hash, validate_request


@dataclass
class Verification:
    ok: bool
    problems: list[str]
    missing_requests: list[str]


def checkpoint_digest(checkpoint: dict) -> str:
    return digest(checkpoint)


def _valid_acceptance_receipt(receipt: object, issuer_public_key: str) -> bool:
    if type(receipt) is not dict or set(receipt) != {"seq", "kind", "body", "prev_hash", "created_at", "signature", "entry_hash"}:
        return False
    if receipt["kind"] != "ACCEPT" or type(receipt["body"]) is not dict or set(receipt["body"]) != {"request", "agent_signature"}:
        return False
    try:
        request = receipt["body"]["request"]
        validate_request(request)
        unsigned = {key: receipt[key] for key in ("seq", "kind", "body", "prev_hash", "created_at")}
        signed = {**unsigned, "signature": receipt["signature"]}
        return (
            type(receipt["seq"]) is int and receipt["seq"] > 0
            and type(receipt["prev_hash"]) is str
            and datetime.fromisoformat(receipt["created_at"]).tzinfo is not None
            and digest(signed) == receipt["entry_hash"]
            and verify_payload(issuer_public_key, unsigned, receipt["signature"])
            and verify_payload(request["agent_key"], request, receipt["body"]["agent_signature"])
        )
    except (ValueError, TypeError, KeyError):
        return False


def verify_proof(
    proof: dict, *, issuer_public_key: str, expected_checkpoint_hash: str,
    expected_acceptances: list[dict] | None = None,
    expected_agent_keys: set[str] | None = None,
    expected_enterprise_keys: set[str] | None = None,
) -> Verification:
    problems: list[str] = []
    missing: list[str] = []
    if type(proof) is not dict or set(proof) != {"format", "entries", "checkpoint"} or proof.get("format") != "trust404-proof-v1":
        return Verification(False, ["INVALID_PROOF_FORMAT"], [])
    entries, checkpoint = proof["entries"], proof["checkpoint"]
    if type(entries) is not list or type(checkpoint) is not dict or set(checkpoint) != {"size", "head_hash", "signature"}:
        return Verification(False, ["INVALID_PROOF_FORMAT"], [])
    try:
        if checkpoint_digest(checkpoint) != expected_checkpoint_hash:
            problems.append("CHECKPOINT_PIN_MISMATCH")
        checkpoint_body = {"size": checkpoint["size"], "head_hash": checkpoint["head_hash"]}
        if not verify_payload(issuer_public_key, checkpoint_body, checkpoint["signature"]):
            problems.append("INVALID_CHECKPOINT_SIGNATURE")
        if type(checkpoint["size"]) is not int or checkpoint["size"] != len(entries):
            problems.append("CHECKPOINT_SIZE_MISMATCH")
    except (ValueError, TypeError):
        return Verification(False, ["INVALID_CHECKPOINT"], [])

    prev = GENESIS_HASH
    accepted: dict[str, tuple[dict, str]] = {}
    decided: set[str] = set()
    for index, entry in enumerate(entries, start=1):
        if type(entry) is not dict or set(entry) != {"seq", "kind", "body", "prev_hash", "created_at", "signature", "entry_hash"}:
            problems.append("INVALID_ENTRY_FORMAT")
            continue
        try:
            unsigned = {key: entry[key] for key in ("seq", "kind", "body", "prev_hash", "created_at")}
            signed = {**unsigned, "signature": entry["signature"]}
            if type(entry["seq"]) is not int or entry["seq"] != index or entry["prev_hash"] != prev:
                problems.append("BROKEN_CHAIN")
            if datetime.fromisoformat(entry["created_at"]).tzinfo is None:
                problems.append("INVALID_ENTRY_TIMESTAMP")
            if digest(signed) != entry["entry_hash"]:
                problems.append("INVALID_ENTRY_HASH")
            if not verify_payload(issuer_public_key, unsigned, entry["signature"]):
                problems.append("INVALID_ENTRY_SIGNATURE")
            body = entry["body"]
            if type(body) is not dict:
                problems.append("INVALID_ENTRY_BODY")
                continue
            if entry["kind"] == "ACCEPT":
                if set(body) != {"request", "agent_signature"}:
                    problems.append("INVALID_ACCEPT_BODY")
                    continue
                request = body["request"]
                validate_request(request)
                request_id = request["request_id"]
                if expected_agent_keys is not None and request["agent_key"] not in expected_agent_keys:
                    problems.append("UNTRUSTED_AGENT_KEY")
                if expected_enterprise_keys is not None and request["enterprise_key"] not in expected_enterprise_keys:
                    problems.append("UNTRUSTED_ENTERPRISE_KEY")
                if request_id in accepted:
                    problems.append("DUPLICATE_ACCEPT")
                if not verify_payload(request["agent_key"], request, body["agent_signature"]):
                    problems.append("INVALID_AGENT_SIGNATURE")
                accepted[request_id] = (request, entry["entry_hash"])
            elif entry["kind"] == "DECISION":
                if set(body) != {"request_id", "accept_hash", "policy", "policy_hash", "policy_signature", "result", "reason"}:
                    problems.append("INVALID_DECISION_BODY")
                    continue
                request_id = body["request_id"]
                if type(request_id) is not str or request_id not in accepted:
                    problems.append("ORPHAN_DECISION")
                    continue
                if request_id in decided:
                    problems.append("DUPLICATE_DECISION")
                decided.add(request_id)
                request, accept_hash = accepted[request_id]
                if body["accept_hash"] != accept_hash:
                    problems.append("ACCEPT_BINDING_MISMATCH")
                if body["policy_hash"] != policy_hash(body["policy"]):
                    problems.append("POLICY_HASH_MISMATCH")
                if not verify_payload(request["enterprise_key"], body["policy"], body["policy_signature"]):
                    problems.append("INVALID_POLICY_SIGNATURE")
                if (body["result"], body["reason"]) != evaluate(request, body["policy"]):
                    problems.append("POLICY_RESULT_MISMATCH")
            else:
                problems.append("UNKNOWN_ENTRY_KIND")
            prev = entry["entry_hash"]
        except (ValueError, TypeError, KeyError):
            problems.append("INVALID_ENTRY_BODY")
    if checkpoint["head_hash"] != prev:
        problems.append("CHECKPOINT_HEAD_MISMATCH")
    missing_ids = set(accepted) - decided
    if expected_acceptances is not None:
        if type(expected_acceptances) is not list:
            problems.append("INVALID_EXPECTED_ACCEPTANCE")
        else:
            present_hashes = {entry.get("entry_hash") for entry in entries if type(entry) is dict and type(entry.get("entry_hash")) is str}
            for receipt in expected_acceptances:
                if not _valid_acceptance_receipt(receipt, issuer_public_key):
                    problems.append("INVALID_EXPECTED_ACCEPTANCE")
                elif receipt["entry_hash"] not in present_hashes:
                    problems.append("ACCEPTANCE_OMITTED")
                    missing_ids.add(receipt["body"]["request"]["request_id"])
    missing = sorted(missing_ids)
    if set(accepted) - decided:
        problems.append("MISSING_DECISION")
    return Verification(not problems, list(dict.fromkeys(problems)), missing)
