"""Local HTTP adapter around the signed ledger."""

import hmac

from fastapi import FastAPI, Header, HTTPException

from .ledger import Ledger


def create_app(ledger: Ledger, *, decision_token: str, allowed_agent_keys: set[str] | None = None) -> FastAPI:
    if not decision_token:
        raise ValueError("decision_token must not be empty")
    app = FastAPI(title="TRUST404 decision log", version="0.1.0")

    def require_token(authorization: str | None) -> None:
        expected = f"Bearer {decision_token}"
        if authorization is None or not hmac.compare_digest(authorization, expected):
            raise HTTPException(status_code=401, detail="operator token required")

    @app.post("/requests", status_code=201)
    def accept(payload: dict):
        if set(payload) != {"request", "agent_signature"} or type(payload["request"]) is not dict:
            raise HTTPException(status_code=400, detail="invalid acceptance payload")
        request = payload["request"]
        agent_key = request.get("agent_key")
        if type(agent_key) is not str:
            raise HTTPException(status_code=400, detail="invalid agent key")
        if allowed_agent_keys is not None and agent_key not in allowed_agent_keys:
            raise HTTPException(status_code=403, detail="agent key not allowed")
        try:
            return ledger.accept(request, payload["agent_signature"])
        except ValueError as exc:
            code = 409 if "already accepted" in str(exc) else 400
            raise HTTPException(status_code=code, detail=str(exc)) from exc

    @app.post("/requests/{request_id}/decision", status_code=201)
    def decide(request_id: str, payload: dict, authorization: str | None = Header(default=None)):
        require_token(authorization)
        if set(payload) != {"policy", "policy_signature"} or type(payload["policy"]) is not dict:
            raise HTTPException(status_code=400, detail="invalid decision payload")
        try:
            return ledger.decide(request_id, payload["policy"], payload["policy_signature"])
        except ValueError as exc:
            message = str(exc)
            code = 404 if "not accepted" in message else 409 if "already decided" in message else 400
            raise HTTPException(status_code=code, detail=message) from exc

    @app.get("/proof")
    def proof(authorization: str | None = Header(default=None)):
        require_token(authorization)
        return ledger.export_proof()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app
