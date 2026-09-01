import os
import time
import logging
from celery import Celery
from .database import SessionLocal
from .models import Notification

redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "worker",
    broker=redis_url
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

logger = logging.getLogger(__name__)

class ProviderTemporaryError(Exception):
    pass

class ProviderPermanentError(Exception):
    pass

def mock_send_notification(notification_id: str, attempts: int):
    if attempts < 3:
        raise ProviderTemporaryError("Provider unavailable")
    if attempts >= 4:
        raise ProviderPermanentError("Provider permanently rejected request")
    return True

@celery_app.task(bind=True, max_retries=5)
def send_assignment_notification(self, notification_id: str):
    db = SessionLocal()
    notification = None
    try:
        notification = db.query(Notification).filter(Notification.id == notification_id).first()
        if not notification:
            logger.error(f"Notification {notification_id} not found")
            return

        if notification.status in ["sent", "failed"]:
            logger.info(f"Notification {notification_id} already processed. Status: {notification.status}")
            return

        notification.attempts += 1
        db.commit()

        try:
            mock_send_notification(notification_id, notification.attempts)
            
            notification.status = "sent"
            db.commit()
            logger.info(f"Notification {notification_id} sent successfully")
            
        except ProviderTemporaryError as e:
            logger.warning(f"Temporary error sending notification {notification_id}: {str(e)}")
            countdown = 2 ** notification.attempts
            db.commit()
            raise self.retry(exc=e, countdown=countdown)
            
        except ProviderPermanentError as e:
            logger.error(f"Permanent error sending notification {notification_id}: {str(e)}")
            notification.status = "failed"
            db.commit()

    except Exception as e:
        if type(e).__name__ == "Retry":
            raise
        logger.exception(f"Unexpected error processing notification {notification_id}")
        if notification:
            notification.status = "failed"
            db.commit()
    finally:
        db.close()
