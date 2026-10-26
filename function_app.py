from __future__ import annotations

import json
import logging
import html
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import azure.functions as func

from shared.auth import AuthorizationError, require_admin
from shared.config import load_settings
from shared.graph_mailer import MailDeliveryError
from shared.mailer import Mailer, build_mailer
from shared.models import (
    ValidationError,
    assert_task_status,
    build_task,
    public_task,
    update_task,
)
from shared.reminders import reminder_reason
from shared.repository import RecordNotFound, Repository
from shared.time_utils import iso_utc, parse_datetime, utc_now


app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)
WEB_ROOT = Path(__file__).parent / "web"


def json_response(payload: Any, status_code: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(payload, ensure_ascii=False, default=str),
        status_code=status_code,
        mimetype="application/json",
    )


def error_response(message: str, status_code: int) -> func.HttpResponse:
    return json_response({"error": message}, status_code)


def parse_json(req: func.HttpRequest) -> dict[str, Any]:
    try:
        payload = req.get_json()
    except ValueError as exc:
        raise ValidationError("Request body must be valid JSON") from exc
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")
    return payload


def get_services() -> tuple[Any, Repository, Mailer]:
    settings = load_settings()
    return settings, Repository(settings), build_mailer(settings)


def add_action_button(html_body: str, action_url: str) -> str:
    if not action_url:
        return html_body
    safe_url = html.escape(action_url, quote=True)
    button = (
        '<p style="margin:24px 0">'
        f'<a href="{safe_url}" style="background:#0f4c81;color:#fff;padding:12px 18px;'
        'text-decoration:none;border-radius:4px;display:inline-block">Open Task</a></p>'
    )
    return f"{html_body}{button}"


def send_task_email(
    repository: Repository,
    mailer: Mailer,
    task: dict[str, Any],
    recipient: dict[str, Any],
    event_kind: str,
    event_day: str,
    reason: str,
) -> bool:
    event = repository.claim_event(
        task_id=task["id"],
        recipient=recipient["email"],
        event_kind=event_kind,
        event_day=event_day,
        reason=reason,
    )
    if not event:
        return False

    body = add_action_button(task["htmlBody"], task.get("actionUrl", ""))
    if event_kind == "reminder":
        body = f"<p><strong>Reminder</strong></p>{body}"

    try:
        mailer.send(
            recipient["email"],
            task["emailSubject"],
            body,
            task_id=task["id"],
            event_kind=event_kind,
        )
        repository.finish_event(event, success=True)
        return True
    except Exception as exc:
        repository.finish_event(event, success=False, error=str(exc))
        raise


def send_initial_task_emails(
    repository: Repository,
    mailer: Mailer,
    task: dict[str, Any],
) -> dict[str, Any]:
    published_at = parse_datetime(task["publishedAtUtc"])
    sent = 0
    failed: list[dict[str, str]] = []
    event_day = published_at.date().isoformat()
    for recipient in task["recipients"]:
        try:
            if send_task_email(
                repository,
                mailer,
                task,
                recipient,
                event_kind="initial",
                event_day=event_day,
                reason="task_created",
            ):
                sent += 1
        except Exception as exc:
            logging.exception("Initial email failed for %s", recipient["email"])
            failed.append({"email": recipient["email"], "error": str(exc)[:500]})
    return {"sent": sent, "failed": failed}


def handle_api_error(exc: Exception) -> func.HttpResponse:
    if isinstance(exc, AuthorizationError):
        return error_response(str(exc), 403)
    if isinstance(exc, (ValidationError, ValueError)):
        return error_response(str(exc), 400)
    if isinstance(exc, RecordNotFound):
        return error_response(str(exc), 404)
    if isinstance(exc, MailDeliveryError):
        return error_response(str(exc), 502)
    logging.exception("Unhandled API error")
    return error_response("An unexpected server error occurred", 500)


