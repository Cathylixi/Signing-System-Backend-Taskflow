from datetime import datetime, timedelta, timezone

from shared.reminders import reminder_reason
from shared.time_utils import iso_utc


ZONE = "America/New_York"


def task_for(now: datetime, published_days_ago: int, due_days_from_now: int | None):
    due = now + timedelta(days=due_days_from_now) if due_days_from_now is not None else None
    return {
        "status": "active",
        "publishedAtUtc": iso_utc(now - timedelta(days=published_days_ago)),
        "dueAtUtc": iso_utc(due) if due else None,
        "reminderPolicy": {
            "daysAfterPublication": [3],
            "daysBeforeDue": [3, 1, 0],
            "overdueFrequencyDays": 1,
            "excludeWeekends": False,
        },
    }


def recipient(**overrides):
    value = {
        "email": "employee@example.com",
        "completionStatus": "incomplete",
        "lastReminderAtUtc": None,
    }
    value.update(overrides)
    return value


def test_reminds_three_days_after_publication():
    now = datetime(2026, 10, 19, 13, 0, tzinfo=timezone.utc)
    task = task_for(now, published_days_ago=3, due_days_from_now=10)
    assert reminder_reason(task, recipient(), now, ZONE) == "published_3_days_ago"


def test_due_date_rule_takes_priority():
    now = datetime(2026, 10, 19, 13, 0, tzinfo=timezone.utc)
    task = task_for(now, published_days_ago=3, due_days_from_now=1)
    assert reminder_reason(task, recipient(), now, ZONE) == "due_in_1_days"


def test_completed_recipient_is_never_reminded():
    now = datetime(2026, 10, 19, 13, 0, tzinfo=timezone.utc)
    task = task_for(now, published_days_ago=3, due_days_from_now=1)
    assert reminder_reason(task, recipient(completionStatus="complete"), now, ZONE) is None


def test_recipient_is_not_reminded_twice_same_local_day():
    now = datetime(2026, 10, 19, 18, 0, tzinfo=timezone.utc)
    task = task_for(now, published_days_ago=3, due_days_from_now=1)
    same_day = iso_utc(now - timedelta(hours=2))
    assert reminder_reason(task, recipient(lastReminderAtUtc=same_day), now, ZONE) is None


def test_overdue_task_is_reminded():
    now = datetime(2026, 10, 19, 13, 0, tzinfo=timezone.utc)
    task = task_for(now, published_days_ago=8, due_days_from_now=-2)
    assert reminder_reason(task, recipient(), now, ZONE) == "overdue"
