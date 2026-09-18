from fastapi.testclient import TestClient

from trust404.api import create_app
from trust404.crypto import generate_private_key, public_key_b64, sign_payload
from trust404.ledger import Ledger
from trust404.verify import checkpoint_digest, verify_proof


def test_http_flow_returns_receipts_and_portable_proof(tmp_path):
    issuer = generate_private_key()
    agent = generate_private_key()
    enterprise = generate_private_key()
    ledger = Ledger(tmp_path / "api.db", issuer)
    client = TestClient(create_app(ledger, decision_token="secret", allowed_agent_keys={public_key_b64(agent)}))
    request = {
        "request_id": "api-request",
        "agent_key": public_key_b64(agent),
        "enterprise_key": public_key_b64(enterprise),
        "amount_minor": 1250,
        "currency": "USD",
        "destination": "merchant",
    }
    accepted = client.post("/requests", json={"request": request, "agent_signature": sign_payload(agent, request)})
    assert accepted.status_code == 201
    assert accepted.json()["kind"] == "ACCEPT"
    assert client.post("/requests", json={"request": request, "agent_signature": sign_payload(agent, request)}).status_code == 409

    policy = {"version": "api-v1", "max_amount_minor": 1000, "currency": "USD"}
    decision_body = {"policy": policy, "policy_signature": sign_payload(enterprise, policy)}
    assert client.post("/requests/api-request/decision", json=decision_body).status_code == 401
    decided = client.post("/requests/api-request/decision", json=decision_body, headers={"Authorization": "Bearer secret"})
    assert decided.status_code == 201
    assert decided.json()["body"]["reason"] == "AMOUNT_LIMIT"
    assert client.get("/proof").status_code == 401
    proof = client.get("/proof", headers={"Authorization": "Bearer secret"}).json()
    pin = checkpoint_digest(proof["checkpoint"])
    assert verify_proof(proof, issuer_public_key=public_key_b64(issuer), expected_checkpoint_hash=pin).ok


def test_http_rejects_unknown_agent_and_wrong_enterprise_signature(tmp_path):
    issuer = generate_private_key()
    agent = generate_private_key()
    enterprise = generate_private_key()
    request = {
        "request_id": "api-request",
        "agent_key": public_key_b64(agent),
        "enterprise_key": public_key_b64(enterprise),
        "amount_minor": 100,
        "currency": "USD",
        "destination": "merchant",
    }
    ledger = Ledger(tmp_path / "api.db", issuer)
    restricted = TestClient(create_app(ledger, decision_token="secret", allowed_agent_keys=set()))
    body = {"request": request, "agent_signature": sign_payload(agent, request)}
    assert restricted.post("/requests", json=body).status_code == 403
    client = TestClient(create_app(ledger, decision_token="secret", allowed_agent_keys={public_key_b64(agent)}))
    assert client.post("/requests", json=body).status_code == 201
    policy = {"version": "v1", "max_amount_minor": 1000, "currency": "USD"}
    bad = client.post(
        "/requests/api-request/decision",
        json={"policy": policy, "policy_signature": sign_payload(agent, policy)},
        headers={"Authorization": "Bearer secret"},
    )
    assert bad.status_code == 400
    proof = client.get("/proof", headers={"Authorization": "Bearer secret"}).json()
    assert len(proof["entries"]) == 1


def test_malformed_agent_key_returns_client_error(tmp_path):
    ledger = Ledger(tmp_path / "api.db", generate_private_key())
    client = TestClient(create_app(ledger, decision_token="secret", allowed_agent_keys={"allowed"}))
    result = client.post("/requests", json={"request": {"agent_key": ["not", "a", "key"]}, "agent_signature": "bad"})
    assert result.status_code in (400, 403)
