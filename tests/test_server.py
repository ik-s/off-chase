
import pytest
from fastapi.testclient import TestClient

from trust404.crypto import (
    generate_private_key,
    private_key_b64,
    public_key_b64,
    sign_payload,
)
from trust404.server import load_app_from_env


def test_server_requires_keys_token_and_agent_allowlist(tmp_path, monkeypatch):
    issuer = generate_private_key()
    agent = generate_private_key()
    enterprise = generate_private_key()
    key_file = tmp_path / "issuer.key"
    key_file.write_text(private_key_b64(issuer))
    key_file.chmod(0o600)
    monkeypatch.setenv("TRUST404_DB", str(tmp_path / "ledger.db"))
    monkeypatch.setenv("TRUST404_ISSUER_KEY_FILE", str(key_file))
    monkeypatch.setenv("TRUST404_OPERATOR_TOKEN", "operator-secret")
    monkeypatch.setenv("TRUST404_ALLOWED_AGENT_KEYS", public_key_b64(agent))
    client = TestClient(load_app_from_env())
    request = {
        "request_id": "server-request",
        "agent_key": public_key_b64(agent),
        "enterprise_key": public_key_b64(enterprise),
        "amount_minor": 1,
        "currency": "USD",
        "destination": "merchant",
    }
    result = client.post("/requests", json={"request": request, "agent_signature": sign_payload(agent, request)})
    assert result.status_code == 201
    monkeypatch.delenv("TRUST404_ALLOWED_AGENT_KEYS")
    with pytest.raises(ValueError, match="TRUST404_ALLOWED_AGENT_KEYS"):
        load_app_from_env()


def test_keygen_writes_private_key_with_owner_only_permissions(tmp_path):
    from trust404.cli import main

    private_file = tmp_path / "issuer.key"
    assert main(["keygen", "--out", str(private_file)]) == 0
    assert private_file.exists()
    assert (private_file.stat().st_mode & 0o777) == 0o600
    assert (tmp_path / "issuer.pub").read_text().strip()
    assert main(["keygen", "--out", str(private_file)]) == 2
