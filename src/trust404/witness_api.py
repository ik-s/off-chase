"""HTTP adapter for an independently operated checkpoint witness."""

import hmac

from fastapi import FastAPI, Header, HTTPException, Query

from .witness import Witness


def create_witness_app(witness: Witness, *, allowed_issuer_keys: set[str], anchor_token: str) -> FastAPI:
    if not allowed_issuer_keys or not anchor_token:
        raise ValueError("witness requires issuer allowlist and anchor token")
    app = FastAPI(title="TRUST404 witness", version="0.1.0")

    @app.post("/anchors", status_code=201)
    def anchor(payload: dict, authorization: str | None = Header(default=None)):
        if authorization is None or not hmac.compare_digest(authorization, f"Bearer {anchor_token}"):
            raise HTTPException(status_code=401, detail="witness token required")
        if set(payload) != {"issuer_key", "proof"} or type(payload["issuer_key"]) is not str:
            raise HTTPException(status_code=400, detail="invalid anchor payload")
        issuer_key = payload["issuer_key"]
        if issuer_key not in allowed_issuer_keys:
            raise HTTPException(status_code=403, detail="issuer key not allowed")
        try:
            return witness.anchor(payload["proof"], issuer_key)
        except ValueError as exc:
            code = 409 if "fork or rollback" in str(exc) else 400
            raise HTTPException(status_code=code, detail=str(exc)) from exc

    @app.get("/anchors")
    def history(issuer_key: str = Query(...)):
        if issuer_key not in allowed_issuer_keys:
            raise HTTPException(status_code=403, detail="issuer key not allowed")
        return witness.history(issuer_key)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app
