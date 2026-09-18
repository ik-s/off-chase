import json
import os
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

from scripts.prepare_compose import prepare


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def test_smoke_script_checks_operator_and_witness_end_to_end(tmp_path):
    prepare(tmp_path)
    settings = dict(line.split("=", 1) for line in (tmp_path / ".env").read_text().splitlines() if line)
    operator_port, witness_port = free_port(), free_port()
    env = {
        **os.environ,
        "PYTHONPATH": "src",
        "TRUST404_DB": str(tmp_path / "operator.db"),
        "TRUST404_ISSUER_KEY_FILE": str(tmp_path / ".local" / "issuer.key"),
        "TRUST404_OPERATOR_TOKEN": settings["OPERATOR_TOKEN"],
        "TRUST404_ALLOWED_AGENT_KEYS": settings["AGENT_PUBLIC_KEY"],
        "TRUST404_WITNESS_DB": str(tmp_path / "witness.db"),
        "TRUST404_WITNESS_KEY_FILE": str(tmp_path / ".local" / "witness.key"),
        "TRUST404_WITNESS_TOKEN": settings["WITNESS_TOKEN"],
        "TRUST404_WITNESS_ALLOWED_ISSUER_KEYS": settings["ISSUER_PUBLIC_KEY"],
    }
    services = [
        subprocess.Popen(
            [sys.executable, "-m", "trust404.cli", command, "--port", str(port)],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
        )
        for command, port in (("serve", operator_port), ("witness-serve", witness_port))
    ]
    try:
        for process, port in zip(services, (operator_port, witness_port)):
            for _ in range(60):
                try:
                    if json.load(urlopen(f"http://127.0.0.1:{port}/health", timeout=0.2))["status"] == "ok":
                        break
                except (OSError, URLError):
                    if process.poll() is not None:
                        raise AssertionError(process.stderr.read())
                    time.sleep(0.1)
            else:
                raise AssertionError(f"service on {port} did not start")
        result = subprocess.run(
            [sys.executable, "scripts/compose_smoke.py", "--project-root", str(tmp_path),
             "--operator-url", f"http://127.0.0.1:{operator_port}",
             "--witness-url", f"http://127.0.0.1:{witness_port}"],
            env=env, text=True, capture_output=True, check=False,
        )
        assert result.returncode == 0, result.stderr
        report = json.loads(result.stdout)
        assert report["decision"] == "REJECTED"
        assert report["proof_verified"] is True
        assert report["witness_receipt_verified"] is True
        assert report["history_verified"] is True
        assert (tmp_path / ".local" / "runs" / report["request_id"] / "proof.json").exists()
    finally:
        for process in services:
            process.terminate()
            process.wait(timeout=5)
