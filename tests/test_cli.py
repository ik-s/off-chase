import json
import os
import subprocess
import sys


def run_cli(*args):
    env = {**os.environ, "PYTHONPATH": "src"}
    return subprocess.run([sys.executable, "-m", "trust404.cli", *map(str, args)], text=True, capture_output=True, env=env, check=False)


def test_demo_produces_portable_verifiable_and_attack_proofs(tmp_path):
    demo = run_cli("demo", "--out", tmp_path)
    assert demo.returncode == 0, demo.stderr
    issuer_key = (tmp_path / "issuer.pub").read_text().strip()
    pin = (tmp_path / "checkpoint.pin").read_text().strip()
    normal = run_cli("verify", tmp_path / "proof.json", "--issuer-key", issuer_key, "--checkpoint-hash", pin)
    assert normal.returncode == 0, normal.stderr
    assert "VERIFIED" in normal.stdout
    for name in ("tampered-reason.json", "tampered-policy.json", "deleted-decision.json"):
        attack = run_cli("verify", tmp_path / name, "--issuer-key", issuer_key, "--checkpoint-hash", pin)
        assert attack.returncode == 1, name
        assert "INVALID" in attack.stdout
    missing_pin = (tmp_path / "missing-decision.pin").read_text().strip()
    missing = run_cli("verify", tmp_path / "missing-decision.json", "--issuer-key", issuer_key, "--checkpoint-hash", missing_pin)
    assert missing.returncode == 1
    assert "MISSING_DECISION" in missing.stdout


def test_duplicate_json_keys_are_rejected(tmp_path):
    proof = tmp_path / "ambiguous.json"
    proof.write_text('{"format":"trust404-proof-v1","format":"other","entries":[],"checkpoint":{}}')
    result = run_cli("verify", proof, "--issuer-key", "x", "--checkpoint-hash", "0" * 64)
    assert result.returncode == 2
    assert "duplicate JSON key" in result.stderr


def test_cli_accepts_independently_held_acceptance_receipt(tmp_path):
    assert run_cli("demo", "--out", tmp_path).returncode == 0
    issuer_key = (tmp_path / "issuer.pub").read_text().strip()
    pin = (tmp_path / "checkpoint.pin").read_text().strip()
    result = run_cli(
        "verify", tmp_path / "proof.json", "--issuer-key", issuer_key,
        "--checkpoint-hash", pin, "--acceptance", tmp_path / "acceptance-receipt.json",
    )
    assert result.returncode == 0, result.stderr


def test_demo_witness_receipt_can_replace_manual_pin(tmp_path):
    assert run_cli("demo", "--out", tmp_path).returncode == 0
    issuer_key = (tmp_path / "issuer.pub").read_text().strip()
    witness_key = (tmp_path / "witness.pub").read_text().strip()
    result = run_cli(
        "verify", tmp_path / "proof.json", "--issuer-key", issuer_key,
        "--witness-receipt", tmp_path / "witness-receipt.json", "--witness-key", witness_key,
    )
    assert result.returncode == 0, result.stderr


def test_demo_can_be_regenerated_in_same_directory(tmp_path):
    assert run_cli("demo", "--out", tmp_path).returncode == 0
    repeated = run_cli("demo", "--out", tmp_path)
    assert repeated.returncode == 0, repeated.stderr


def test_separate_witness_process_can_anchor_proof(tmp_path):
    assert run_cli("demo", "--out", tmp_path / "demo").returncode == 0
    key_file = tmp_path / "witness.key"
    assert run_cli("keygen", "--out", key_file).returncode == 0
    issuer_key = (tmp_path / "demo" / "issuer.pub").read_text().strip()
    witness_key = (tmp_path / "witness.pub").read_text().strip()
    receipt = tmp_path / "separate-receipt.json"
    anchored = run_cli(
        "witness-anchor", tmp_path / "demo" / "proof.json",
        "--issuer-key", issuer_key, "--witness-key-file", key_file,
        "--db", tmp_path / "witness.db", "--out", receipt,
    )
    assert anchored.returncode == 0, anchored.stderr
    verified = run_cli(
        "verify", tmp_path / "demo" / "proof.json", "--issuer-key", issuer_key,
        "--witness-receipt", receipt, "--witness-key", witness_key,
    )
    assert verified.returncode == 0, verified.stderr


def test_sign_command_signs_strict_json_without_exposing_private_key(tmp_path):
    from trust404.crypto import verify_payload

    key_file = tmp_path / "agent.key"
    assert run_cli("keygen", "--out", key_file).returncode == 0
    payload = {"request_id": "example", "amount_minor": 1}
    input_file = tmp_path / "request.json"
    input_file.write_text(json.dumps(payload))
    signed = run_cli("sign", input_file, "--key-file", key_file)
    assert signed.returncode == 0, signed.stderr
    assert verify_payload((tmp_path / "agent.pub").read_text().strip(), payload, signed.stdout.strip())


def test_cli_rejects_untrusted_agent_identity(tmp_path):
    assert run_cli("demo", "--out", tmp_path).returncode == 0
    issuer_key = (tmp_path / "issuer.pub").read_text().strip()
    pin = (tmp_path / "checkpoint.pin").read_text().strip()
    result = run_cli(
        "verify", tmp_path / "proof.json", "--issuer-key", issuer_key,
        "--checkpoint-hash", pin, "--agent-key", "a-different-key",
    )
    assert result.returncode == 1
    assert "UNTRUSTED_AGENT_KEY" in result.stdout


def test_resigned_history_erasure_needs_independently_held_evidence(tmp_path):
    assert run_cli("demo", "--out", tmp_path).returncode == 0
    issuer_key = (tmp_path / "issuer.pub").read_text().strip()
    rewritten_pin = (tmp_path / "rewritten-history.pin").read_text().strip()
    rewritten = tmp_path / "rewritten-history.json"
    no_external_evidence = run_cli(
        "verify", rewritten, "--issuer-key", issuer_key, "--checkpoint-hash", rewritten_pin,
    )
    assert no_external_evidence.returncode == 0
    held_receipt = run_cli(
        "verify", rewritten, "--issuer-key", issuer_key, "--checkpoint-hash", rewritten_pin,
        "--acceptance", tmp_path / "acceptance-receipt.json",
    )
    assert held_receipt.returncode == 1
    assert "ACCEPTANCE_OMITTED" in held_receipt.stdout
    prior_witness = run_cli(
        "verify", rewritten, "--issuer-key", issuer_key,
        "--witness-receipt", tmp_path / "witness-receipt.json",
        "--witness-key", (tmp_path / "witness.pub").read_text().strip(),
    )
    assert prior_witness.returncode == 1
    assert "INVALID_WITNESS_RECEIPT" in prior_witness.stdout
