from unittest.mock import Mock, patch

import pytest

from shared.graph_mailer import MailDeliveryError
from shared.mailer import PowerAutomateMailer


@patch("shared.mailer.requests.post")
def test_power_automate_mailer_sends_normalized_payload(post):
    post.return_value = Mock(status_code=202, text="")
    mailer = PowerAutomateMailer("https://flow.example.test/trigger")

    mailer.send(
        "employee@example.com",
        "Action required",
        "<p>Please complete this task.</p>",
        task_id="task-123",
        event_kind="reminder",
    )

    post.assert_called_once_with(
        "https://flow.example.test/trigger",
        json={
            "to": "employee@example.com",
            "subject": "Action required",
            "htmlBody": "<p>Please complete this task.</p>",
            "taskId": "task-123",
            "eventKind": "reminder",
        },
        timeout=30,
    )


@patch("shared.mailer.requests.post")
def test_power_automate_mailer_reports_failed_flow(post):
    post.return_value = Mock(status_code=500, text="Flow failed")

    with pytest.raises(MailDeliveryError, match="HTTP 500"):
        PowerAutomateMailer("https://flow.example.test/trigger").send(
            "employee@example.com", "Subject", "<p>Body</p>"
        )
