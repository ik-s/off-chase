"""Configuration and launcher for the local HTTP service."""

import os
from pathlib import Path

from fastapi import FastAPI

from .api import create_app
from .crypto import load_private_key
from .ledger import Ledger
from .witness import Witness
from .witness_api import create_witness_app


def load_app_from_env() -> FastAPI:
    required = (
        "TRUST404_DB", "TRUST404_ISSUER_KEY_FILE", "TRUST404_OPERATOR_TOKEN",
        "TRUST404_ALLOWED_AGENT_KEYS",
    )
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise ValueError(f"missing required environment variable: {', '.join(missing)}")
    key_path = Path(os.environ["TRUST404_ISSUER_KEY_FILE"])
    if key_path.stat().st_mode & 0o077:
        raise ValueError("issuer private key file must have owner-only permissions")
    issuer = load_private_key(key_path.read_text(encoding="ascii").strip())
    allowed_keys = {item.strip() for item in os.environ["TRUST404_ALLOWED_AGENT_KEYS"].split(",") if item.strip()}
    if not allowed_keys:
        raise ValueError("TRUST404_ALLOWED_AGENT_KEYS must contain at least one key")
    ledger = Ledger(os.environ["TRUST404_DB"], issuer)
    return create_app(ledger, decision_token=os.environ["TRUST404_OPERATOR_TOKEN"], allowed_agent_keys=allowed_keys)


def load_witness_app_from_env() -> FastAPI:
    required = (
        "TRUST404_WITNESS_DB", "TRUST404_WITNESS_KEY_FILE", "TRUST404_WITNESS_TOKEN",
        "TRUST404_WITNESS_ALLOWED_ISSUER_KEYS",
    )
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise ValueError(f"missing required environment variable: {', '.join(missing)}")
    key_path = Path(os.environ["TRUST404_WITNESS_KEY_FILE"])
    if key_path.stat().st_mode & 0o077:
        raise ValueError("witness private key file must have owner-only permissions")
    witness_key = load_private_key(key_path.read_text(encoding="ascii").strip())
    allowed_keys = {
        item.strip() for item in os.environ["TRUST404_WITNESS_ALLOWED_ISSUER_KEYS"].split(",") if item.strip()
    }
    if not allowed_keys:
        raise ValueError("TRUST404_WITNESS_ALLOWED_ISSUER_KEYS must contain at least one key")
    witness = Witness(os.environ["TRUST404_WITNESS_DB"], witness_key)
    return create_witness_app(
        witness, allowed_issuer_keys=allowed_keys, anchor_token=os.environ["TRUST404_WITNESS_TOKEN"],
    )
