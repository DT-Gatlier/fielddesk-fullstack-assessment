CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Job"
ADD CONSTRAINT "Job_schedule_window_check"
CHECK (
  ("scheduledStart" IS NULL) = ("scheduledEnd" IS NULL)
  AND ("scheduledStart" IS NULL OR "scheduledStart" < "scheduledEnd")
);

ALTER TABLE "Job"
ADD CONSTRAINT "Job_technician_schedule_no_overlap"
EXCLUDE USING gist (
  "technicianId" WITH =,
  tsrange("scheduledStart", "scheduledEnd", '[)') WITH &&
)
WHERE (
  "technicianId" IS NOT NULL
  AND "scheduledStart" IS NOT NULL
  AND "scheduledEnd" IS NOT NULL
  AND "status" NOT IN ('COMPLETED', 'CANCELLED')
);
