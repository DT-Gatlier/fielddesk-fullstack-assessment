-- AlterTable: Add contentHash to Attachment
ALTER TABLE "Attachment" ADD COLUMN "contentHash" CHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';

-- Remove default after applying
ALTER TABLE "Attachment" ALTER COLUMN "contentHash" DROP DEFAULT;

-- CreateUniqueIndex: prevent duplicate uploads of the exact same content in the same work order
CREATE UNIQUE INDEX "Attachment_organisationId_workOrderId_contentHash_key" ON "Attachment"("organisationId", "workOrderId", "contentHash");

-- CreateIndex: facilitate content deduplication lookup across the organisation
CREATE INDEX "Attachment_organisationId_contentHash_idx" ON "Attachment"("organisationId", "contentHash");
