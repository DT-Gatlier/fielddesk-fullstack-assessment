from .settings import *  # noqa: F401,F403

# Tests run against the real Postgres + Redis from docker-compose, but isolated from dev data.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"login": "1000/min", "events": "1000/min"}}  # noqa: F405
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # speed only; production uses PBKDF2
REDIS_URL = REDIS_URL.rsplit("/", 1)[0] + "/15"  # noqa: F405  (separate Redis DB for tests)
CELERY_TASK_ALWAYS_EAGER = True
SSE_POLL_TIMEOUT = 2
