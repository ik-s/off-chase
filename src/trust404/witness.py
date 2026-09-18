"""Independent, append-only witness for signed checkpoints."""

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from .crypto import (
    canonical_bytes,
    digest,
    public_key_b64,
    sign_payload,
    verify_payload,
)
from .verify import checkpoint_digest, verify_proof

GENESIS_RECEIPT_HASH = "0" * 64
RECEIPT_FIELDS = {
    "witness_seq", "issuer_key", "checkpoint_hash", "size", "head_hash",
    "previous_receipt_hash", "issued_at", "signature", "receipt_hash",
}


def verify_witness_receipt(proof: dict, receipt: dict, issuer_public_key: str, witness_public_key: str) -> bool:
    if type(proof) is not dict or type(receipt) is not dict or set(receipt) != RECEIPT_FIELDS:
        return False
    try:
        checkpoint = proof["checkpoint"]
        unsigned = {key: receipt[key] for key in RECEIPT_FIELDS - {"signature", "receipt_hash"}}
        signed = {**unsigned, "signature": receipt["signature"]}
        return (
            type(receipt["witness_seq"]) is int and receipt["witness_seq"] > 0
            and receipt["issuer_key"] == issuer_public_key
            and receipt["checkpoint_hash"] == checkpoint_digest(checkpoint)
            and receipt["size"] == checkpoint["size"]
            and receipt["head_hash"] == checkpoint["head_hash"]
            and digest(signed) == receipt["receipt_hash"]
            and verify_payload(witness_public_key, unsigned, receipt["signature"])
        )
    except (KeyError, TypeError, ValueError):
        return False


class Witness:
    """A separately controlled signer that refuses forks of checkpoints it has seen."""

    def __init__(self, path: str | Path, witness_key: Ed25519PrivateKey):
        self.path = str(path)
        self.witness_key = witness_key
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.execute("""CREATE TABLE IF NOT EXISTS anchors (
                witness_seq INTEGER PRIMARY KEY,
                issuer_key TEXT NOT NULL,
                size INTEGER NOT NULL,
                head_hash TEXT NOT NULL,
                checkpoint_hash TEXT NOT NULL,
                receipt TEXT NOT NULL
            )""")
            witness_public_key = public_key_b64(witness_key)
            db.execute("INSERT OR IGNORE INTO metadata (key, value) VALUES ('witness_key', ?)", (witness_public_key,))
            saved_key = db.execute("SELECT value FROM metadata WHERE key = 'witness_key'").fetchone()[0]
            if saved_key != witness_public_key:
                raise ValueError("witness key mismatch for existing witness database")

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=30)

    def anchor(self, proof: dict, issuer_public_key: str) -> dict:
        try:
            checkpoint = proof["checkpoint"]
            pin = checkpoint_digest(checkpoint)
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("invalid checkpoint") from exc
        verified = verify_proof(proof, issuer_public_key=issuer_public_key, expected_checkpoint_hash=pin)
        if any(problem != "MISSING_DECISION" for problem in verified.problems):
            raise ValueError(f"invalid proof: {', '.join(verified.problems)}")
        size = checkpoint["size"]
        head_hash = checkpoint["head_hash"]
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute(
                "SELECT size, head_hash, checkpoint_hash, receipt FROM anchors WHERE issuer_key = ? ORDER BY witness_seq DESC LIMIT 1",
                (issuer_public_key,),
            ).fetchone()
            if previous:
                old_size, old_head, old_pin, old_receipt_json = previous
                if size < old_size or (old_size and proof["entries"][old_size - 1]["entry_hash"] != old_head):
                    raise ValueError("checkpoint fork or rollback")
                if size == old_size:
                    if head_hash != old_head or pin != old_pin:
                        raise ValueError("checkpoint fork or rollback")
                    return json.loads(old_receipt_json)
                previous_hash = json.loads(old_receipt_json)["receipt_hash"]
            else:
                previous_hash = GENESIS_RECEIPT_HASH
            row = db.execute("SELECT COALESCE(MAX(witness_seq), 0) FROM anchors").fetchone()
            unsigned = {
                "witness_seq": row[0] + 1,
                "issuer_key": issuer_public_key,
                "checkpoint_hash": pin,
                "size": size,
                "head_hash": head_hash,
                "previous_receipt_hash": previous_hash,
                "issued_at": datetime.now(UTC).isoformat(timespec="seconds"),
            }
            receipt = {**unsigned, "signature": sign_payload(self.witness_key, unsigned)}
            receipt["receipt_hash"] = digest(receipt)
            db.execute(
                "INSERT INTO anchors (witness_seq, issuer_key, size, head_hash, checkpoint_hash, receipt) VALUES (?, ?, ?, ?, ?, ?)",
                (receipt["witness_seq"], issuer_public_key, size, head_hash, pin, canonical_bytes(receipt).decode("utf-8")),
            )
            return receipt
