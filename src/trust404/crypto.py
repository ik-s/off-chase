"""Canonical JSON and Ed25519 signatures used by the proof format."""

import base64
import hashlib
import json

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)


def canonical_bytes(value: object) -> bytes:
    """Encode the restricted JSON data model used in signed records."""
    def validate(item: object) -> None:
        if item is None or type(item) in (str, int, bool):
            return
        if type(item) is list:
            for child in item:
                validate(child)
            return
        if type(item) is dict and all(type(key) is str for key in item):
            for child in item.values():
                validate(child)
            return
        raise ValueError("signed data must contain only JSON strings, integers, booleans, lists, objects, or null")

    validate(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def digest(value: object) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def generate_private_key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.generate()


def private_key_b64(key: Ed25519PrivateKey) -> str:
    return base64.b64encode(key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())).decode("ascii")


def load_private_key(encoded: str) -> Ed25519PrivateKey:
    raw = base64.b64decode(encoded, validate=True)
    if len(raw) != 32:
        raise ValueError("invalid Ed25519 private key length")
    return Ed25519PrivateKey.from_private_bytes(raw)


def public_key_b64(key: Ed25519PrivateKey) -> str:
    return base64.b64encode(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode("ascii")


def sign_payload(key: Ed25519PrivateKey, payload: object) -> str:
    return base64.b64encode(key.sign(canonical_bytes(payload))).decode("ascii")


def verify_payload(public_key: str, payload: object, signature: str) -> bool:
    try:
        raw_key = base64.b64decode(public_key, validate=True)
        raw_signature = base64.b64decode(signature, validate=True)
        if len(raw_key) != 32 or len(raw_signature) != 64:
            return False
        Ed25519PublicKey.from_public_bytes(raw_key).verify(raw_signature, canonical_bytes(payload))
        return True
    except (ValueError, TypeError, InvalidSignature):
        return False
