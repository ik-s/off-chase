import os
import subprocess
import sys


def test_compose_setup_creates_private_keys_and_does_not_overwrite(tmp_path):
    command = [sys.executable, "scripts/prepare_compose.py", "--project-root", str(tmp_path)]
    env = {**os.environ, "PYTHONPATH": "src"}
    first = subprocess.run(command, env=env, text=True, capture_output=True, check=False)
    assert first.returncode == 0, first.stderr
    settings = tmp_path / ".env"
    assert settings.exists()
    assert settings.stat().st_mode & 0o777 == 0o600
    for role in ("issuer", "agent", "enterprise", "witness"):
        key = tmp_path / ".local" / f"{role}.key"
        public = tmp_path / ".local" / f"{role}.pub"
        assert key.exists() and public.exists()
        assert key.stat().st_mode & 0o777 == 0o600
        assert key.read_text().strip() not in first.stdout
    before = settings.read_bytes()
    repeated = subprocess.run(command, env=env, text=True, capture_output=True, check=False)
    assert repeated.returncode == 2
    assert settings.read_bytes() == before
