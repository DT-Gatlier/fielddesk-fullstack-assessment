-- ==============================================================================
-- Migration 001: Initial Schema (Organisations, Users, Work Orders, Refresh Tokens)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organisations Table
CREATE TABLE organisations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    storage_quota_bytes BIGINT NOT NULL DEFAULT 524288000, -- 500 MB default
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User Roles Enum
CREATE TYPE user_role AS ENUM ('owner', 'dispatcher', 'technician');

-- 3. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id VARCHAR(64) NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_org_email UNIQUE (organisation_id, email)
);

CREATE INDEX idx_users_org ON users(organisation_id);
CREATE INDEX idx_users_email ON users(email);

-- 4. Refresh Tokens Table (Token Family Rotation & Revocation)
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organisation_id VARCHAR(64) NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- 5. Work Order Priority and Status Enums
CREATE TYPE work_order_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE work_order_status AS ENUM ('open', 'in_progress', 'blocked', 'completed', 'cancelled');

-- 6. Work Orders Table
CREATE TABLE work_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id VARCHAR(64) NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    reference_number VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority work_order_priority NOT NULL DEFAULT 'medium',
    status work_order_status NOT NULL DEFAULT 'open',
    site_name VARCHAR(255) NOT NULL,
    assigned_technician_id UUID REFERENCES users(id) ON DELETE SET NULL,
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_work_orders_org_ref UNIQUE (organisation_id, reference_number),
    CONSTRAINT chk_scheduled_window CHECK (
        (scheduled_start IS NULL AND scheduled_end IS NULL) OR
        (scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL AND scheduled_end > scheduled_start)
    )
);

CREATE INDEX idx_work_orders_org ON work_orders(organisation_id);
CREATE INDEX idx_work_orders_org_status ON work_orders(organisation_id, status);
CREATE INDEX idx_work_orders_technician ON work_orders(assigned_technician_id) WHERE assigned_technician_id IS NOT NULL;
CREATE INDEX idx_work_orders_scheduled ON work_orders(scheduled_start, scheduled_end);

