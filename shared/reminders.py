from __future__ import annotations

from datetime import datetime

from .time_utils import local_date, parse_datetime


def reminder_reason(
    task: dict,
    recipient: dict,
    now: datetime,
    timezone_name: str,
) -> str | None:
    if task.get("status") != "active" or recipient.get("completionStatus") == "complete":
        return None

    today = local_date(now, timezone_name)
    if task.get("reminderPolicy", {}).get("excludeWeekends", True) and today.weekday() >= 5:
        return None

    last_reminder = recipient.get("lastReminderAtUtc")
    if last_reminder and local_date(parse_datetime(last_reminder), timezone_name) >= today:
        return None

    policy = task.get("reminderPolicy", {})
    published_raw = task.get("publishedAtUtc")
    if not published_raw:
        return None
    published_date = local_date(parse_datetime(published_raw), timezone_name)
    days_after_publication = (today - published_date).days

    due_raw = task.get("dueAtUtc")
    if due_raw:
        due_date = local_date(parse_datetime(due_raw), timezone_name)
        days_until_due = (due_date - today).days
        if days_until_due in set(policy.get("daysBeforeDue", [])):
            return f"due_in_{days_until_due}_days"
        if days_until_due < 0:
            frequency = int(policy.get("overdueFrequencyDays", 0) or 0)
            if frequency and abs(days_until_due) % frequency == 0:
                return "overdue"

    if days_after_publication in set(policy.get("daysAfterPublication", [])):
        return f"published_{days_after_publication}_days_ago"
    return None
