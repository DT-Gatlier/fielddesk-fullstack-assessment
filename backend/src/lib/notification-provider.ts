export class TransientNotificationError extends Error {
  constructor(message = "Transient notification provider failure") {
    super(message);
    this.name = "TransientNotificationError";
  }
}

export class PermanentNotificationError extends Error {
  constructor(message = "Permanent notification provider failure") {
    super(message);
    this.name = "PermanentNotificationError";
  }
}

export type NotificationMockMode = "success" | "transient" | "permanent";

export function parseNotificationMockMode(
  value: string | undefined,
): NotificationMockMode {
  if (value === "transient" || value === "permanent") {
    return value;
  }
  return "success";
}

export async function sendMockNotification(
  mode: NotificationMockMode,
  attemptNumber: number,
): Promise<void> {
  if (mode === "success") {
    return;
  }

  if (mode === "permanent") {
    throw new PermanentNotificationError("Mock provider rejected the notification");
  }

  if (attemptNumber < 3) {
    throw new TransientNotificationError(
      `Mock provider temporarily unavailable (attempt ${attemptNumber})`,
    );
  }
}
