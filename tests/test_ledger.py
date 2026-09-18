import copy
from datetime import datetime

import pytest

from trust404.crypto import digest, generate_private_key, public_key_b64, sign_payload
from trust404.ledger import Ledger
from trust404.verify import checkpoint_digest, verify_proof


@pytest.fixture
def setup(tmp_path):
    issuer = generate_private_key()
    agent = generate_private_key()
    enterprise = generate_private_key()
    ledger = Ledger(tmp_path / "ledger.db", issuer)
    request = {
        "request_id": "request-001",
        "agent_key": public_key_b64(agent),
        "enterprise_key": public_key_b64(enterprise),
        "amount_minor": 1050,
        "currency": "USD",
        "destination": "merchant-17",
    }
    signature = sign_payload(agent, request)
    policy = {"version": "v1", "max_amount_minor": 1000, "currency": "USD"}
    return issuer, agent, ledger, request, signature, policy, enterprise, sign_payload(enterprise, policy)


def issue_proof(setup, *, decide=True):
    issuer, _, ledger, request, signature, policy, _, policy_signature = setup
    ledger.accept(request, signature)
    if decide:
        ledger.decide(request["request_id"], policy, policy_signature)
    proof = ledger.export_proof()
    return proof, public_key_b64(issuer), checkpoint_digest(proof["checkpoint"])


def check(proof, issuer_key, pin):
    return verify_proof(proof, issuer_public_key=issuer_key, expected_checkpoint_hash=pin)


def test_rejected_decision_verifies_without_database(setup):
    proof, issuer_key, pin = issue_proof(setup)
    result = check(proof, issuer_key, pin)
    assert result.ok
    assert result.missing_requests == []
    assert proof["entries"][1]["body"]["result"] == "REJECTED"
    assert proof["entries"][1]["body"]["reason"] == "AMOUNT_LIMIT"
    assert datetime.fromisoformat(proof["entries"][0]["created_at"]).tzinfo is not None
    assert datetime.fromisoformat(proof["entries"][1]["created_at"]).tzinfo is not None


def test_changed_rejection_reason_is_detected(setup):
    proof, issuer_key, pin = issue_proof(setup)
    proof["entries"][1]["body"]["reason"] = "LOW_RISK"
    assert not check(proof, issuer_key, pin).ok


def test_changed_policy_threshold_is_detected(setup):
    proof, issuer_key, pin = issue_proof(setup)
    proof["entries"][1]["body"]["policy"]["max_amount_minor"] = 2000
    assert not check(proof, issuer_key, pin).ok


def test_deleted_decision_is_detected_by_checkpoint(setup):
    proof, issuer_key, pin = issue_proof(setup)
    proof["entries"].pop()
    result = check(proof, issuer_key, pin)
    assert not result.ok
    assert "CHECKPOINT_SIZE_MISMATCH" in result.problems


def test_accepted_request_without_decision_is_reported(setup):
    proof, issuer_key, pin = issue_proof(setup, decide=False)
    result = check(proof, issuer_key, pin)
    assert not result.ok
    assert result.missing_requests == ["request-001"]
    assert "MISSING_DECISION" in result.problems


def test_repeated_request_and_decision_are_rejected(setup):
    _, _, ledger, request, signature, policy, _, policy_signature = setup
    ledger.accept(request, signature)
    with pytest.raises(ValueError, match="already accepted"):
        ledger.accept(request, signature)
    ledger.decide(request["request_id"], policy, policy_signature)
    with pytest.raises(ValueError, match="already decided"):
        ledger.decide(request["request_id"], policy, policy_signature)


def test_bad_agent_signature_is_rejected(setup):
    _, _, ledger, request, _, _, _, _ = setup
    other = generate_private_key()
    with pytest.raises(ValueError, match="agent signature"):
        ledger.accept(request, sign_payload(other, request))


def test_reopened_ledger_preserves_chain(setup, tmp_path):
    issuer, _, ledger, request, signature, policy, _, policy_signature = setup
    ledger.accept(request, signature)
    reopened = Ledger(tmp_path / "ledger.db", issuer)
    reopened.decide(request["request_id"], policy, policy_signature)
    proof = reopened.export_proof()
    assert check(proof, public_key_b64(issuer), checkpoint_digest(proof["checkpoint"])).ok


def test_wrong_independent_checkpoint_pin_fails(setup):
    proof, issuer_key, _ = issue_proof(setup)
    result = check(proof, issuer_key, "0" * 64)
    assert not result.ok
    assert "CHECKPOINT_PIN_MISMATCH" in result.problems


def test_modified_agent_request_is_detected(setup):
    proof, issuer_key, pin = issue_proof(setup)
    proof = copy.deepcopy(proof)
    proof["entries"][0]["body"]["request"]["amount_minor"] = 500
    assert not check(proof, issuer_key, pin).ok


def test_modified_entry_timestamp_is_detected(setup):
    proof, issuer_key, pin = issue_proof(setup)
    proof["entries"][1]["created_at"] = "1999-01-01T00:00:00+00:00"
    assert not check(proof, issuer_key, pin).ok


