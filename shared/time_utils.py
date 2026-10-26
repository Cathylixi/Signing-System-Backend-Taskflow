from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("Datetime must include a timezone")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_datetime(value: str) -> datetime:
    normalized = value.strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("Datetime must include a UTC offset or Z suffix")
    return parsed


def local_date(value: datetime, timezone_name: str):
    return value.astimezone(ZoneInfo(timezone_name)).date()
