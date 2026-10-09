-- Enable btree_gist extension for PostgreSQL exclusion constraint over scalar + range
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "WorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "siteName" TEXT NOT NULL,
    "creatorId" UUID NOT NULL,
    "assignedTechnicianId" UUID,
    "scheduledStart" TIMESTAMPTZ(3),
    "scheduledEnd" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkOrder_valid_schedule_window_check" CHECK (
        ("scheduledStart" IS NULL AND "scheduledEnd" IS NULL) OR
        ("scheduledStart" IS NOT NULL AND "scheduledEnd" IS NOT NULL AND "scheduledStart" < "scheduledEnd")
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_organisationId_reference_key" ON "WorkOrder"("organisationId", "reference");
CREATE INDEX "WorkOrder_organisationId_status_idx" ON "WorkOrder"("organisationId", "status");
CREATE INDEX "WorkOrder_organisationId_assignedTechnicianId_idx" ON "WorkOrder"("organisationId", "assignedTechnicianId");
CREATE INDEX "WorkOrder_organisationId_scheduledStart_idx" ON "WorkOrder"("organisationId", "scheduledStart");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce tenant composite foreign key so technician must belong to the exact same organisation
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assignedTechnician_tenant_fkey"
    FOREIGN KEY ("organisationId", "assignedTechnicianId")
    REFERENCES "User"("organisationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL range exclusion constraint: prevent overlapping assignments for the same technician
-- Uses half-open intervals [start, end) so adjacent jobs are allowed.
-- Active only for SCHEDULED and IN_PROGRESS jobs; cancelled/completed jobs release the slot.
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_technician_no_overlap"
    EXCLUDE USING gist (
        "organisationId" WITH =,
        "assignedTechnicianId" WITH =,
        tstzrange("scheduledStart", "scheduledEnd", '[)') WITH &&
    )
    WHERE (
        "assignedTechnicianId" IS NOT NULL
        AND "scheduledStart" IS NOT NULL
        AND "scheduledEnd" IS NOT NULL
        AND "status" IN ('SCHEDULED', 'IN_PROGRESS')
    );