def test_signed_non_utc_entry_timestamp_is_rejected(setup):
    issuer, _, _, _, _, _, _, _ = setup
    proof, issuer_key, _ = issue_proof(setup, decide=False)
    entry = proof["entries"][0]
    entry["created_at"] = "2026-09-18T21:00:00+09:00"
    unsigned = {key: entry[key] for key in ("seq", "kind", "body", "prev_hash", "created_at")}
    entry["signature"] = sign_payload(issuer, unsigned)
    entry["entry_hash"] = digest({**unsigned, "signature": entry["signature"]})
    checkpoint_body = {"size": 1, "head_hash": entry["entry_hash"]}
    proof["checkpoint"] = {**checkpoint_body, "signature": sign_payload(issuer, checkpoint_body)}
    result = check(proof, issuer_key, checkpoint_digest(proof["checkpoint"]))
    assert "INVALID_ENTRY_TIMESTAMP" in result.problems


def test_malformed_signature_returns_invalid_instead_of_crashing(setup):
    proof, issuer_key, pin = issue_proof(setup)
    proof["entries"][0]["signature"] = "%%%"
    result = check(proof, issuer_key, pin)
    assert not result.ok
    assert "INVALID_ENTRY_SIGNATURE" in result.problems


def test_approved_decision_and_currency_rejection_are_recomputed(setup):
    issuer, agent, ledger, request, _, policy, _, policy_signature = setup
    approved = {**request, "request_id": "approved", "amount_minor": 1000}
    wrong_currency = {**request, "request_id": "currency", "currency": "EUR"}
    ledger.accept(approved, sign_payload(agent, approved))
    ledger.decide("approved", policy, policy_signature)
    ledger.accept(wrong_currency, sign_payload(agent, wrong_currency))
    ledger.decide("currency", policy, policy_signature)
    proof = ledger.export_proof()
    assert check(proof, public_key_b64(issuer), checkpoint_digest(proof["checkpoint"])).ok
    assert proof["entries"][1]["body"]["result"] == "APPROVED"
    assert proof["entries"][3]["body"]["reason"] == "CURRENCY_NOT_ALLOWED"


def test_external_acceptance_receipt_exposes_omitted_request(setup):
    issuer, _, ledger, request, signature, _, _, _ = setup
    receipt = ledger.accept(request, signature)
    from trust404.crypto import sign_payload
    from trust404.ledger import GENESIS_HASH

    empty_checkpoint_body = {"size": 0, "head_hash": GENESIS_HASH}
    empty_checkpoint = {**empty_checkpoint_body, "signature": sign_payload(issuer, empty_checkpoint_body)}
    rewritten_proof = {"format": "trust404-proof-v1", "entries": [], "checkpoint": empty_checkpoint}
    result = verify_proof(
        rewritten_proof,
        issuer_public_key=public_key_b64(issuer),
        expected_checkpoint_hash=checkpoint_digest(empty_checkpoint),
        expected_acceptances=[receipt],
    )
    assert not result.ok
    assert "ACCEPTANCE_OMITTED" in result.problems
    assert result.missing_requests == ["request-001"]


def test_forged_external_acceptance_receipt_is_rejected(setup):
    proof, issuer_key, pin = issue_proof(setup)
    forged = copy.deepcopy(proof["entries"][0])
    forged["body"]["request"]["amount_minor"] = 999
    result = verify_proof(proof, issuer_public_key=issuer_key, expected_checkpoint_hash=pin, expected_acceptances=[forged])
    assert not result.ok
    assert "INVALID_EXPECTED_ACCEPTANCE" in result.problems


def test_policy_requires_enterprise_signature(setup):
    _, _, ledger, request, signature, policy, _, _ = setup
    ledger.accept(request, signature)
    attacker = generate_private_key()
    with pytest.raises(ValueError, match="enterprise policy signature"):
        ledger.decide(request["request_id"], policy, sign_payload(attacker, policy))


def test_tampered_enterprise_policy_signature_is_detected(setup):
    proof, issuer_key, pin = issue_proof(setup)
    proof["entries"][1]["body"]["policy_signature"] = "bad-signature"
    result = check(proof, issuer_key, pin)
    assert not result.ok
    assert "INVALID_POLICY_SIGNATURE" in result.problems


def test_reopen_with_different_issuer_key_is_rejected(setup, tmp_path):
    with pytest.raises(ValueError, match="issuer key mismatch"):
        Ledger(tmp_path / "ledger.db", generate_private_key())


def test_offline_verifier_can_enforce_known_agent_and_enterprise_keys(setup):
    proof, issuer_key, pin = issue_proof(setup)
    _, agent, _, _, _, _, enterprise, _ = setup
    trusted = verify_proof(
        proof, issuer_public_key=issuer_key, expected_checkpoint_hash=pin,
        expected_agent_keys={public_key_b64(agent)},
        expected_enterprise_keys={public_key_b64(enterprise)},
    )
    assert trusted.ok
    untrusted = verify_proof(
        proof, issuer_public_key=issuer_key, expected_checkpoint_hash=pin,
        expected_agent_keys={public_key_b64(generate_private_key())},
        expected_enterprise_keys={public_key_b64(generate_private_key())},
    )
    assert not untrusted.ok
    assert "UNTRUSTED_AGENT_KEY" in untrusted.problems
    assert "UNTRUSTED_ENTERPRISE_KEY" in untrusted.problems
