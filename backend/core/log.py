import contextvars
import logging

request_id_var = contextvars.ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Adds the current request's correlation id to every log record."""

    def filter(self, record):
        record.request_id = request_id_var.get()
        return True
