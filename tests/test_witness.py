import copy

import pytest

from trust404.crypto import generate_private_key, public_key_b64, sign_payload
from trust404.ledger import Ledger
from trust404.witness import Witness, verify_witness_receipt


def make_request(agent, enterprise, request_id):
    return {
        "request_id": request_id,
        "agent_key": public_key_b64(agent),
        "enterprise_key": public_key_b64(enterprise),
        "amount_minor": 250,
        "currency": "USD",
        "destination": "merchant",
    }


def test_witness_signs_checkpoint_and_append_only_extension(tmp_path):
    issuer = generate_private_key()
    agent = generate_private_key()
    enterprise = generate_private_key()
    witness_key = generate_private_key()
    ledger = Ledger(tmp_path / "ledger.db", issuer)
    witness = Witness(tmp_path / "witness.db", witness_key)
    request = make_request(agent, enterprise, "first")
    ledger.accept(request, sign_payload(agent, request))
    first_proof = ledger.export_proof()
    first_receipt = witness.anchor(first_proof, public_key_b64(issuer))
    assert verify_witness_receipt(first_proof, first_receipt, public_key_b64(issuer), public_key_b64(witness_key))

    policy = {"version": "v1", "max_amount_minor": 500, "currency": "USD"}
    ledger.decide("first", policy, sign_payload(enterprise, policy))
    second_proof = ledger.export_proof()
    second_receipt = Witness(tmp_path / "witness.db", witness_key).anchor(second_proof, public_key_b64(issuer))
    assert verify_witness_receipt(second_proof, second_receipt, public_key_b64(issuer), public_key_b64(witness_key))
    assert second_receipt["witness_seq"] == 2
    assert second_receipt["previous_receipt_hash"] == first_receipt["receipt_hash"]


def test_witness_rejects_rewritten_prefix(tmp_path):
    issuer = generate_private_key()
    agent = generate_private_key()
    enterprise = generate_private_key()
    witness = Witness(tmp_path / "witness.db", generate_private_key())
    original = Ledger(tmp_path / "original.db", issuer)
    first = make_request(agent, enterprise, "first")
    original.accept(first, sign_payload(agent, first))
    witness.anchor(original.export_proof(), public_key_b64(issuer))

    alternate = Ledger(tmp_path / "alternate.db", issuer)
    other = make_request(agent, enterprise, "different")
    alternate.accept(other, sign_payload(agent, other))
    with pytest.raises(ValueError, match="fork"):
        witness.anchor(alternate.export_proof(), public_key_b64(issuer))


def test_modified_witness_receipt_fails_signature_check(tmp_path):
    issuer = generate_private_key()
    agent = generate_private_key()
    enterprise = generate_private_key()
    witness_key = generate_private_key()
    ledger = Ledger(tmp_path / "ledger.db", issuer)
    request = make_request(agent, enterprise, "first")
    ledger.accept(request, sign_payload(agent, request))
    proof = ledger.export_proof()
    receipt = Witness(tmp_path / "witness.db", witness_key).anchor(proof, public_key_b64(issuer))
    altered = copy.deepcopy(receipt)
    altered["checkpoint_hash"] = "0" * 64
    assert not verify_witness_receipt(proof, altered, public_key_b64(issuer), public_key_b64(witness_key))


def test_reopen_with_different_witness_key_is_rejected(tmp_path):
    Witness(tmp_path / "witness.db", generate_private_key())
    with pytest.raises(ValueError, match="witness key mismatch"):
        Witness(tmp_path / "witness.db", generate_private_key())