@app.route(route="app", methods=["GET"])
def admin_page(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        require_admin(req, settings)
        return func.HttpResponse(
            (WEB_ROOT / "index.html").read_text(encoding="utf-8"),
            mimetype="text/html",
        )
    except Exception as exc:
        return handle_api_error(exc)


@app.route(route="assets/{filename}", methods=["GET"])
def web_asset(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        require_admin(req, settings)
        filename = req.route_params.get("filename", "")
        if filename not in {"app.js", "styles.css"}:
            return error_response("Asset not found", 404)
        mimetype = "application/javascript" if filename.endswith(".js") else "text/css"
        return func.HttpResponse((WEB_ROOT / "assets" / filename).read_text(encoding="utf-8"), mimetype=mimetype)
    except Exception as exc:
        return handle_api_error(exc)


@app.route(route="api/health", methods=["GET"])
def health(req: func.HttpRequest) -> func.HttpResponse:
    return json_response({"status": "ok", "timeUtc": iso_utc(utc_now())})


@app.route(route="api/client-config", methods=["GET"])
def client_config(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        require_admin(req, settings)
        return json_response(
            {
                "testRecipient": settings.test_recipient,
                "timezone": settings.task_timezone,
                "maxRecipients": settings.max_recipients_per_task,
            }
        )
    except Exception as exc:
        return handle_api_error(exc)


@app.route(route="api/tasks", methods=["POST", "GET"])
def tasks(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        principal = require_admin(req, settings)
        repository = Repository(settings)
        if req.method == "POST":
            mailer = build_mailer(settings)
            task = build_task(
                parse_json(req),
                tenant_id=settings.tenant_id,
                created_by=principal.email,
                maximum_recipients=settings.max_recipients_per_task,
            )
            created_task = repository.create_task(task)
            delivery = send_initial_task_emails(repository, mailer, created_task)
            return json_response(
                {"task": public_task(created_task), "delivery": delivery},
                201 if not delivery["failed"] else 207,
            )

        status = req.params.get("status")
        if status and status not in {"active", "completed", "cancelled"}:
            raise ValidationError("Invalid status filter")
        items = repository.list_tasks(status)
        if status is None:
            items = [item for item in items if item.get("status") != "draft"]
        return json_response([public_task(item) for item in items])
    except Exception as exc:
        return handle_api_error(exc)


@app.route(route="api/tasks/{task_id}", methods=["GET", "PATCH"])
def get_task(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        require_admin(req, settings)
        repository = Repository(settings)
        task = repository.get_task(req.route_params["task_id"])
        if req.method == "PATCH":
            task = update_task(task, parse_json(req), settings.max_recipients_per_task)
            return json_response(public_task(repository.replace_task(task)))
        result = public_task(task)
        result["events"] = [public_task(item) for item in repository.list_events(task["id"])]
        return json_response(result)
    except Exception as exc:
        return handle_api_error(exc)


@app.route(route="api/tasks/{task_id}/publish", methods=["POST"])
def publish_task(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        require_admin(req, settings)
        repository = Repository(settings)
        mailer = build_mailer(settings)
        task = repository.get_task(req.route_params["task_id"])
        assert_task_status(task, {"draft"})

        published_at = utc_now()
        task["status"] = "active"
        task["publishedAtUtc"] = iso_utc(published_at)
        repository.replace_task(task)

        delivery = send_initial_task_emails(repository, mailer, task)

        return json_response(
            {
                "task": public_task(repository.get_task(task["id"])),
                "delivery": delivery,
            },
            200 if not delivery["failed"] else 207,
        )
    except Exception as exc:
        return handle_api_error(exc)


@app.route(route="api/test-email", methods=["POST"])
def test_email(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        principal = require_admin(req, settings)
        payload = parse_json(req)
        subject = str(payload.get("subject") or "Notification system test")[:250]
        body = str(payload.get("htmlBody") or "<p>This is a test from the notification system.</p>")
        recipient = principal.email
        if recipient == "local.developer":
            recipient = str(payload.get("recipient") or "").strip().lower()
            if not recipient or "@" not in recipient:
                raise ValidationError("A test recipient is required during local development")
        build_mailer(settings).send(
            recipient,
            f"[TEST] {subject}",
            body,
            event_kind="test",
        )
        return json_response({"sent": True, "recipient": recipient})
    except Exception as exc:
        return handle_api_error(exc)


@app.route(route="api/tasks/{task_id}/cancel", methods=["POST"])
def cancel_task(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        require_admin(req, settings)
        repository = Repository(settings)
        task = repository.get_task(req.route_params["task_id"])
        assert_task_status(task, {"draft", "active"})
        task["status"] = "cancelled"
        return json_response(public_task(repository.replace_task(task)))
    except Exception as exc:
        return handle_api_error(exc)


@app.route(route="api/tasks/{task_id}/remind", methods=["POST"])
def remind_task_now(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        require_admin(req, settings)
        repository = Repository(settings)
        mailer = build_mailer(settings)
        task = repository.get_task(req.route_params["task_id"])
        assert_task_status(task, {"active"})

        now = utc_now()
        event_day = now.date().isoformat()
        sent = 0
        failed: list[dict[str, str]] = []
        for recipient in task.get("recipients", []):
            if recipient.get("completionStatus") == "complete":
                continue
            try:
                if send_task_email(
                    repository,
                    mailer,
                    task,
                    recipient,
                    event_kind="manual-reminder",
                    event_day=event_day,
                    reason="admin_requested",
                ):
                    recipient["lastReminderAtUtc"] = iso_utc(now)
                    recipient["reminderCount"] = int(recipient.get("reminderCount", 0)) + 1
                    sent += 1
            except Exception as exc:
                logging.exception("Manual reminder failed for %s", recipient["email"])
                failed.append({"email": recipient["email"], "error": str(exc)[:500]})
        repository.replace_task(task)
        return json_response(
            {"task": public_task(task), "delivery": {"sent": sent, "failed": failed}},
            200 if not failed else 207,
        )
    except Exception as exc:
        return handle_api_error(exc)


@app.route(route="api/tasks/{task_id}/recipients/{recipient_key}/complete", methods=["POST"])
def complete_recipient(req: func.HttpRequest) -> func.HttpResponse:
    try:
        settings = load_settings()
        require_admin(req, settings)
        repository = Repository(settings)
        task = repository.get_task(req.route_params["task_id"])
        assert_task_status(task, {"active", "completed"})
        recipient_key = req.route_params["recipient_key"].strip().lower()
        matched = False
        for recipient in task["recipients"]:
            if recipient["email"].lower() == recipient_key:
                recipient["completionStatus"] = "complete"
                recipient["completedAtUtc"] = iso_utc(utc_now())
                matched = True
                break
        if not matched:
            raise RecordNotFound(f"Recipient {recipient_key} was not found")
        if all(item.get("completionStatus") == "complete" for item in task["recipients"]):
            task["status"] = "completed"
        return json_response(public_task(repository.replace_task(task)))
    except Exception as exc:
        return handle_api_error(exc)


@app.timer_trigger(schedule="0 0 * * * *", arg_name="timer", run_on_startup=False, use_monitor=True)
def daily_reminder_processor(timer: func.TimerRequest) -> None:
    settings = load_settings()
    now = utc_now()
    local_now = now.astimezone(ZoneInfo(settings.task_timezone))
    if local_now.hour != settings.reminder_run_hour or local_now.weekday() >= 5:
        return

    repository = Repository(settings)
    local_day = local_now.date().isoformat()
    mailer = build_mailer(settings)
    sent_count = 0
    failure_count = 0
    for task in repository.active_tasks():
        task_changed = False
        for recipient in task.get("recipients", []):
            reason = reminder_reason(task, recipient, now, settings.task_timezone)
            if not reason:
                continue
            try:
                if send_task_email(
                    repository,
                    mailer,
                    task,
                    recipient,
                    event_kind="reminder",
                    event_day=local_day,
                    reason=reason,
                ):
                    recipient["lastReminderAtUtc"] = iso_utc(now)
                    recipient["reminderCount"] = int(recipient.get("reminderCount", 0)) + 1
                    task_changed = True
                    sent_count += 1
            except Exception:
                logging.exception("Reminder failed for task %s recipient %s", task["id"], recipient["email"])
                failure_count += 1
        if task_changed:
            repository.replace_task(task)

    logging.info("Daily reminder run complete. sent=%s failed=%s", sent_count, failure_count)
