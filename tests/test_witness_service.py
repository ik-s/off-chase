from fastapi.testclient import TestClient

from trust404.crypto import generate_private_key, public_key_b64, sign_payload
from trust404.ledger import Ledger
from trust404.witness import Witness, verify_witness_history, verify_witness_receipt
from trust404.witness_api import create_witness_app


def signed_request(agent, enterprise, request_id):
    return {
        "request_id": request_id,
        "agent_key": public_key_b64(agent),
        "enterprise_key": public_key_b64(enterprise),
        "amount_minor": 100,
        "currency": "USD",
        "destination": "merchant",
    }


def test_witness_http_anchors_and_publishes_verifiable_history(tmp_path):
    issuer, agent, enterprise, witness_key = [generate_private_key() for _ in range(4)]
    issuer_public = public_key_b64(issuer)
    witness_public = public_key_b64(witness_key)
    ledger = Ledger(tmp_path / "ledger.db", issuer)
    witness = Witness(tmp_path / "witness.db", witness_key)
    client = TestClient(create_witness_app(witness, allowed_issuer_keys={issuer_public}, anchor_token="witness-secret"))

    request = signed_request(agent, enterprise, "first")
    ledger.accept(request, sign_payload(agent, request))
    first_proof = ledger.export_proof()
    assert client.post("/anchors", json={"issuer_key": issuer_public, "proof": first_proof}).status_code == 401
    headers = {"Authorization": "Bearer witness-secret"}
    first = client.post("/anchors", json={"issuer_key": issuer_public, "proof": first_proof}, headers=headers)
    assert first.status_code == 201
    assert verify_witness_receipt(first_proof, first.json(), issuer_public, witness_public)

    policy = {"version": "v1", "max_amount_minor": 200, "currency": "USD"}
    ledger.decide("first", policy, sign_payload(enterprise, policy))
    second_proof = ledger.export_proof()
    second = client.post("/anchors", json={"issuer_key": issuer_public, "proof": second_proof}, headers=headers)
    assert second.status_code == 201
    history = client.get("/anchors", params={"issuer_key": issuer_public})
    assert history.status_code == 200
    receipts = history.json()
    assert len(receipts) == 2
    assert verify_witness_history(receipts, issuer_public, witness_public, expected_latest_hash=second.json()["receipt_hash"])


def test_witness_http_refuses_unknown_issuer_and_rollback(tmp_path):
    issuer, agent, enterprise, witness_key = [generate_private_key() for _ in range(4)]
    issuer_public = public_key_b64(issuer)
    ledger = Ledger(tmp_path / "ledger.db", issuer)
    client = TestClient(create_witness_app(Witness(tmp_path / "witness.db", witness_key), allowed_issuer_keys={issuer_public}, anchor_token="secret"))
    headers = {"Authorization": "Bearer secret"}
    request = signed_request(agent, enterprise, "first")
    ledger.accept(request, sign_payload(agent, request))
    old_proof = ledger.export_proof()
    unknown = client.post("/anchors", json={"issuer_key": "not-allowed", "proof": old_proof}, headers=headers)
    assert unknown.status_code == 403
    policy = {"version": "v1", "max_amount_minor": 200, "currency": "USD"}
    ledger.decide("first", policy, sign_payload(enterprise, policy))
    assert client.post("/anchors", json={"issuer_key": issuer_public, "proof": ledger.export_proof()}, headers=headers).status_code == 201
    rollback = client.post("/anchors", json={"issuer_key": issuer_public, "proof": old_proof}, headers=headers)
    assert rollback.status_code == 409


def test_witness_history_rejects_deleted_or_forged_receipts(tmp_path):
    issuer, agent, enterprise, witness_key = [generate_private_key() for _ in range(4)]
    ledger = Ledger(tmp_path / "ledger.db", issuer)
    witness = Witness(tmp_path / "witness.db", witness_key)
    request = signed_request(agent, enterprise, "first")
    ledger.accept(request, sign_payload(agent, request))
    witness.anchor(ledger.export_proof(), public_key_b64(issuer))
    policy = {"version": "v1", "max_amount_minor": 200, "currency": "USD"}
    ledger.decide("first", policy, sign_payload(enterprise, policy))
    witness.anchor(ledger.export_proof(), public_key_b64(issuer))
    history = witness.history(public_key_b64(issuer))
    latest = history[-1]["receipt_hash"]
    assert not verify_witness_history(history[1:], public_key_b64(issuer), public_key_b64(witness_key), expected_latest_hash=latest)
    forged = [dict(item) for item in history]
    forged[-1]["issued_at"] = "2000-01-01T00:00:00+00:00"
    assert not verify_witness_history(forged, public_key_b64(issuer), public_key_b64(witness_key), expected_latest_hash=latest)
