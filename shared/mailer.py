from __future__ import annotations

from typing import Protocol

import requests

from .config import Settings
from .graph_mailer import GraphMailer, MailDeliveryError


class Mailer(Protocol):
    def send(
        self,
        recipient: str,
        subject: str,
        html_body: str,
        *,
        task_id: str = "",
        event_kind: str = "notification",
    ) -> None: ...


class PowerAutomateMailer:
    """Send a normalized payload to a Power Automate HTTP-triggered flow.

    The Outlook connection and sender identity stay inside Power Automate. The
    flow URL is a secret and must only be stored in Azure Function settings.
    """

    def __init__(self, flow_url: str, timeout_seconds: int = 30):
        if not flow_url:
            raise MailDeliveryError("POWER_AUTOMATE_FLOW_URL is not configured")
        self.flow_url = flow_url
        self.timeout_seconds = timeout_seconds

    def send(
        self,
        recipient: str,
        subject: str,
        html_body: str,
        *,
        task_id: str = "",
        event_kind: str = "notification",
    ) -> None:
        try:
            response = requests.post(
                self.flow_url,
                json={
                    "to": recipient,
                    "subject": subject,
                    "htmlBody": html_body,
                    "taskId": task_id,
                    "eventKind": event_kind,
                },
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise MailDeliveryError(f"Power Automate request failed: {exc}") from exc

        if response.status_code < 200 or response.status_code >= 300:
            detail = response.text[:500].strip()
            raise MailDeliveryError(
                f"Power Automate returned HTTP {response.status_code}"
                + (f": {detail}" if detail else "")
            )


class GraphMailerAdapter:
    def __init__(self, sender_mailbox: str):
        self.mailer = GraphMailer(sender_mailbox)

    def send(
        self,
        recipient: str,
        subject: str,
        html_body: str,
        *,
        task_id: str = "",
        event_kind: str = "notification",
    ) -> None:
        self.mailer.send(recipient, subject, html_body)


def build_mailer(settings: Settings) -> Mailer:
    if settings.mail_provider == "power_automate":
        return PowerAutomateMailer(settings.power_automate_flow_url or "")
    if settings.mail_provider == "graph":
        return GraphMailerAdapter(settings.sender_mailbox)
    raise MailDeliveryError("MAIL_PROVIDER must be 'power_automate' or 'graph'")
