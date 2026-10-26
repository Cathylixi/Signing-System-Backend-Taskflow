from __future__ import annotations

import base64
import json
from dataclasses import dataclass

import azure.functions as func

from .config import Settings


class AuthorizationError(Exception):
    pass


@dataclass(frozen=True)
class AdminPrincipal:
    email: str
    user_id: str


def require_admin(req: func.HttpRequest, settings: Settings) -> AdminPrincipal:
    if settings.is_local and settings.allow_local_anonymous:
        return AdminPrincipal(email="local.developer", user_id="local")

    encoded = req.headers.get("x-ms-client-principal")
    if not encoded:
        raise AuthorizationError("Authentication is required")

    try:
        padding = "=" * (-len(encoded) % 4)
        principal = json.loads(base64.b64decode(encoded + padding).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise AuthorizationError("Invalid authentication principal") from exc

    claims = principal.get("claims", [])
    claim_map = {claim.get("typ"): claim.get("val") for claim in claims}
    email = (
        claim_map.get("preferred_username")
        or claim_map.get("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress")
        or principal.get("userDetails")
        or ""
    ).lower()
    user_id = principal.get("userId") or claim_map.get("oid") or "unknown"

    if not email:
        raise AuthorizationError("The signed-in account has no usable email claim")
    if settings.admin_emails and email not in settings.admin_emails:
        raise AuthorizationError("This account is not an authorized notification administrator")

    return AdminPrincipal(email=email, user_id=user_id)
