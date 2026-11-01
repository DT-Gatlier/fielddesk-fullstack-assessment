from rest_framework.exceptions import APIException


class SchedulingConflict(APIException):
    status_code = 409
    error_code = "scheduling_conflict"
    default_detail = "The technician already has an overlapping work order in that time window."


class InvalidTransition(APIException):
    status_code = 409
    error_code = "invalid_transition"
    default_detail = "That status change is not allowed."


class EventConflict(APIException):
    status_code = 409
    error_code = "event_id_conflict"
    default_detail = "This eventId was already used with a different request body."


class UnsupportedFileType(APIException):
    status_code = 415
    error_code = "unsupported_file_type"
    default_detail = "Only PNG, JPEG or PDF files are accepted."


class FileTooLarge(APIException):
    status_code = 413
    error_code = "file_too_large"
    default_detail = "The file exceeds the maximum upload size."


class QuotaExceeded(APIException):
    status_code = 413
    error_code = "storage_quota_exceeded"
    default_detail = "Your organisation's storage limit would be exceeded."
