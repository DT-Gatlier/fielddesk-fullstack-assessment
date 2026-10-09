-- AlterTable: Add storageQuotaBytes to Organisation (default 50MB: 52428800 bytes)
ALTER TABLE "Organisation" ADD COLUMN "storageQuotaBytes" BIGINT NOT NULL DEFAULT 52428800;

-- CreateTable: Attachment
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_organisationId_workOrderId_createdAt_idx" ON "Attachment"("organisationId", "workOrderId", "createdAt" DESC);
CREATE INDEX "Attachment_organisationId_createdAt_idx" ON "Attachment"("organisationId", "createdAt");

-- AddForeignKey (Standard Prisma relations)
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add Tenant Composite Foreign Keys (Strict multi-tenant boundaries)
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workOrder_tenant_fkey"
    FOREIGN KEY ("organisationId", "workOrderId")
    REFERENCES "WorkOrder"("organisationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploader_tenant_fkey"
    FOREIGN KEY ("organisationId", "uploaderId")
    REFERENCES "User"("organisationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
