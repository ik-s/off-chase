"""Create local, untracked keys and tokens for the two-container demonstration."""

import argparse
import os
import secrets
import sys
from pathlib import Path

from trust404.crypto import generate_private_key, private_key_b64, public_key_b64


def _write_private(path: Path, value: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="ascii") as stream:
        stream.write(value + "\n")


def prepare(project_root: Path) -> None:
    local = project_root / ".local"
    settings = project_root / ".env"
    targets = [settings, *(local / f"{role}.{extension}" for role in ("issuer", "agent", "enterprise", "witness") for extension in ("key", "pub"))]
    existing = [path for path in targets if path.exists()]
    if existing:
        raise ValueError(f"refusing to overwrite existing file: {existing[0]}")
    local.mkdir(parents=True, exist_ok=True)
    keys = {role: generate_private_key() for role in ("issuer", "agent", "enterprise", "witness")}
    for role, key in keys.items():
        _write_private(local / f"{role}.key", private_key_b64(key))
        (local / f"{role}.pub").write_text(public_key_b64(key) + "\n", encoding="ascii")
    lines = [
        f"ISSUER_PUBLIC_KEY={public_key_b64(keys['issuer'])}",
        f"AGENT_PUBLIC_KEY={public_key_b64(keys['agent'])}",
        f"WITNESS_PUBLIC_KEY={public_key_b64(keys['witness'])}",
        f"OPERATOR_TOKEN={secrets.token_urlsafe(32)}",
        f"WITNESS_TOKEN={secrets.token_urlsafe(32)}",
    ]
    _write_private(settings, "\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    try:
        prepare(args.project_root)
    except (OSError, ValueError) as exc:
        print(f"Cannot prepare Compose demo: {exc}", file=sys.stderr)
        return 2
    print(f"Local Compose keys and settings written under {args.project_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
