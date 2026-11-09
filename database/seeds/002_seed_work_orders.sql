-- ==============================================================================
-- Seed 002: Seed Work Orders for Assessment
-- ==============================================================================

-- 1. Apex Facilities Work Orders
INSERT INTO work_orders (
    id, organisation_id, reference_number, title, description, priority, status, site_name, assigned_technician_id, scheduled_start, scheduled_end, created_by
) VALUES
(
    '10000000-0000-0000-0000-000000000001',
    'org-apex-01',
    'WO-APEX-1001',
    'HVAC Filter Replacement & Calibration',
    'Routine 6-month air handling unit filter replacement and thermostat recalibration on Level 3.',
    'medium',
    'open',
    'Apex Tower North - Floor 3',
    '11111111-1111-1111-1111-111111111103',
    '2026-11-10T09:00:00Z',
    '2026-11-10T11:00:00Z',
    '11111111-1111-1111-1111-111111111102'
),
(
    '10000000-0000-0000-0000-000000000002',
    'org-apex-01',
    'WO-APEX-1002',
    'Emergency Server Room Chiller Leak',
    'Water pooling detected beneath Chiller Unit B in primary server rack room. Urgent repair required.',
    'urgent',
    'in_progress',
    'Apex Data Center B2',
    '11111111-1111-1111-1111-111111111103',
    '2026-11-10T13:00:00Z',
    '2026-11-10T15:00:00Z',
    '11111111-1111-1111-1111-111111111102'
),
(
    '10000000-0000-0000-0000-000000000003',
    'org-apex-01',
    'WO-APEX-1003',
    'Fire Alarm Strobe Testing',
    'Quarterly audible and visual alarm compliance test.',
    'low',
    'completed',
    'Apex Headquarters Main Atrium',
    '11111111-1111-1111-1111-111111111104',
    '2026-11-09T08:00:00Z',
    '2026-11-09T10:00:00Z',
    '11111111-1111-1111-1111-111111111102'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Summit Infrastructure Work Orders (Isolated from Apex)
INSERT INTO work_orders (
    id, organisation_id, reference_number, title, description, priority, status, site_name, assigned_technician_id, scheduled_start, scheduled_end, created_by
) VALUES
(
    '20000000-0000-0000-0000-000000000001',
    'org-summit-02',
    'WO-SUMMIT-2001',
    'High Voltage Transformer Inspection',
    'Substation Alpha transformer oil level testing and infrared thermography.',
    'high',
    'open',
    'Summit Power Substation 04',
    '22222222-2222-2222-2222-222222222203',
    '2026-11-10T10:00:00Z',
    '2026-11-10T12:00:00Z',
    '22222222-2222-2222-2222-222222222202'
)
ON CONFLICT (id) DO NOTHING;

