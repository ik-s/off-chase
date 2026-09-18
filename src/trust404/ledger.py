"""Transactional SQLite event log and portable proof export."""

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
from .policy import evaluate, policy_hash, validate_request

GENESIS_HASH = "0" * 64


class Ledger:
    def __init__(self, path: str | Path, issuer_key: Ed25519PrivateKey):
        self.path = str(path)
        self.issuer_key = issuer_key
        self.issuer_public_key = public_key_b64(issuer_key)
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.execute("""CREATE TABLE IF NOT EXISTS entries (
                seq INTEGER PRIMARY KEY,
                kind TEXT NOT NULL,
                request_id TEXT NOT NULL,
                payload TEXT NOT NULL,
                entry_hash TEXT NOT NULL,
                UNIQUE (kind, request_id)
            )""")
            db.execute("INSERT OR IGNORE INTO metadata (key, value) VALUES ('issuer_key', ?)", (self.issuer_public_key,))
            saved_key = db.execute("SELECT value FROM metadata WHERE key = 'issuer_key'").fetchone()[0]
            if saved_key != self.issuer_public_key:
                raise ValueError("issuer key mismatch for existing ledger")

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=30)

    def _append(self, db: sqlite3.Connection, kind: str, request_id: str, body: dict) -> dict:
        last = db.execute("SELECT seq, entry_hash FROM entries ORDER BY seq DESC LIMIT 1").fetchone()
        seq = last[0] + 1 if last else 1
        unsigned = {
            "seq": seq,
            "kind": kind,
            "body": body,
            "prev_hash": last[1] if last else GENESIS_HASH,
            "created_at": datetime.now(UTC).isoformat(timespec="microseconds"),
        }
        entry = {**unsigned, "signature": sign_payload(self.issuer_key, unsigned)}
        entry["entry_hash"] = digest(entry)
        db.execute(
            "INSERT INTO entries (seq, kind, request_id, payload, entry_hash) VALUES (?, ?, ?, ?, ?)",
            (seq, kind, request_id, canonical_bytes(entry).decode("utf-8"), entry["entry_hash"]),
        )
        return entry

    def accept(self, request: dict, agent_signature: str) -> dict:
        validate_request(request)
        if not verify_payload(request["agent_key"], request, agent_signature):
            raise ValueError("invalid agent signature")
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM entries WHERE kind = 'ACCEPT' AND request_id = ?", (request["request_id"],)).fetchone():
                raise ValueError("request already accepted")
            return self._append(db, "ACCEPT", request["request_id"], {"request": request, "agent_signature": agent_signature})

    def decide(self, request_id: str, policy: dict, policy_signature: str) -> dict:
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            accepted = db.execute("SELECT payload FROM entries WHERE kind = 'ACCEPT' AND request_id = ?", (request_id,)).fetchone()
            if accepted is None:
                raise ValueError("request not accepted")
            if db.execute("SELECT 1 FROM entries WHERE kind = 'DECISION' AND request_id = ?", (request_id,)).fetchone():
                raise ValueError("request already decided")
            accept_entry = json.loads(accepted[0])
            request = accept_entry["body"]["request"]
            result, reason = evaluate(request, policy)
            if not verify_payload(request["enterprise_key"], policy, policy_signature):
                raise ValueError("invalid enterprise policy signature")
            body = {
                "request_id": request_id,
                "accept_hash": accept_entry["entry_hash"],
                "policy": policy,
                "policy_hash": policy_hash(policy),
                "policy_signature": policy_signature,
                "result": result,
                "reason": reason,
            }
            return self._append(db, "DECISION", request_id, body)

    def export_proof(self) -> dict:
        with self._connect() as db:
            rows = db.execute("SELECT payload FROM entries ORDER BY seq").fetchall()
        entries = [json.loads(row[0]) for row in rows]
        checkpoint_body = {"size": len(entries), "head_hash": entries[-1]["entry_hash"] if entries else GENESIS_HASH}
        checkpoint = {**checkpoint_body, "signature": sign_payload(self.issuer_key, checkpoint_body)}
        return {"format": "trust404-proof-v1", "entries": entries, "checkpoint": checkpoint}
