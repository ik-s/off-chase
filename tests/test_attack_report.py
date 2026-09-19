import json
import os
import subprocess
import sys

from trust404.cli import main


def test_attack_report_runs_all_five_cases_and_shows_external_evidence_boundary(tmp_path):
    assert main(["demo", "--out", str(tmp_path)]) == 0
    result = subprocess.run(
        [sys.executable, "scripts/attack_report.py", "--demo-dir", str(tmp_path)],
        env={**os.environ, "PYTHONPATH": "src"}, text=True, capture_output=True, check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["normal_verified"] is True
    assert report["attacks_detected"] == 5
    assert report["attacks_total"] == 5
    assert report["resigned_erasure"]["without_external_evidence_verified"] is True
    assert report["resigned_erasure"]["held_acceptance_detected"] is True
    assert report["resigned_erasure"]["prior_witness_detected"] is True
