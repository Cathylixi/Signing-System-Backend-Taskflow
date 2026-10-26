from datetime import datetime, timedelta, timezone

import pytest

from shared.models import ValidationError
from shared.signing_models import (
    assert_assignment_transition,
    build_document,
    build_signature_field,
    build_signing_request_bundle,
    recalculate_request_summary,
)


def future(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def request_payload():
    return {
        "documentId": "document-1",
        "title": "Vendor Services Agreement",
        "emailSubject": "Signature requested",
        "htmlBody": "<p>Please review and sign.</p>",
        "enforceSigningOrder": True,
        "signers": [
            {"displayName": "Alex Morgan", "email": "alex@example.com", "dueAt": future(3)},
            {"displayName": "Jamie Lee", "email": "jamie@example.com", "dueAt": future(6)},
        ],
    }


def test_build_document_creates_blob_reference():
    document = build_document(
        {
            "title": "Vendor Agreement",
            "documentType": "agreement",
            "fileName": "vendor.pdf",
            "contentType": "application/pdf",
            "sizeBytes": 100,
            "originalBlobPath": "documents/default/request/original/vendor.pdf",
        },
        tenant_id="default",
        uploaded_by="admin@example.com",
    )

    assert document["recordType"] == "document"
    assert document["status"] == "uploaded"
    assert document["originalBlobPath"].startswith("documents/")


def test_build_signing_request_creates_independent_assignments():
    request, assignments = build_signing_request_bundle(
        request_payload(),
        tenant_id="default",
        created_by="admin@example.com",
        maximum_signers=50,
    )

    assert request["recordType"] == "signatureRequest"
    assert request["recipientCount"] == 2
    assert [item["signingOrder"] for item in assignments] == [1, 2]
    assert {item["requestId"] for item in assignments} == {request["id"]}


def test_build_signing_request_rejects_duplicate_email():
    payload = request_payload()
    payload["signers"][1]["email"] = "ALEX@example.com"

    with pytest.raises(ValidationError, match="Duplicate signer email"):
        build_signing_request_bundle(
            payload,
            tenant_id="default",
            created_by="admin@example.com",
            maximum_signers=50,
        )


def test_signature_field_requires_valid_page_and_size():
    field = build_signature_field(
        {
            "requestId": "request-1",
            "assignmentId": "assignment-1",
            "fieldType": "signature",
            "pageNumber": 1,
            "x": 100,
            "y": 200,
            "width": 180,
            "height": 50,
        },
        tenant_id="default",
    )

    assert field["recordType"] == "signatureField"
    assert field["required"] is True


def test_signed_assignment_cannot_return_to_invited():
    with pytest.raises(ValidationError, match="Cannot change"):
        assert_assignment_transition("signed", "invited")


def test_request_summary_is_derived_from_assignments():
    request, assignments = build_signing_request_bundle(
        request_payload(),
        tenant_id="default",
        created_by="admin@example.com",
        maximum_signers=50,
    )
    request["sentAtUtc"] = datetime.now(timezone.utc).isoformat()
    assignments[0]["status"] = "signed"
    assignments[1]["status"] = "invited"

    recalculate_request_summary(request, assignments)

    assert request["status"] == "partially_signed"
    assert request["completedSignerCount"] == 1
    assert request["nextDueAtUtc"] == assignments[1]["dueAtUtc"]

    assignments[1]["status"] = "signed"
    recalculate_request_summary(request, assignments)

    assert request["status"] == "completed"
    assert request["completedSignerCount"] == 2
    assert request["nextDueAtUtc"] is None
