"""Generate a local demonstration and verify portable proofs."""

import argparse
import copy
import json
import os
import sys
import tempfile
from pathlib import Path

from .benchmark import run_benchmark
from .crypto import (
    generate_private_key,
    load_private_key,
    private_key_b64,
    public_key_b64,
    sign_payload,
)
from .ledger import Ledger
from .verify import checkpoint_digest, verify_proof
from .witness import Witness, verify_witness_receipt


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _strict_pairs(pairs: list[tuple[str, object]]) -> dict:
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError(f"duplicate JSON key: {key}")
        obj[key] = value
    return obj


def load_json_strict(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_strict_pairs)


def _keygen(path: Path) -> int:
    public_path = path.with_suffix(".pub")
    if public_path.exists():
        print(f"Cannot create key: {public_path} already exists", file=sys.stderr)
        return 2
    key = generate_private_key()
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="ascii") as stream:
            stream.write(private_key_b64(key) + "\n")
        public_path.write_text(public_key_b64(key) + "\n", encoding="ascii")
    except OSError as exc:
        print(f"Cannot create key: {exc}", file=sys.stderr)
        return 2
    print(f"Private key: {path}; public key: {public_path}")
    return 0


def _demo(out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        return _demo_with_scratch(out, Path(directory))


def _demo_with_scratch(out: Path, scratch: Path) -> int:
    issuer = generate_private_key()
    agent = generate_private_key()
    enterprise = generate_private_key()
    witness_key = generate_private_key()
    request = {
        "request_id": "demo-request-001",
        "agent_key": public_key_b64(agent),
        "enterprise_key": public_key_b64(enterprise),
        "amount_minor": 1500,
        "currency": "USD",
        "destination": "demo-merchant",
    }
    policy = {"version": "demo-v1", "max_amount_minor": 1000, "currency": "USD"}
    agent_signature = sign_payload(agent, request)
    ledger = Ledger(scratch / "demo.db", issuer)
    acceptance = ledger.accept(request, agent_signature)
    ledger.decide(request["request_id"], policy, sign_payload(enterprise, policy))
    proof = ledger.export_proof()
    pin = checkpoint_digest(proof["checkpoint"])
    _write_json(out / "proof.json", proof)
    _write_json(out / "acceptance-receipt.json", acceptance)
    (out / "issuer.pub").write_text(public_key_b64(issuer) + "\n", encoding="ascii")
    (out / "checkpoint.pin").write_text(pin + "\n", encoding="ascii")
    witness_receipt = Witness(scratch / "witness.db", witness_key).anchor(proof, public_key_b64(issuer))
    _write_json(out / "witness-receipt.json", witness_receipt)
    (out / "witness.pub").write_text(public_key_b64(witness_key) + "\n", encoding="ascii")

    reason = copy.deepcopy(proof)
    reason["entries"][1]["body"]["reason"] = "OTHER_REASON"
    _write_json(out / "tampered-reason.json", reason)
    changed_policy = copy.deepcopy(proof)
    changed_policy["entries"][1]["body"]["policy"]["max_amount_minor"] = 2000
    _write_json(out / "tampered-policy.json", changed_policy)
    deleted = copy.deepcopy(proof)
    deleted["entries"].pop()
    _write_json(out / "deleted-decision.json", deleted)

    omitted_request = {**request, "request_id": "demo-request-omitted"}
    omitted_ledger = Ledger(scratch / "omitted.db", issuer)
    omitted_ledger.accept(omitted_request, sign_payload(agent, omitted_request))
    omitted_proof = omitted_ledger.export_proof()
    _write_json(out / "missing-decision.json", omitted_proof)
    (out / "missing-decision.pin").write_text(checkpoint_digest(omitted_proof["checkpoint"]) + "\n", encoding="ascii")
    print(f"Demo proof and four attack cases written to {out}")
    print("The .pin files are local examples; publish a checkpoint digest independently before trusting it as an external anchor.")
    return 0


def _verify(
    path: Path, issuer_key: str, pin: str | None, acceptance_paths: list[Path],
    witness_path: Path | None, witness_key: str | None,
    agent_keys: list[str], enterprise_keys: list[str],
) -> int:
    try:
        proof = load_json_strict(path)
        acceptances = [load_json_strict(item) for item in acceptance_paths]
        if witness_path is not None:
            witness_receipt = load_json_strict(witness_path)
            if not verify_witness_receipt(proof, witness_receipt, issuer_key, witness_key):
                print("INVALID\nINVALID_WITNESS_RECEIPT")
                return 1
            witnessed_pin = witness_receipt["checkpoint_hash"]
            if pin is not None and pin != witnessed_pin:
                print("INVALID\nCHECKPOINT_PIN_MISMATCH")
                return 1
            pin = witnessed_pin
        result = verify_proof(
            proof, issuer_public_key=issuer_key, expected_checkpoint_hash=pin,
            expected_acceptances=acceptances,
            expected_agent_keys=set(agent_keys) if agent_keys else None,
            expected_enterprise_keys=set(enterprise_keys) if enterprise_keys else None,
        )
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
        print(f"Cannot read proof: {exc}", file=sys.stderr)
        return 2
    if result.ok:
        print("VERIFIED")
        return 0
    print("INVALID")
    for problem in result.problems:
        print(problem)
    for request_id in result.missing_requests:
        print(f"missing decision for {request_id}")
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="trust404")
    commands = parser.add_subparsers(dest="command", required=True)
    demo = commands.add_parser("demo", help="write a self-contained local demonstration")
    demo.add_argument("--out", type=Path, required=True)
    verify = commands.add_parser("verify", help="verify proof without access to an operator database")
    verify.add_argument("proof", type=Path)
    verify.add_argument("--issuer-key", required=True, help="trusted Ed25519 public key, base64")
    verify.add_argument("--checkpoint-hash", help="independently obtained SHA-256 checkpoint digest")
    verify.add_argument("--witness-receipt", type=Path, help="checkpoint signed by a separately controlled witness")
    verify.add_argument("--witness-key", help="trusted witness Ed25519 public key, base64")
    verify.add_argument("--acceptance", action="append", type=Path, default=[], help="independently held signed acceptance receipt; repeatable")
    verify.add_argument("--agent-key", action="append", default=[], help="trusted agent public key; repeatable")
    verify.add_argument("--enterprise-key", action="append", default=[], help="trusted enterprise public key; repeatable")
    benchmark = commands.add_parser("benchmark", help="measure verification and four attack detections")
    benchmark.add_argument("--requests", type=int, default=1000)
    keygen = commands.add_parser("keygen", help="create an Ed25519 private and public key pair")
    keygen.add_argument("--out", type=Path, required=True, help="private key path, created with mode 0600")
    serve = commands.add_parser("serve", help="run the local HTTP service using TRUST404_* environment variables")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    anchor = commands.add_parser("witness-anchor", help="sign a checkpoint from a separately controlled witness database")
    anchor.add_argument("proof", type=Path)
    anchor.add_argument("--issuer-key", required=True)
    anchor.add_argument("--witness-key-file", type=Path, required=True)
    anchor.add_argument("--db", type=Path, required=True)
    anchor.add_argument("--out", type=Path, required=True)
    sign = commands.add_parser("sign", help="sign a JSON request or policy with a private key")
    sign.add_argument("input", type=Path)
    sign.add_argument("--key-file", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.command == "demo":
        try:
            return _demo(args.out)
        except (OSError, ValueError) as exc:
            print(f"Cannot create demo: {exc}", file=sys.stderr)
            return 2
    if args.command == "benchmark":
        try:
            print(json.dumps(run_benchmark(args.requests), indent=2))
            return 0
        except ValueError as exc:
            print(f"Cannot benchmark: {exc}", file=sys.stderr)
            return 2
    if args.command == "keygen":
        return _keygen(args.out)
    if args.command == "sign":
        try:
            if args.key_file.stat().st_mode & 0o077:
                raise ValueError("private key file must have owner-only permissions")
            key = load_private_key(args.key_file.read_text(encoding="ascii").strip())
            print(sign_payload(key, load_json_strict(args.input)))
            return 0
        except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
            print(f"Cannot sign JSON: {exc}", file=sys.stderr)
            return 2
    if args.command == "witness-anchor":
        try:
            if args.witness_key_file.stat().st_mode & 0o077:
                raise ValueError("witness private key file must have owner-only permissions")
            witness_key = load_private_key(args.witness_key_file.read_text(encoding="ascii").strip())
            proof = load_json_strict(args.proof)
            receipt = Witness(args.db, witness_key).anchor(proof, args.issuer_key)
            _write_json(args.out, receipt)
            print(f"Witness receipt written to {args.out}")
            return 0
        except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
            print(f"Cannot anchor proof: {exc}", file=sys.stderr)
            return 2
    if args.command == "serve":
        import uvicorn

        from .server import load_app_from_env

        try:
            app = load_app_from_env()
        except (OSError, ValueError) as exc:
            print(f"Cannot start server: {exc}", file=sys.stderr)
            return 2
        uvicorn.run(app, host=args.host, port=args.port)
        return 0
    if args.witness_receipt is None and args.checkpoint_hash is None:
        parser.error("provide --checkpoint-hash or --witness-receipt with --witness-key")
    if (args.witness_receipt is None) != (args.witness_key is None):
        parser.error("--witness-receipt and --witness-key must be provided together")
    return _verify(
        args.proof, args.issuer_key, args.checkpoint_hash, args.acceptance,
        args.witness_receipt, args.witness_key, args.agent_key, args.enterprise_key,
    )


if __name__ == "__main__":
    raise SystemExit(main())
