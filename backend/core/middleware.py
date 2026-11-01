import logging
import re
import time
import uuid

from .log import request_id_var

logger = logging.getLogger("fielddesk.request")
SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


class RequestIdMiddleware:
    """Correlation id: reuse a well-formed X-Request-ID from the caller, otherwise generate one."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        rid = request.headers.get("X-Request-ID", "")
        if not SAFE_ID.match(rid):  # never log arbitrary client-controlled text
            rid = uuid.uuid4().hex
        request.META["REQUEST_ID"] = rid
        token = request_id_var.set(rid)
        started = time.monotonic()
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = rid
            if request.path not in ("/health", "/ready"):
                logger.info(
                    "request",
                    extra={
                        "method": request.method,
                        "path": request.path,
                        "status": response.status_code,
                        "duration_ms": round((time.monotonic() - started) * 1000, 1),
                    },
                )
            return response
        finally:
            request_id_var.reset(token)
