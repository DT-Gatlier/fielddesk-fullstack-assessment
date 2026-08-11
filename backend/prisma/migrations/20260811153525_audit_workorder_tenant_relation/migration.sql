-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_workOrderId_fkey";

-- CreateIndex
CREATE INDEX "audit_logs_organisationId_workOrderId_idx" ON "audit_logs"("organisationId", "workOrderId");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organisationId_workOrderId_fkey" FOREIGN KEY ("organisationId", "workOrderId") REFERENCES "work_orders"("organisationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
