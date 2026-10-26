from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

import bleach

from .models import EMAIL_PATTERN, ValidationError, validate_policy
from .time_utils import iso_utc, parse_datetime, utc_now


DOCUMENT_STATUSES = {"uploaded", "active", "completed", "archived", "deleted"}
REQUEST_STATUSES = {
    "draft",
    "sent",
    "partially_signed",
    "completed",
    "canceled",
    "expired",
}
ASSIGNMENT_STATUSES = {
    "draft",
    "waiting",
    "invited",
    "delivered",
    "opened",
    "signed",
    "declined",
    "expired",
    "canceled",
    "failed",
}
FIELD_TYPES = {"signature", "initials", "reason", "date_signed"}
AUTHENTICATION_LEVELS = {"none", "email", "microsoft_login"}

ASSIGNMENT_TRANSITIONS = {
    "draft": {"waiting", "invited", "canceled"},
    "waiting": {"invited", "expired", "canceled"},
    "invited": {"delivered", "opened", "signed", "declined", "expired", "canceled", "failed"},
    "delivered": {"opened", "signed", "declined", "expired", "canceled", "failed"},
    "opened": {"signed", "declined", "expired", "canceled", "failed"},
    "failed": {"invited", "canceled"},
    "signed": set(),
    "declined": set(),
    "expired": set(),
    "canceled": set(),
}

SHA256_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")


def _text(value: Any, name: str, maximum: int, required: bool = True) -> str:
    result = str(value or "").strip()
    if required and not result:
        raise ValidationError(f"{name} is required")
    if len(result) > maximum:
        raise ValidationError(f"{name} must be {maximum} characters or fewer")
    return result


def _email(value: Any, name: str = "signerEmail") -> str:
    result = _text(value, name, 320).lower()
    if not EMAIL_PATTERN.match(result):
        raise ValidationError(f"Invalid {name}: {result or '(blank)'}")
    return result


def _future_datetime(value: Any, name: str) -> str:
    parsed = parse_datetime(_text(value, name, 100))
    if parsed <= utc_now():
        raise ValidationError(f"{name} must be in the future")
    return iso_utc(parsed)


def _base_record(record_type: str, tenant_id: str, record_id: str | None = None) -> dict[str, Any]:
    now = iso_utc(utc_now())
    return {
        "id": record_id or str(uuid.uuid4()),
        "tenantId": tenant_id,
        "recordType": record_type,
        "createdAtUtc": now,
        "updatedAtUtc": now,
        "_version": 1,
    }


def build_document(payload: dict[str, Any], tenant_id: str, uploaded_by: str) -> dict[str, Any]:
    blob_path = _text(payload.get("originalBlobPath"), "originalBlobPath", 2_000)
    if not blob_path.startswith("documents/"):
        raise ValidationError("originalBlobPath must be under the documents/ path")

    content_type = _text(payload.get("contentType") or "application/pdf", "contentType", 200)
    if content_type != "application/pdf":
        raise ValidationError("The MVP supports PDF documents only")

    try:
        size_bytes = int(payload.get("sizeBytes", 0))
    except (TypeError, ValueError) as exc:
        raise ValidationError("sizeBytes must be a whole number") from exc
    if size_bytes < 0:
        raise ValidationError("sizeBytes cannot be negative")

    sha256 = _text(payload.get("sha256"), "sha256", 64, required=False).lower()
    if sha256 and not SHA256_PATTERN.match(sha256):
        raise ValidationError("sha256 must contain 64 hexadecimal characters")

    record = _base_record("document", tenant_id)
    record.update(
        {
            "title": _text(payload.get("title"), "title", 250),
            "documentType": _text(payload.get("documentType") or "other", "documentType", 100),
            "fileName": _text(payload.get("fileName"), "fileName", 500),
            "contentType": content_type,
            "sizeBytes": size_bytes,
            "sha256": sha256 or None,
            "originalBlobPath": blob_path,
            "finalBlobPath": None,
            "blobETag": _text(payload.get("blobETag"), "blobETag", 500, required=False) or None,
            "blobVersionId": _text(payload.get("blobVersionId"), "blobVersionId", 500, required=False) or None,
            "status": "uploaded",
            "uploadedBy": _email(uploaded_by, "uploadedBy"),
            "uploadedAtUtc": iso_utc(utc_now()),
        }
    )
    return record


