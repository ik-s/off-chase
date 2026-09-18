"""Verify the five supplied attack fixtures and report their detection paths."""

import argparse
import json
import sys
from pathlib import Path

from trust404.cli import load_json_strict
from trust404.verify import verify_proof
from trust404.witness import verify_witness_receipt


def report(directory: Path) -> dict:
    issuer_key = (directory / "issuer.pub").read_text(encoding="ascii").strip()
    witness_key = (directory / "witness.pub").read_text(encoding="ascii").strip()
    pin = (directory / "checkpoint.pin").read_text(encoding="ascii").strip()
    normal = load_json_strict(directory / "proof.json")
    witness_receipt = load_json_strict(directory / "witness-receipt.json")
    acceptance = load_json_strict(directory / "acceptance-receipt.json")
    normal_result = verify_proof(
        normal, issuer_public_key=issuer_key, expected_checkpoint_hash=pin,
        expected_acceptances=[acceptance],
    )
    normal_verified = normal_result.ok and verify_witness_receipt(normal, witness_receipt, issuer_key, witness_key)
    cases = {}
    for name, filename, case_pin in (
        ("tampered_reason", "tampered-reason.json", pin),
        ("tampered_policy", "tampered-policy.json", pin),
        ("deleted_decision", "deleted-decision.json", pin),
        ("missing_decision", "missing-decision.json", (directory / "missing-decision.pin").read_text(encoding="ascii").strip()),
    ):
        result = verify_proof(
            load_json_strict(directory / filename), issuer_public_key=issuer_key,
            expected_checkpoint_hash=case_pin,
        )
        cases[name] = {"detected": not result.ok, "problems": result.problems}
    rewritten = load_json_strict(directory / "rewritten-history.json")
    rewritten_pin = (directory / "rewritten-history.pin").read_text(encoding="ascii").strip()
    without_external_evidence = verify_proof(
        rewritten, issuer_public_key=issuer_key, expected_checkpoint_hash=rewritten_pin,
    )
    with_held_acceptance = verify_proof(
        rewritten, issuer_public_key=issuer_key, expected_checkpoint_hash=rewritten_pin,
        expected_acceptances=[acceptance],
    )
    resigned_erasure = {
        "without_external_evidence_verified": without_external_evidence.ok,
        "held_acceptance_detected": "ACCEPTANCE_OMITTED" in with_held_acceptance.problems,
        "prior_witness_detected": not verify_witness_receipt(rewritten, witness_receipt, issuer_key, witness_key),
    }
    cases["resigned_erasure"] = {
        "detected": resigned_erasure["held_acceptance_detected"] and resigned_erasure["prior_witness_detected"],
        "problems": with_held_acceptance.problems,
    }
    return {
        "normal_verified": normal_verified,
        "attacks_detected": sum(case["detected"] for case in cases.values()),
        "attacks_total": len(cases),
        "cases": cases,
        "resigned_erasure": resigned_erasure,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = report(args.demo_dir)
    except (OSError, UnicodeError, ValueError, KeyError, TypeError) as exc:
        print(f"Attack report failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2))
    return 0 if result["normal_verified"] and result["attacks_detected"] == result["attacks_total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
