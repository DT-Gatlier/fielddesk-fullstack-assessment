"""One error shape for every failure: {"error": {"code", "message", "details", "request_id"}}."""
from rest_framework.views import exception_handler as drf_handler

CODES = {
    400: "validation_error", 401: "unauthenticated", 403: "forbidden", 404: "not_found",
    405: "method_not_allowed", 409: "conflict", 413: "payload_too_large", 415: "unsupported_media_type",
    429: "rate_limited",
}


def handler(exc, context):
    response = drf_handler(exc, context)
    if response is None:  # unhandled -> Django returns a generic 500 (logged with the request id)
        return None
    data = response.data
    details = data if isinstance(data, dict) else {"non_field_errors": data}
    if response.status_code == 400:
        message = "Validation failed."
    else:
        message = str(details.get("detail", "Request failed."))
    request = context.get("request")
    response.data = {
        "error": {
            "code": getattr(exc, "error_code", None) or CODES.get(response.status_code, "error"),
            "message": message,
            "details": details,
            "request_id": request.META.get("REQUEST_ID") if request is not None else None,
        }
    }
    return response
