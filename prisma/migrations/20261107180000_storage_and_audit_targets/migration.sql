ALTER TABLE "organisations"
ADD COLUMN "storageUsedBytes" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "AuditLog"
ALTER COLUMN "jobId" DROP NOT NULL,
ADD COLUMN "targetId" TEXT,
ADD COLUMN "targetType" TEXT NOT NULL DEFAULT 'job';

CREATE INDEX "AuditLog_organisationId_targetType_targetId_idx"
ON "AuditLog"("organisationId", "targetType", "targetId");

DROP INDEX "ProgressEvent_jobId_idempotencyKey_key";

CREATE UNIQUE INDEX "ProgressEvent_idempotencyKey_key"
ON "ProgressEvent"("idempotencyKey");
