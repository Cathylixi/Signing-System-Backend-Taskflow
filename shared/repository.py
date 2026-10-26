from __future__ import annotations

import hashlib
from datetime import timedelta
from typing import Any

from azure.cosmos import CosmosClient, exceptions
from azure.identity import DefaultAzureCredential

from .config import Settings
from .time_utils import iso_utc, parse_datetime, utc_now


class RecordNotFound(Exception):
    pass


class Repository:
    def __init__(self, settings: Settings):
        if settings.cosmos_connection_string:
            client = CosmosClient.from_connection_string(settings.cosmos_connection_string)
        else:
            if not settings.cosmos_endpoint:
                raise RuntimeError("COSMOS_ENDPOINT is not configured")
            client = CosmosClient(settings.cosmos_endpoint, credential=DefaultAzureCredential())
        database = client.get_database_client(settings.cosmos_database_name)
        self.container = database.get_container_client(settings.cosmos_container_name)
        self.tenant_id = settings.tenant_id

    def create_task(self, task: dict[str, Any]) -> dict[str, Any]:
        return self.container.create_item(task)

    def create_record(self, record: dict[str, Any]) -> dict[str, Any]:
        if record.get("tenantId") != self.tenant_id:
            raise ValueError("Record tenantId does not match the configured tenant")
        return self.container.create_item(record)

    def create_records(self, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not records:
            return []
        for record in records:
            if record.get("tenantId") != self.tenant_id:
                raise ValueError("Record tenantId does not match the configured tenant")
        operations = [("create", (record,)) for record in records]
        return list(self.container.execute_item_batch(operations, partition_key=self.tenant_id))

    def get_record(self, record_id: str, record_type: str | None = None) -> dict[str, Any]:
        try:
            item = self.container.read_item(item=record_id, partition_key=self.tenant_id)
        except exceptions.CosmosResourceNotFoundError as exc:
            raise RecordNotFound(f"Record {record_id} was not found") from exc
        if record_type and item.get("recordType") != record_type:
            raise RecordNotFound(f"{record_type} record {record_id} was not found")
        return item

    def replace_record(self, record: dict[str, Any]) -> dict[str, Any]:
        if record.get("tenantId") != self.tenant_id:
            raise ValueError("Record tenantId does not match the configured tenant")
        record["updatedAtUtc"] = iso_utc(utc_now())
        record["_version"] = int(record.get("_version", 0)) + 1
        return self.container.replace_item(item=record["id"], body=record)

    def list_records(
        self,
        record_type: str,
        *,
        request_id: str | None = None,
        document_id: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM c WHERE c.tenantId = @tenant AND c.recordType = @recordType"
        parameters: list[dict[str, Any]] = [
            {"name": "@tenant", "value": self.tenant_id},
            {"name": "@recordType", "value": record_type},
        ]
        filters = (
            ("requestId", request_id, "@requestId"),
            ("documentId", document_id, "@documentId"),
            ("status", status, "@status"),
        )
        for field, value, parameter_name in filters:
            if value is None:
                continue
            query += f" AND c.{field} = {parameter_name}"
            parameters.append({"name": parameter_name, "value": value})
        items = list(
            self.container.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=False,
            )
        )
        return sorted(items, key=lambda item: item.get("createdAtUtc", ""))

    def create_signing_request_bundle(
        self,
        request: dict[str, Any],
        assignments: list[dict[str, Any]],
        audit_event: dict[str, Any],
    ) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
        records = [request, *assignments, audit_event]
        responses = self.create_records(records)
        created_request = responses[0]
        created_assignments = responses[1 : 1 + len(assignments)]
        created_audit = responses[-1]
        return created_request, created_assignments, created_audit

    def list_signer_assignments(
        self,
        request_id: str,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        items = self.list_records("signerAssignment", request_id=request_id, status=status)
        return sorted(items, key=lambda item: (int(item.get("signingOrder", 0)), item.get("signerEmail", "")))

    def list_audit_events(self, request_id: str) -> list[dict[str, Any]]:
        return self.list_records("auditEvent", request_id=request_id)

    def get_task(self, task_id: str) -> dict[str, Any]:
        try:
            item = self.container.read_item(item=task_id, partition_key=self.tenant_id)
        except exceptions.CosmosResourceNotFoundError as exc:
            raise RecordNotFound(f"Task {task_id} was not found") from exc
        if item.get("recordType") != "task":
            raise RecordNotFound(f"Task {task_id} was not found")
        return item

    def replace_task(self, task: dict[str, Any]) -> dict[str, Any]:
        task["updatedAtUtc"] = iso_utc(utc_now())
        task["_version"] = int(task.get("_version", 0)) + 1
        return self.container.replace_item(item=task["id"], body=task)

    def list_tasks(self, status: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM c WHERE c.tenantId = @tenant AND c.recordType = 'task'"
        parameters: list[dict[str, Any]] = [{"name": "@tenant", "value": self.tenant_id}]
        if status:
            query += " AND c.status = @status"
            parameters.append({"name": "@status", "value": status})
        items = list(
            self.container.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=False,
            )
        )
        return sorted(items, key=lambda item: item.get("createdAtUtc", ""), reverse=True)

    def active_tasks(self) -> list[dict[str, Any]]:
        return self.list_tasks(status="active")

    def claim_daily_run(self, local_day: str) -> bool:
        record = {
            "id": f"daily-run-{local_day}",
            "tenantId": self.tenant_id,
            "recordType": "dailyRun",
            "localDay": local_day,
            "createdAtUtc": iso_utc(utc_now()),
        }
        try:
            self.container.create_item(record)
            return True
        except exceptions.CosmosResourceExistsError:
            return False

    @staticmethod
    def _event_id(task_id: str, recipient: str, event_kind: str, event_day: str) -> str:
        digest = hashlib.sha256(recipient.lower().encode("utf-8")).hexdigest()[:16]
        return f"event-{task_id}-{event_kind}-{event_day}-{digest}"

    def claim_event(
        self,
        task_id: str,
        recipient: str,
        event_kind: str,
        event_day: str,
        reason: str,
    ) -> dict[str, Any] | None:
        event_id = self._event_id(task_id, recipient, event_kind, event_day)
        now = utc_now()
        event = {
            "id": event_id,
            "tenantId": self.tenant_id,
            "recordType": "notificationEvent",
            "taskId": task_id,
            "recipient": recipient,
            "eventKind": event_kind,
            "eventDay": event_day,
            "reason": reason,
            "status": "processing",
            "attemptCount": 1,
            "createdAtUtc": iso_utc(now),
            "updatedAtUtc": iso_utc(now),
            "lastError": None,
        }
        try:
            return self.container.create_item(event)
        except exceptions.CosmosResourceExistsError:
            existing = self.container.read_item(item=event_id, partition_key=self.tenant_id)
            if existing.get("status") == "sent":
                return None
            if existing.get("status") == "processing":
                updated = parse_datetime(existing.get("updatedAtUtc", existing["createdAtUtc"]))
                if updated > now - timedelta(minutes=15):
                    return None
            existing.update(
                {
                    "status": "processing",
                    "attemptCount": int(existing.get("attemptCount", 0)) + 1,
                    "updatedAtUtc": iso_utc(now),
                    "lastError": None,
                }
            )
            return self.container.replace_item(item=event_id, body=existing)

    def finish_event(self, event: dict[str, Any], success: bool, error: str | None = None) -> None:
        event["status"] = "sent" if success else "failed"
        event["updatedAtUtc"] = iso_utc(utc_now())
        event["sentAtUtc"] = iso_utc(utc_now()) if success else None
        event["lastError"] = error[:2_000] if error else None
        self.container.replace_item(item=event["id"], body=event)

    def list_events(self, task_id: str) -> list[dict[str, Any]]:
        items = list(
            self.container.query_items(
                query=(
                    "SELECT * FROM c WHERE c.tenantId = @tenant "
                    "AND c.recordType = 'notificationEvent' AND c.taskId = @task"
                ),
                parameters=[
                    {"name": "@tenant", "value": self.tenant_id},
                    {"name": "@task", "value": task_id},
                ],
                enable_cross_partition_query=False,
            )
        )
        return sorted(items, key=lambda item: item.get("createdAtUtc", ""), reverse=True)
