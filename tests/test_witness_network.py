import json
import os
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import Request, urlopen

import pytest

from trust404.cli import _load_remote_json, main


def test_separate_witness_server_round_trip(tmp_path):
    demo = tmp_path / "demo"
    assert main(["demo", "--out", str(demo)]) == 0
    key_file = tmp_path / "witness.key"
    assert main(["keygen", "--out", str(key_file)]) == 0
    issuer_key = (demo / "issuer.pub").read_text().strip()
    witness_key = (tmp_path / "witness.pub").read_text().strip()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "TRUST404_WITNESS_DB": str(tmp_path / "witness.db"),
        "TRUST404_WITNESS_KEY_FILE": str(key_file),
        "TRUST404_WITNESS_TOKEN": "network-secret",
        "TRUST404_WITNESS_ALLOWED_ISSUER_KEYS": issuer_key,
    }
    process = subprocess.Popen(
        [sys.executable, "-m", "trust404.cli", "witness-serve", "--port", str(port)],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    try:
        for _ in range(60):
            try:
                if json.load(urlopen(url + "/health", timeout=0.2))["status"] == "ok":
                    break
            except (OSError, URLError):
                if process.poll() is not None:
                    raise AssertionError(process.stderr.read())
                time.sleep(0.1)
        else:
            raise AssertionError("witness server did not start")
        receipt = tmp_path / "remote-receipt.json"
        submitted = subprocess.run(
            [sys.executable, "-m", "trust404.cli", "witness-submit", str(demo / "proof.json"),
             "--url", url, "--issuer-key", issuer_key, "--witness-key", witness_key,
             "--out", str(receipt)],
            env=env, text=True, capture_output=True, check=False,
        )
        assert submitted.returncode == 0, submitted.stderr
        receipt_hash = json.loads(receipt.read_text())["receipt_hash"]
        history = subprocess.run(
            [sys.executable, "-m", "trust404.cli", "witness-history", "--url", url,
             "--issuer-key", issuer_key, "--witness-key", witness_key,
             "--expected-latest-hash", receipt_hash],
            env=env, text=True, capture_output=True, check=False,
        )
        assert history.returncode == 0, history.stderr
        assert "VERIFIED" in history.stdout
    finally:
        process.terminate()
        process.wait(timeout=5)


def test_witness_client_does_not_follow_bearer_token_redirects():
    redirected_requests = []

    class Destination(BaseHTTPRequestHandler):
        def do_GET(self):
            redirected_requests.append(self.headers.get("Authorization"))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *_args):
            pass

    destination = ThreadingHTTPServer(("127.0.0.1", 0), Destination)

    class Redirect(BaseHTTPRequestHandler):
        def do_POST(self):
            self.send_response(302)
            self.send_header("Location", f"http://127.0.0.1:{destination.server_port}/elsewhere")
            self.end_headers()

        def log_message(self, *_args):
            pass

    redirect = ThreadingHTTPServer(("127.0.0.1", 0), Redirect)
    threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in (destination, redirect)]
    for thread in threads:
        thread.start()
    try:
        request = Request(
            f"http://127.0.0.1:{redirect.server_port}/anchors", data=b"{}", method="POST",
            headers={"Authorization": "Bearer secret", "Content-Type": "application/json"},
        )
        with pytest.raises(URLError):
            _load_remote_json(request)
        assert redirected_requests == []
    finally:
        for server in (destination, redirect):
            server.shutdown()
            server.server_close()
