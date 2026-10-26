from __future__ import annotations

import html
import re
import uuid
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

import bleach

from .time_utils import iso_utc, parse_datetime, utc_now


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ALLOWED_STATUSES = {"draft", "active", "completed", "cancelled"}
ALLOWED_PRIORITIES = {"low", "normal", "high", "urgent"}
ALLOWED_TASK_TYPES = {"signature", "acknowledgment", "training", "general"}


class ValidationError(Exception):
    pass


def default_reminder_policy() -> dict[str, Any]:
    return {
        "daysAfterPublication": [3],
        "daysBeforeDue": [3, 1, 0],
        "overdueFrequencyDays": 1,
        "excludeWeekends": True,
    }


def _clean_text(value: Any, name: str, max_length: int, required: bool = True) -> str:
    result = str(value or "").strip()
    if required and not result:
        raise ValidationError(f"{name} is required")
    if len(result) > max_length:
        raise ValidationError(f"{name} must be {max_length} characters or fewer")
    return result


def validate_recipients(value: Any, maximum: int) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise ValidationError("At least one recipient is required")
    if len(value) > maximum:
        raise ValidationError(f"A maximum of {maximum} recipients is allowed in the MVP")

    seen: set[str] = set()
    recipients: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            email_address = item.strip().lower()
            display_name = ""
        elif isinstance(item, dict):
            email_address = str(item.get("email", "")).strip().lower()
            display_name = str(item.get("displayName", "")).strip()[:200]
        else:
            raise ValidationError("Each recipient must be an email string or object")

        if not EMAIL_PATTERN.match(email_address):
            raise ValidationError(f"Invalid recipient email: {email_address or '(blank)'}")
        if email_address in seen:
            continue
        seen.add(email_address)
        recipients.append(
            {
                "email": email_address,
                "displayName": display_name,
                "completionStatus": "incomplete",
                "completedAtUtc": None,
                "lastReminderAtUtc": None,
                "reminderCount": 0,
            }
        )
    return recipients


def validate_policy(value: Any) -> dict[str, Any]:
    source = value if isinstance(value, dict) else default_reminder_policy()
    try:
        after = sorted({int(day) for day in source.get("daysAfterPublication", [3]) if int(day) >= 0})
        before = sorted({int(day) for day in source.get("daysBeforeDue", [3, 1, 0]) if int(day) >= 0}, reverse=True)
        overdue = int(source.get("overdueFrequencyDays", 1))
    except (TypeError, ValueError) as exc:
        raise ValidationError("Reminder policy values must be whole numbers") from exc
    if overdue < 0 or overdue > 365:
        raise ValidationError("overdueFrequencyDays must be between 0 and 365")
    return {
        "daysAfterPublication": after,
        "daysBeforeDue": before,
        "overdueFrequencyDays": overdue,
        "excludeWeekends": bool(source.get("excludeWeekends", True)),
    }


def build_task(payload: dict[str, Any], tenant_id: str, created_by: str, maximum_recipients: int) -> dict[str, Any]:
    now = utc_now()
    due_raw = payload.get("dueAt") or payload.get("dueAtUtc")
    due_at = parse_datetime(str(due_raw)) if due_raw else None
    if due_at and due_at <= now:
        raise ValidationError("Due date must be in the future")

    raw_html_body = _clean_text(payload.get("htmlBody"), "htmlBody", 100_000)
    html_body = bleach.clean(
        raw_html_body,
        tags={"p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a"},
        attributes={"a": ["href", "title"]},
        protocols={"https", "http"},
        strip=True,
    )
    action_url = _clean_text(payload.get("actionUrl"), "actionUrl", 2_000, required=False)
    if action_url and urlparse(action_url).scheme.lower() not in {"https", "http"}:
        raise ValidationError("actionUrl must use http or https")

    return {
        "id": str(uuid.uuid4()),
        "tenantId": tenant_id,
        "recordType": "task",
        "title": _clean_text(payload.get("title"), "title", 250),
        "taskType": _choice(payload.get("taskType"), "general", ALLOWED_TASK_TYPES, "taskType"),
        "priority": _choice(payload.get("priority"), "normal", ALLOWED_PRIORITIES, "priority"),
        "emailSubject": _clean_text(payload.get("emailSubject"), "emailSubject", 250),
        "htmlBody": html_body,
        "plainTextBody": _clean_text(
            payload.get("plainTextBody") or re.sub(r"<[^>]+>", " ", html.unescape(html_body)),
            "plainTextBody",
            100_000,
        ),
        "actionUrl": action_url,
        "status": "active",
        "dueAtUtc": iso_utc(due_at) if due_at else None,
        "publishedAtUtc": iso_utc(now),
        "reminderPolicy": validate_policy(payload.get("reminderPolicy")),
        "recipients": validate_recipients(payload.get("recipients"), maximum_recipients),
        "createdBy": created_by,
        "createdAtUtc": iso_utc(now),
        "updatedAtUtc": iso_utc(now),
        "_version": 1,
    }


