CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "work_orders"
ADD CONSTRAINT "work_orders_valid_schedule"
CHECK (
    "scheduledStart" IS NULL
    OR "scheduledEnd" IS NULL
    OR "scheduledEnd" > "scheduledStart"
);

ALTER TABLE "work_orders"
ADD CONSTRAINT "work_orders_no_technician_overlap"
EXCLUDE USING GIST (
    "organisationId" WITH =,
    "assignedTechnicianId" WITH =,
    tsrange("scheduledStart", "scheduledEnd", '[)') WITH &&
)
WHERE (
    "assignedTechnicianId" IS NOT NULL
    AND "scheduledStart" IS NOT NULL
    AND "scheduledEnd" IS NOT NULL
    AND "status" NOT IN ('CANCELLED', 'COMPLETED')
);