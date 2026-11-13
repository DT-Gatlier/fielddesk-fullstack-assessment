import assert from "node:assert/strict";
import test from "node:test";
import { UnrecoverableError } from "bullmq";
import { sendMockNotification } from "./provider.js";

test("mock provider returns a delivery result on success", async () => {
  const result = await sendMockNotification("success", "tech-1", "work-1");
  assert.equal(result.status, "DELIVERED");
  assert.equal(result.technicianId, "tech-1");
  assert.ok(Date.parse(result.deliveredAt) > 0);
});

test("temporary provider failures remain retryable", async () => {
  await assert.rejects(sendMockNotification("temporary_failure", "tech-1", "work-1"), (error: Error) => {
    assert.equal(error.message, "Mock provider temporary failure");
    assert.equal(error instanceof UnrecoverableError, false);
    return true;
  });
});

test("permanent provider failures stop BullMQ retries", async () => {
  await assert.rejects(sendMockNotification("permanent_failure", "tech-1", "work-1"), (error: Error) => error instanceof UnrecoverableError);
  await assert.rejects(sendMockNotification("unknown", "tech-1", "work-1"), (error: Error) => error instanceof UnrecoverableError);
});
