CREATE TABLE "MockDelivery" (
  "notificationId" TEXT PRIMARY KEY REFERENCES "Notification"(id) ON DELETE CASCADE,
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);
CREATE TABLE "NotificationAttempt" (
  id BIGSERIAL PRIMARY KEY,
  "notificationId" TEXT NOT NULL REFERENCES "Notification"(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  UNIQUE ("notificationId", attempt)
);
