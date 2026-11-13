import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";

export async function ensureDatabaseSeeded() {
  try {
    const orgCount = await prisma.organisation.count();
    if (orgCount > 0) return;

    const orgApex = await prisma.organisation.create({
      data: {
        id: "org-apex-001",
        name: "Apex Facility Services",
        slug: "apex-facility",
      },
    });

    const orgMetro = await prisma.organisation.create({
      data: {
        id: "org-metro-002",
        name: "Metro HVAC Solutions",
        slug: "metro-hvac",
      },
    });

    const passwordHash = await bcrypt.hash("password123", 10);

    await prisma.user.createMany({
      data: [
        {
          id: "usr-apex-owner",
          email: "owner@apex.com",
          name: "Sarah Jenkins",
          role: "OWNER",
          organisationId: orgApex.id,
          passwordHash,
        },
        {
          id: "usr-apex-dispatcher",
          email: "dispatcher@apex.com",
          name: "David Miller",
          role: "DISPATCHER",
          organisationId: orgApex.id,
          passwordHash,
        },
        {
          id: "usr-apex-technician",
          email: "tech@apex.com",
          name: "Alex Rivera",
          role: "TECHNICIAN",
          organisationId: orgApex.id,
          passwordHash,
        },
        {
          id: "usr-metro-owner",
          email: "owner@metro.com",
          name: "Michael Chen",
          role: "OWNER",
          organisationId: orgMetro.id,
          passwordHash,
        },
        {
          id: "usr-metro-dispatcher",
          email: "dispatcher@metro.com",
          name: "Elena Rostova",
          role: "DISPATCHER",
          organisationId: orgMetro.id,
          passwordHash,
        },
        {
          id: "usr-metro-technician",
          email: "tech@metro.com",
          name: "Marcus Vance",
          role: "TECHNICIAN",
          organisationId: orgMetro.id,
          passwordHash,
        },
      ],
    });

    await prisma.workOrder.createMany({
      data: [
        {
          id: "wo-apex-001",
          referenceNumber: "WO-2026-001",
          title: "Chiller Compressor Overhaul",
          description: "Inspect and repair vibration anomaly in main stage compressor loop.",
          priority: "HIGH",
          status: "IN_PROGRESS",
          siteName: "North Central Hospital",
          organisationId: orgApex.id,
          creatorId: "usr-apex-dispatcher",
          assignedTechnicianId: "usr-apex-technician",
          scheduledStart: new Date(Date.now() + 3600000),
          scheduledEnd: new Date(Date.now() + 10800000),
        },
        {
          id: "wo-apex-002",
          referenceNumber: "WO-2026-002",
          title: "Air Handling Unit Filter Replacement",
          description: "Quarterly HEPA and pre-filter swap across rooftop units.",
          priority: "MEDIUM",
          status: "PENDING",
          siteName: "Tech Hub Building 4",
          organisationId: orgApex.id,
          creatorId: "usr-apex-dispatcher",
          assignedTechnicianId: "usr-apex-technician",
          scheduledStart: new Date(Date.now() + 14400000),
          scheduledEnd: new Date(Date.now() + 21600000),
        },
        {
          id: "wo-apex-003",
          referenceNumber: "WO-2026-003",
          title: "Boiler Pressure Relief Calibration",
          description: "Annual safety valve testing and discharge piping inspection.",
          priority: "LOW",
          status: "COMPLETED",
          siteName: "Harbor Logistics Terminal",
          organisationId: orgApex.id,
          creatorId: "usr-apex-dispatcher",
          assignedTechnicianId: "usr-apex-technician",
          scheduledStart: new Date(Date.now() - 86400000),
          scheduledEnd: new Date(Date.now() - 79200000),
        },
        {
          id: "wo-metro-001",
          referenceNumber: "WO-2026-101",
          title: "Rooftop Condenser Coil Chemical Clean",
          description: "Perform acid wash and fin straightener maintenance.",
          priority: "HIGH",
          status: "IN_PROGRESS",
          siteName: "Metro Plaza Tower A",
          organisationId: orgMetro.id,
          creatorId: "usr-metro-dispatcher",
          assignedTechnicianId: "usr-metro-technician",
          scheduledStart: new Date(Date.now() + 3600000),
          scheduledEnd: new Date(Date.now() + 10800000),
        },
        {
          id: "wo-metro-002",
          referenceNumber: "WO-2026-102",
          title: "Thermostat Sensor Calibration & Wiring",
          description: "Calibrate BACnet digital sensors on floors 3 through 7.",
          priority: "MEDIUM",
          status: "PENDING",
          siteName: "Downtown Financial Suite",
          organisationId: orgMetro.id,
          creatorId: "usr-metro-dispatcher",
          assignedTechnicianId: "usr-metro-technician",
          scheduledStart: new Date(Date.now() + 14400000),
          scheduledEnd: new Date(Date.now() + 21600000),
        },
        {
          id: "wo-metro-003",
          referenceNumber: "WO-2026-103",
          title: "Quarterly Heat Pump Commissioning",
          description: "Test reversing valve and verify refrigerant charge levels.",
          priority: "LOW",
          status: "COMPLETED",
          siteName: "Grand Central Mall",
          organisationId: orgMetro.id,
          creatorId: "usr-metro-dispatcher",
          assignedTechnicianId: "usr-metro-technician",
          scheduledStart: new Date(Date.now() - 86400000),
          scheduledEnd: new Date(Date.now() - 79200000),
        },
      ],
    });

    console.log("Database initialized with seed data.");
  } catch (err: any) {
    console.error("Seed check notice:", err.message);
  }
}
