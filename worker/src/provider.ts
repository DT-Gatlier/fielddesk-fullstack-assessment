import { UnrecoverableError } from "bullmq";

export type MockProviderMode = "success" | "temporary_failure" | "permanent_failure";

export async function sendMockNotification(mode: string, technicianId: string, workOrderId: string) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  if (mode === "temporary_failure") throw new Error("Mock provider temporary failure");
  if (mode === "permanent_failure") throw new UnrecoverableError("Mock provider rejected the notification permanently");
  if (mode !== "success") throw new UnrecoverableError("MOCK_PROVIDER_MODE must be success, temporary_failure, or permanent_failure");
  return { deliveredAt: new Date().toISOString(), channel: "sms_and_push", status: "DELIVERED", technicianId, workOrderId };
}

