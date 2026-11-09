-- ==============================================================================
-- Seed 001: Organisations and Users for Assessment
-- Seeded Password for all users: password123 (bcrypt 10 rounds)
-- ==============================================================================

-- 1. Insert Two Distinct Organisations
INSERT INTO organisations (id, name, storage_quota_bytes) VALUES
('org-apex-01', 'Apex Facilities Management', 524288000),      -- 500 MB
('org-summit-02', 'Summit Infrastructure Services', 524288000) -- 500 MB
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Users for Organisation 1: Apex Facilities
-- Hash for 'password123': $2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C
INSERT INTO users (id, organisation_id, email, password_hash, name, role) VALUES
('11111111-1111-1111-1111-111111111101', 'org-apex-01', 'owner@apex.test', '$2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C', 'Alice Owner (Apex)', 'owner'),
('11111111-1111-1111-1111-111111111102', 'org-apex-01', 'dispatcher@apex.test', '$2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C', 'David Dispatcher (Apex)', 'dispatcher'),
('11111111-1111-1111-1111-111111111103', 'org-apex-01', 'technician@apex.test', '$2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C', 'Tom Technician (Apex)', 'technician'),
('11111111-1111-1111-1111-111111111104', 'org-apex-01', 'technician2@apex.test', '$2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C', 'Tina Technician (Apex)', 'technician')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Users for Organisation 2: Summit Infrastructure
INSERT INTO users (id, organisation_id, email, password_hash, name, role) VALUES
('22222222-2222-2222-2222-222222222201', 'org-summit-02', 'owner@summit.test', '$2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C', 'Sam Owner (Summit)', 'owner'),
('22222222-2222-2222-2222-222222222202', 'org-summit-02', 'dispatcher@summit.test', '$2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C', 'Diana Dispatcher (Summit)', 'dispatcher'),
('22222222-2222-2222-2222-222222222203', 'org-summit-02', 'technician@summit.test', '$2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C', 'Terry Technician (Summit)', 'technician')
ON CONFLICT (id) DO NOTHING;