def _choice(value: Any, default: str, allowed: set[str], name: str) -> str:
    result = str(value or default).strip().lower()
    if result not in allowed:
        raise ValidationError(f"Invalid {name}")
    return result


def update_task(
    task: dict[str, Any],
    payload: dict[str, Any],
    maximum_recipients: int,
) -> dict[str, Any]:
    """Apply editable fields while preserving recipient completion history."""
    assert_task_status(task, {"draft", "active"})

    if "title" in payload:
        task["title"] = _clean_text(payload.get("title"), "title", 250)
    if "emailSubject" in payload:
        task["emailSubject"] = _clean_text(payload.get("emailSubject"), "emailSubject", 250)
    if "taskType" in payload:
        task["taskType"] = _choice(payload.get("taskType"), "general", ALLOWED_TASK_TYPES, "taskType")
    if "priority" in payload:
        task["priority"] = _choice(payload.get("priority"), "normal", ALLOWED_PRIORITIES, "priority")
    if "actionUrl" in payload:
        action_url = _clean_text(payload.get("actionUrl"), "actionUrl", 2_000, required=False)
        if action_url and urlparse(action_url).scheme.lower() not in {"https", "http"}:
            raise ValidationError("actionUrl must use http or https")
        task["actionUrl"] = action_url
    if "dueAt" in payload or "dueAtUtc" in payload:
        due_raw = payload.get("dueAt") or payload.get("dueAtUtc")
        due_at = parse_datetime(str(due_raw)) if due_raw else None
        if due_at and due_at <= utc_now():
            raise ValidationError("Due date must be in the future")
        task["dueAtUtc"] = iso_utc(due_at) if due_at else None
    if "htmlBody" in payload:
        raw_html_body = _clean_text(payload.get("htmlBody"), "htmlBody", 100_000)
        task["htmlBody"] = bleach.clean(
            raw_html_body,
            tags={"p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a"},
            attributes={"a": ["href", "title"]},
            protocols={"https", "http"},
            strip=True,
        )
        task["plainTextBody"] = _clean_text(
            payload.get("plainTextBody") or re.sub(r"<[^>]+>", " ", html.unescape(task["htmlBody"])),
            "plainTextBody",
            100_000,
        )
    if "reminderPolicy" in payload:
        task["reminderPolicy"] = validate_policy(payload.get("reminderPolicy"))
    if "recipients" in payload:
        old_by_email = {item["email"].lower(): item for item in task.get("recipients", [])}
        recipients = validate_recipients(payload.get("recipients"), maximum_recipients)
        for recipient in recipients:
            old = old_by_email.get(recipient["email"])
            if old:
                for field in ("completionStatus", "completedAtUtc", "lastReminderAtUtc", "reminderCount"):
                    recipient[field] = old.get(field, recipient[field])
        task["recipients"] = recipients
    return task


def public_task(task: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in task.items() if not key.startswith("_")}


def assert_task_status(task: dict[str, Any], allowed: set[str]) -> None:
    status = task.get("status")
    if status not in ALLOWED_STATUSES or status not in allowed:
        raise ValidationError(f"Task status '{status}' does not allow this operation")
