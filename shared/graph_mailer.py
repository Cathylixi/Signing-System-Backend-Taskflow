from __future__ import annotations

from dataclasses import dataclass

import requests
from azure.identity import DefaultAzureCredential
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class MailDeliveryError(Exception):
    pass


@dataclass
class GraphMailer:
    sender_mailbox: str

    def __post_init__(self) -> None:
        if not self.sender_mailbox:
            raise MailDeliveryError("SENDER_MAILBOX is not configured")
        self._credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)
        retry = Retry(
            total=3,
            connect=3,
            read=3,
            status=3,
            backoff_factor=0.5,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"POST"}),
            respect_retry_after_header=True,
        )
        self._session = requests.Session()
        self._session.mount("https://", HTTPAdapter(max_retries=retry))

    def send(self, recipient: str, subject: str, html_body: str) -> None:
        token = self._credential.get_token("https://graph.microsoft.com/.default").token
        url = f"https://graph.microsoft.com/v1.0/users/{self.sender_mailbox}/sendMail"
        response = self._session.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "message": {
                    "subject": subject,
                    "body": {"contentType": "HTML", "content": html_body},
                    "toRecipients": [{"emailAddress": {"address": recipient}}],
                },
                "saveToSentItems": True,
            },
            timeout=30,
        )
        if response.status_code != 202:
            detail = response.text[:2_000]
            raise MailDeliveryError(f"Microsoft Graph returned {response.status_code}: {detail}")
