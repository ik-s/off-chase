"""Reproducible local throughput and attack-detection benchmark."""

import copy
import tempfile
from pathlib import Path
from time import perf_counter

from .crypto import canonical_bytes, generate_private_key, public_key_b64, sign_payload
from .ledger import Ledger
from .verify import checkpoint_digest, verify_proof


def run_benchmark(request_count: int) -> dict:
    if type(request_count) is not int or not 1 <= request_count <= 10_000:
        raise ValueError("request_count must be an integer from 1 to 10000")
    issuer = generate_private_key()
    agent = generate_private_key()
    enterprise = generate_private_key()
    issuer_public_key = public_key_b64(issuer)
    policy = {"version": "benchmark-v1", "max_amount_minor": 1000, "currency": "USD"}
    policy_signature = sign_payload(enterprise, policy)
    with tempfile.TemporaryDirectory() as directory:
        ledger = Ledger(Path(directory) / "ledger.db", issuer)
        started = perf_counter()
        for index in range(request_count):
            request = {
                "request_id": f"benchmark-{index:06d}",
                "agent_key": public_key_b64(agent),
                "enterprise_key": public_key_b64(enterprise),
                "amount_minor": 1001 if index % 2 else 999,
                "currency": "USD",
                "destination": "benchmark-merchant",
            }
            ledger.accept(request, sign_payload(agent, request))
            ledger.decide(request["request_id"], policy, policy_signature)
        proof = ledger.export_proof()
        issue_seconds = perf_counter() - started
        pin = checkpoint_digest(proof["checkpoint"])
        started = perf_counter()
        normal = verify_proof(proof, issuer_public_key=issuer_public_key, expected_checkpoint_hash=pin)
        verification_seconds = perf_counter() - started

        reason = copy.deepcopy(proof)
        reason["entries"][1]["body"]["reason"] = "ALTERED_REASON"
        threshold = copy.deepcopy(proof)
        threshold["entries"][1]["body"]["policy"]["max_amount_minor"] = 2000
        deletion = copy.deepcopy(proof)
        deletion["entries"].pop()
        missing_ledger = Ledger(Path(directory) / "missing.db", issuer)
        missing_request = {
            "request_id": "benchmark-missing",
            "agent_key": public_key_b64(agent),
            "enterprise_key": public_key_b64(enterprise),
            "amount_minor": 999,
            "currency": "USD",
            "destination": "benchmark-merchant",
        }
        missing_ledger.accept(missing_request, sign_payload(agent, missing_request))
        missing_proof = missing_ledger.export_proof()
        cases = ((reason, pin), (threshold, pin), (deletion, pin), (missing_proof, checkpoint_digest(missing_proof["checkpoint"])))
        detected = sum(not verify_proof(case, issuer_public_key=issuer_public_key, expected_checkpoint_hash=case_pin).ok for case, case_pin in cases)
        return {
            "requests": request_count,
            "entries": len(proof["entries"]),
            "proof_bytes": len(canonical_bytes(proof)),
            "issue_seconds": round(issue_seconds, 6),
            "verification_seconds": round(verification_seconds, 6),
            "normal_verified": normal.ok,
            "attacks_detected": detected,
            "attacks_total": len(cases),
        }