def build_signing_request_bundle(
    payload: dict[str, Any],
    tenant_id: str,
    created_by: str,
    maximum_signers: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    document_id = _text(payload.get("documentId"), "documentId", 200)
    raw_signers = payload.get("signers")
    if not isinstance(raw_signers, list) or not raw_signers:
        raise ValidationError("At least one signer is required")
    if len(raw_signers) > maximum_signers:
        raise ValidationError(f"A maximum of {maximum_signers} signers is allowed in the MVP")

    enforce_order = bool(payload.get("enforceSigningOrder", False))
    authentication_level = _text(
        payload.get("authenticationLevel") or "email",
        "authenticationLevel",
        50,
    )
    if authentication_level not in AUTHENTICATION_LEVELS:
        raise ValidationError("Unsupported authenticationLevel")

    html_body = bleach.clean(
        _text(payload.get("htmlBody"), "htmlBody", 100_000),
        tags={"p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a"},
        attributes={"a": ["href", "title"]},
        protocols={"https", "http"},
        strip=True,
    )

    request = _base_record("signatureRequest", tenant_id)
    request.update(
        {
            "documentId": document_id,
            "title": _text(payload.get("title"), "title", 250),
            "status": "draft",
            "createdBy": _email(created_by, "createdBy"),
            "sentAtUtc": None,
            "completedAtUtc": None,
            "enforceSigningOrder": enforce_order,
            "authenticationLevel": authentication_level,
            "emailTemplateId": _text(
                payload.get("emailTemplateId") or "standard-signature-request",
                "emailTemplateId",
                200,
            ),
            "emailLanguage": _text(payload.get("emailLanguage") or "en-US", "emailLanguage", 30),
            "emailSubject": _text(payload.get("emailSubject"), "emailSubject", 250),
            "htmlBody": html_body,
            "reminderPolicy": validate_policy(payload.get("reminderPolicy")),
            "recipientCount": 0,
            "completedSignerCount": 0,
            "requiredFieldCount": 0,
            "nextDueAtUtc": None,
        }
    )

    seen: set[str] = set()
    assignments: list[dict[str, Any]] = []
    for index, item in enumerate(raw_signers, start=1):
        if not isinstance(item, dict):
            raise ValidationError("Each signer must be an object")
        signer_email = _email(item.get("email"))
        if signer_email in seen:
            raise ValidationError(f"Duplicate signer email: {signer_email}")
        seen.add(signer_email)

        signing_order = index if enforce_order else int(item.get("signingOrder") or index)
        if signing_order < 1:
            raise ValidationError("signingOrder must be at least 1")

        assignment = _base_record("signerAssignment", tenant_id)
        assignment.update(
            {
                "requestId": request["id"],
                "documentId": document_id,
                "signerId": _text(item.get("signerId"), "signerId", 200, required=False) or None,
                "signerName": _text(item.get("displayName"), "displayName", 200),
                "signerEmail": signer_email,
                "signingOrder": signing_order,
                "dueAtUtc": _future_datetime(item.get("dueAt") or item.get("dueAtUtc"), "dueAt"),
                "status": "draft",
                "activatedAtUtc": None,
                "invitationSentAtUtc": None,
                "deliveredAtUtc": None,
                "openedAtUtc": None,
                "signedAtUtc": None,
                "declinedAtUtc": None,
                "signedBlobPath": None,
                "signedBlobETag": None,
                "signedSha256": None,
                "lastReminderAtUtc": None,
                "nextReminderAtUtc": None,
                "reminderCount": 0,
                "lastError": None,
            }
        )
        assignments.append(assignment)

    request["recipientCount"] = len(assignments)
    request["nextDueAtUtc"] = min(item["dueAtUtc"] for item in assignments)
    return request, assignments


def build_signature_field(payload: dict[str, Any], tenant_id: str) -> dict[str, Any]:
    field_type = _text(payload.get("fieldType"), "fieldType", 50)
    if field_type not in FIELD_TYPES:
        raise ValidationError(f"Unsupported fieldType: {field_type}")

    try:
        page_number = int(payload.get("pageNumber"))
        x = float(payload.get("x"))
        y = float(payload.get("y"))
        width = float(payload.get("width"))
        height = float(payload.get("height"))
    except (TypeError, ValueError) as exc:
        raise ValidationError("pageNumber and field coordinates must be numeric") from exc
    if page_number < 1 or min(x, y) < 0 or width <= 0 or height <= 0:
        raise ValidationError("Signature field page and coordinates are outside the allowed range")

    record = _base_record("signatureField", tenant_id)
    record.update(
        {
            "requestId": _text(payload.get("requestId"), "requestId", 200),
            "assignmentId": _text(payload.get("assignmentId"), "assignmentId", 200),
            "fieldType": field_type,
            "required": bool(payload.get("required", True)),
            "pageNumber": page_number,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "value": None,
            "valueBlobPath": None,
            "completedAtUtc": None,
        }
    )
    return record


def build_audit_event(
    tenant_id: str,
    request_id: str,
    event_type: str,
    actor_id: str | None,
    source: str,
    assignment_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = _base_record("auditEvent", tenant_id)
    record.update(
        {
            "requestId": _text(request_id, "requestId", 200),
            "assignmentId": _text(assignment_id, "assignmentId", 200, required=False) or None,
            "eventType": _text(event_type, "eventType", 100),
            "actorId": _text(actor_id, "actorId", 320, required=False) or None,
            "source": _text(source, "source", 100),
            "occurredAtUtc": iso_utc(utc_now()),
            "details": details or {},
        }
    )
    return record


def assert_assignment_transition(current_status: str, new_status: str) -> None:
    if current_status not in ASSIGNMENT_STATUSES or new_status not in ASSIGNMENT_STATUSES:
        raise ValidationError("Unknown signer assignment status")
    if current_status == new_status:
        return
    if new_status not in ASSIGNMENT_TRANSITIONS[current_status]:
        raise ValidationError(f"Cannot change signer assignment from {current_status} to {new_status}")


def recalculate_request_summary(
    request: dict[str, Any], assignments: list[dict[str, Any]]
) -> dict[str, Any]:
    completed = [item for item in assignments if item.get("status") == "signed"]
    incomplete_active = [
        item
        for item in assignments
        if item.get("status") not in {"signed", "declined", "expired", "canceled"}
        and item.get("dueAtUtc")
    ]
    request["recipientCount"] = len(assignments)
    request["completedSignerCount"] = len(completed)
    request["nextDueAtUtc"] = (
        min(item["dueAtUtc"] for item in incomplete_active) if incomplete_active else None
    )

    if request.get("status") not in {"canceled", "expired"}:
        if assignments and len(completed) == len(assignments):
            request["status"] = "completed"
            request["completedAtUtc"] = request.get("completedAtUtc") or iso_utc(utc_now())
        elif completed:
            request["status"] = "partially_signed"
        elif request.get("sentAtUtc"):
            request["status"] = "sent"
        else:
            request["status"] = "draft"
    request["updatedAtUtc"] = iso_utc(utc_now())
    request["_version"] = int(request.get("_version", 0)) + 1
    return request
