"""Small deterministic policy used by the MVP."""

from .crypto import digest


def validate_request(request: dict) -> None:
    if type(request) is not dict or set(request) != {"request_id", "agent_key", "enterprise_key", "amount_minor", "currency", "destination"}:
        raise ValueError("invalid request fields")
    for key in ("request_id", "agent_key", "enterprise_key", "currency", "destination"):
        if type(request[key]) is not str or not request[key]:
            raise ValueError(f"invalid {key}")
    if type(request["amount_minor"]) is not int or request["amount_minor"] <= 0:
        raise ValueError("amount_minor must be a positive integer")


def validate_policy(policy: dict) -> None:
    if type(policy) is not dict or set(policy) != {"version", "max_amount_minor", "currency"}:
        raise ValueError("invalid policy fields")
    if type(policy["version"]) is not str or not policy["version"]:
        raise ValueError("invalid policy version")
    if type(policy["currency"]) is not str or not policy["currency"]:
        raise ValueError("invalid policy currency")
    if type(policy["max_amount_minor"]) is not int or policy["max_amount_minor"] < 0:
        raise ValueError("max_amount_minor must be a nonnegative integer")


def evaluate(request: dict, policy: dict) -> tuple[str, str]:
    validate_request(request)
    validate_policy(policy)
    if request["currency"] != policy["currency"]:
        return "REJECTED", "CURRENCY_NOT_ALLOWED"
    if request["amount_minor"] > policy["max_amount_minor"]:
        return "REJECTED", "AMOUNT_LIMIT"
    return "APPROVED", "POLICY_PASSED"


def policy_hash(policy: dict) -> str:
    validate_policy(policy)
    return digest(policy)
