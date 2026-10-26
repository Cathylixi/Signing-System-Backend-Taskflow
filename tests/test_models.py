from datetime import datetime, timedelta, timezone

import pytest

from shared.models import ValidationError, build_task, update_task


def valid_payload():
    return {
        "title": "Complete policy acknowledgment",
        "emailSubject": "Action required",
        "htmlBody": "<p>Please complete the task.</p>",
        "recipients": ["first@example.com", "second@example.com"],
        "dueAt": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
    }


def test_build_task_creates_active_task_and_deduplicates_recipients():
    payload = valid_payload()
    payload["recipients"].append("FIRST@example.com")

    task = build_task(payload, "tenant", "admin@example.com", maximum_recipients=50)

    assert task["status"] == "active"
    assert task["publishedAtUtc"] is not None
    assert task["tenantId"] == "tenant"
    assert len(task["recipients"]) == 2
    assert task["recipients"][0]["completionStatus"] == "incomplete"


def test_build_task_rejects_invalid_email():
    payload = valid_payload()
    payload["recipients"] = ["not-an-email"]

    with pytest.raises(ValidationError, match="Invalid recipient email"):
        build_task(payload, "tenant", "admin@example.com", maximum_recipients=50)


def test_build_task_sanitizes_unsafe_html():
    payload = valid_payload()
    payload["htmlBody"] = '<p>Hello</p><script>alert("bad")</script><a href="javascript:bad()">link</a>'

    task = build_task(payload, "tenant", "admin@example.com", maximum_recipients=50)

    assert "<script" not in task["htmlBody"]
    assert "javascript:" not in task["htmlBody"]


def test_build_task_rejects_past_due_date():
    payload = valid_payload()
    payload["dueAt"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

    with pytest.raises(ValidationError, match="future"):
        build_task(payload, "tenant", "admin@example.com", maximum_recipients=50)


def test_build_task_rejects_non_http_action_url():
    payload = valid_payload()
    payload["actionUrl"] = "javascript:alert('bad')"

    with pytest.raises(ValidationError, match="http or https"):
        build_task(payload, "tenant", "admin@example.com", maximum_recipients=50)


def test_update_task_preserves_existing_completion_status():
    task = build_task(valid_payload(), "tenant", "admin@example.com", maximum_recipients=50)
    task["recipients"][0]["completionStatus"] = "complete"
    task["recipients"][0]["completedAtUtc"] = datetime.now(timezone.utc).isoformat()

    updated = update_task(
        task,
        {"recipients": ["FIRST@example.com", "new@example.com"], "priority": "high"},
        maximum_recipients=50,
    )

    assert updated["priority"] == "high"
    assert updated["recipients"][0]["completionStatus"] == "complete"
    assert updated["recipients"][1]["completionStatus"] == "incomplete"


def test_build_task_rejects_unknown_priority():
    payload = valid_payload()
    payload["priority"] = "extreme"

    with pytest.raises(ValidationError, match="priority"):
        build_task(payload, "tenant", "admin@example.com", maximum_recipients=50)
