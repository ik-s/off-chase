"""Exercise separate operator and witness services and save portable artifacts."""

import argparse
import json
import sys
import uuid
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request

from trust404.cli import _load_remote_json, _witness_base_url
from trust404.crypto import load_private_key, public_key_b64, sign_payload
from trust404.verify import verify_proof
from trust404.witness import verify_witness_history, verify_witness_receipt


def _load_settings(path: Path) -> dict[str, str]:
    return dict(line.split("=", 1) for line in path.read_text(encoding="ascii").splitlines() if line)


def _call(url: str, *, payload: object | None = None, token: str | None = None) -> object:
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = Request(url, data=body, headers=headers, method="POST" if body is not None else "GET")
    return _load_remote_json(request)


def run(project_root: Path, operator_url: str, witness_url: str) -> dict:
    settings = _load_settings(project_root / ".env")
    local = project_root / ".local"
    agent = load_private_key((local / "agent.key").read_text(encoding="ascii").strip())
    enterprise = load_private_key((local / "enterprise.key").read_text(encoding="ascii").strip())
    operator_url = _witness_base_url(operator_url)
    witness_url = _witness_base_url(witness_url)
    request = {
        "request_id": f"compose-{uuid.uuid4().hex[:12]}",
        "agent_key": public_key_b64(agent),
        "enterprise_key": public_key_b64(enterprise),
        "amount_minor": 1500,
        "currency": "USD",
        "destination": "compose-demo-merchant",
    }
    acceptance = _call(operator_url + "/requests", payload={"request": request, "agent_signature": sign_payload(agent, request)})
    policy = {"version": "compose-v1", "max_amount_minor": 1000, "currency": "USD"}
    decision = _call(
        operator_url + f"/requests/{request['request_id']}/decision",
        payload={"policy": policy, "policy_signature": sign_payload(enterprise, policy)},
        token=settings["OPERATOR_TOKEN"],
    )
    proof = _call(operator_url + "/proof", token=settings["OPERATOR_TOKEN"])
    issuer_key = settings["ISSUER_PUBLIC_KEY"]
    witness_key = settings["WITNESS_PUBLIC_KEY"]
    receipt = _call(
        witness_url + "/anchors", payload={"issuer_key": issuer_key, "proof": proof},
        token=settings["WITNESS_TOKEN"],
    )
    history = _call(witness_url + "/anchors?" + urlencode({"issuer_key": issuer_key}))
    verified = verify_proof(
        proof, issuer_public_key=issuer_key, expected_checkpoint_hash=receipt["checkpoint_hash"],
        expected_acceptances=[acceptance],
        expected_agent_keys={public_key_b64(agent)},
        expected_enterprise_keys={public_key_b64(enterprise)},
    )
    receipt_verified = verify_witness_receipt(proof, receipt, issuer_key, witness_key)
    history_verified = verify_witness_history(
        history, issuer_key, witness_key, expected_latest_hash=receipt["receipt_hash"],
    )
    if not (verified.ok and receipt_verified and history_verified):
        raise ValueError(f"verification failed: {verified.problems}")
    run_directory = local / "runs" / request["request_id"]
    run_directory.mkdir(parents=True, exist_ok=False)
    for name, value in (
        ("request.json", request), ("acceptance.json", acceptance), ("decision.json", decision),
        ("proof.json", proof), ("witness-receipt.json", receipt), ("witness-history.json", history),
    ):
        (run_directory / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {
        "request_id": request["request_id"],
        "decision": decision["body"]["result"],
        "entries": len(proof["entries"]),
        "proof_verified": verified.ok,
        "witness_receipt_verified": receipt_verified,
        "history_verified": history_verified,
        "artifacts": str(run_directory),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--operator-url", default="http://127.0.0.1:18000")
    parser.add_argument("--witness-url", default="http://127.0.0.1:18001")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.project_root, args.operator_url, args.witness_url), indent=2))
        return 0
    except (OSError, UnicodeError, ValueError, KeyError, TypeError) as exc:
        print(f"Compose smoke test failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
