from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_env: str
    allow_local_anonymous: bool
    tenant_id: str
    task_timezone: str
    reminder_run_hour: int
    max_recipients_per_task: int
    cosmos_endpoint: str
    cosmos_database_name: str
    cosmos_container_name: str
    cosmos_connection_string: str | None
    sender_mailbox: str
    mail_provider: str
    power_automate_flow_url: str | None
    test_recipient: str
    admin_emails: frozenset[str]

    @property
    def is_local(self) -> bool:
        return self.app_env.lower() == "local"


def load_settings() -> Settings:
    admin_emails = frozenset(
        item.strip().lower()
        for item in os.getenv("ADMIN_EMAILS", "").split(",")
        if item.strip()
    )
    return Settings(
        app_env=os.getenv("APP_ENV", "production"),
        allow_local_anonymous=_as_bool(os.getenv("ALLOW_LOCAL_ANONYMOUS")),
        tenant_id=os.getenv("TENANT_ID", "default"),
        task_timezone=os.getenv("TASK_TIMEZONE", "America/New_York"),
        reminder_run_hour=int(os.getenv("REMINDER_RUN_HOUR", "9")),
        max_recipients_per_task=int(os.getenv("MAX_RECIPIENTS_PER_TASK", "50")),
        cosmos_endpoint=os.getenv("COSMOS_ENDPOINT", ""),
        cosmos_database_name=os.getenv("COSMOS_DATABASE_NAME", "NotificationSystem"),
        cosmos_container_name=os.getenv("COSMOS_CONTAINER_NAME", "records"),
        cosmos_connection_string=os.getenv("COSMOS_CONNECTION_STRING") or None,
        sender_mailbox=os.getenv("SENDER_MAILBOX", ""),
        mail_provider=os.getenv("MAIL_PROVIDER", "power_automate").strip().lower(),
        power_automate_flow_url=os.getenv("POWER_AUTOMATE_FLOW_URL") or None,
        test_recipient=os.getenv("TEST_RECIPIENT", ""),
        admin_emails=admin_emails,
    )
