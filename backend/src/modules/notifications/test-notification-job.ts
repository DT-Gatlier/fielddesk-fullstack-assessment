import "dotenv/config";

import {
  buildNotificationDedupeKey,
  createNotificationJob,
} from "./notification-job.service";

async function main() {
  const organisationId = "org-a";
  const workOrderId = "2eb1da5f-c50e-4976-ac17-20bca3ec0855";
  const technicianId = "user-a-technician";

  const dedupeKey = buildNotificationDedupeKey(
    organisationId,
    workOrderId,
    technicianId,
    "WORK_ORDER_ASSIGNED",
  );

  const job = await createNotificationJob({
    organisationId,
    workOrderId,
    technicianId,
    dedupeKey,
  });

  console.log("Notification job:");
  console.dir(job, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});