-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_organisationId_workOrderId_fkey";

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organisationId_workOrderId_fkey" FOREIGN KEY ("organisationId", "workOrderId") REFERENCES "work_orders"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
