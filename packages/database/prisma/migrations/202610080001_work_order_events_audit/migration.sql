-- CreateEnum
CREATE TYPE "WorkOrderEventType" AS ENUM ('STATUS_CHANGED', 'NOTE_ADDED', 'WORK_STARTED', 'WORK_COMPLETED');

-- CreateTable
CREATE TABLE "WorkOrderEvent" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "organisationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "WorkOrderEventType" NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderEvent_organisationId_eventId_key" ON "WorkOrderEvent"("organisationId", "eventId");
CREATE INDEX "WorkOrderEvent_organisationId_workOrderId_createdAt_idx" ON "WorkOrderEvent"("organisationId", "workOrderId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add composite unique on WorkOrder(organisationId, id) if not already exists (for tenant FK)
-- (WorkOrder table already has @@unique([organisationId, id]))
CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrder_organisationId_id_key" ON "WorkOrder"("organisationId", "id");

-- Enforce tenant composite foreign key so WorkOrderEvent cannot reference a work order or user in another organisation
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_workOrder_tenant_fkey"
    FOREIGN KEY ("organisationId", "workOrderId")
    REFERENCES "WorkOrder"("organisationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_user_tenant_fkey"
    FOREIGN KEY ("organisationId", "userId")
    REFERENCES "User"("organisationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
