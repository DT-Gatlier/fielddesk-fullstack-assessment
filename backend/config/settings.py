"""All configuration comes from environment variables (see .env.example). No secrets live in the repo."""
import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _flag(name, default="0"):
    return os.environ.get(name, default) == "1"


SECRET_KEY = os.environ["SECRET_KEY"]  # required: fail fast if missing
DEBUG = _flag("DEBUG")
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1,backend").split(",") if h.strip()]

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.postgres",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "accounts",
    "core",
    "work_orders",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "core.middleware.RequestIdMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
AUTH_USER_MODEL = "accounts.User"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["DB_NAME"],
        "USER": os.environ["DB_USER"],
        "PASSWORD": os.environ["DB_PASSWORD"],
        "HOST": os.environ.get("DB_HOST", "db"),
        "PORT": os.environ.get("DB_PORT", "5432"),
        "CONN_MAX_AGE": 0,
    }
}

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
# Shared cache so rate limits are enforced across ALL API instances/workers (LocMem would be per-process)
CACHES = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

USE_TZ = True
TIME_ZONE = "UTC"

MEDIA_ROOT = os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media"))  # never served publicly; downloads go through the API

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],  # deny by default
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_RATES": {"login": "5/min", "events": "60/min"},
    "EXCEPTION_HANDLER": "core.exceptions.handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(hours=1),
    "AUTH_HEADER_TYPES": ("Bearer",),
}
COOKIE_SECURE = _flag("COOKIE_SECURE")  # set COOKIE_SECURE=1 behind HTTPS

ORG_STORAGE_LIMIT_BYTES = int(os.environ.get("ORG_STORAGE_LIMIT_BYTES", 50 * 1024 * 1024))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 5 * 1024 * 1024))

NOTIFY_PROVIDER_MODE = os.environ.get("NOTIFY_PROVIDER_MODE", "success")  # success | temporary | permanent
NOTIFY_MAX_RETRIES = int(os.environ.get("NOTIFY_MAX_RETRIES", 5))
SSE_POLL_TIMEOUT = float(os.environ.get("SSE_POLL_TIMEOUT", 15))
SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "Passw0rd!demo")

CELERY_BROKER_URL = REDIS_URL
CELERY_TASK_ACKS_LATE = True  # a task is only acknowledged after it finishes
CELERY_TASK_REJECT_ON_WORKER_LOST = True  # worker crash -> task is redelivered (so handlers must be idempotent)
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "core.log.RequestIdFilter"}},
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.json.JsonFormatter",
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s %(request_id)s",
        }
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "json", "filters": ["request_id"]}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}
