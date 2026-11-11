import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

let pool: Pool | null = null;
let useMock = false;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      logger.error({ err: err.message }, 'Unexpected database pool error');
    });
  }
  return pool;
}

// In-memory mock database state for testing or when PG server is unreachable
export interface MockOrg {
  id: string;
  name: string;
  storage_quota_bytes: number;
}

export interface MockUser {
  id: string;
  organisation_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'owner' | 'dispatcher' | 'technician';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MockRefreshToken {
  id: string;
  user_id: string;
  organisation_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface MockWorkOrder {
  id: string;
  organisation_id: string;
  reference_number: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  site_name: string;
  assigned_technician_id: string | null;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface MockAuditLog {
  id: string;
  organisation_id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  before_state: any;
  after_state: any;
  metadata: any;
  created_at: Date;
}

const mockOrgs: MockOrg[] = [
  { id: 'org-apex-01', name: 'Apex Facilities Management', storage_quota_bytes: 524288000 },
  { id: 'org-summit-02', name: 'Summit Infrastructure Services', storage_quota_bytes: 524288000 },
];

const BCRYPT_HASH_PASSWORD123 = '$2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C';

const mockUsers: MockUser[] = [
  {
    id: '11111111-1111-1111-1111-111111111101',
    organisation_id: 'org-apex-01',
    email: 'owner@apex.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Alice Owner (Apex)',
    role: 'owner',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '11111111-1111-1111-1111-111111111102',
    organisation_id: 'org-apex-01',
    email: 'dispatcher@apex.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'David Dispatcher (Apex)',
    role: 'dispatcher',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '11111111-1111-1111-1111-111111111103',
    organisation_id: 'org-apex-01',
    email: 'technician@apex.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Tom Technician (Apex)',
    role: 'technician',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '11111111-1111-1111-1111-111111111104',
    organisation_id: 'org-apex-01',
    email: 'technician2@apex.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Tina Technician (Apex)',
    role: 'technician',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '22222222-2222-2222-2222-222222222201',
    organisation_id: 'org-summit-02',
    email: 'owner@summit.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Sam Owner (Summit)',
    role: 'owner',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '22222222-2222-2222-2222-222222222202',
    organisation_id: 'org-summit-02',
    email: 'dispatcher@summit.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Diana Dispatcher (Summit)',
    role: 'dispatcher',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '22222222-2222-2222-2222-222222222203',
    organisation_id: 'org-summit-02',
    email: 'technician@summit.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Terry Technician (Summit)',
    role: 'technician',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

const mockRefreshTokens: MockRefreshToken[] = [];

const initialMockWorkOrders: MockWorkOrder[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    organisation_id: 'org-apex-01',
    reference_number: 'WO-APEX-1001',
    title: 'HVAC Filter Replacement & Calibration',
    description: 'Routine 6-month air handling unit filter replacement and thermostat recalibration on Level 3.',
    priority: 'medium',
    status: 'open',
    site_name: 'Apex Tower North - Floor 3',
    assigned_technician_id: '11111111-1111-1111-1111-111111111103',
    scheduled_start: new Date('2026-11-10T09:00:00Z'),
    scheduled_end: new Date('2026-11-10T11:00:00Z'),
    created_by: '11111111-1111-1111-1111-111111111102',
    created_at: new Date('2026-11-08T10:00:00Z'),
    updated_at: new Date('2026-11-08T10:00:00Z'),
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    organisation_id: 'org-apex-01',
    reference_number: 'WO-APEX-1002',
    title: 'Emergency Server Room Chiller Leak',
    description: 'Water pooling detected beneath Chiller Unit B in primary server rack room. Urgent repair required.',
    priority: 'urgent',
    status: 'in_progress',
    site_name: 'Apex Data Center B2',
    assigned_technician_id: '11111111-1111-1111-1111-111111111103',
    scheduled_start: new Date('2026-11-10T13:00:00Z'),
    scheduled_end: new Date('2026-11-10T15:00:00Z'),
    created_by: '11111111-1111-1111-1111-111111111102',
    created_at: new Date('2026-11-09T08:00:00Z'),
    updated_at: new Date('2026-11-09T08:00:00Z'),
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    organisation_id: 'org-apex-01',
    reference_number: 'WO-APEX-1003',
    title: 'Fire Alarm Strobe Testing',
    description: 'Quarterly audible and visual alarm compliance test.',
    priority: 'low',
    status: 'completed',
    site_name: 'Apex Headquarters Main Atrium',
    assigned_technician_id: '11111111-1111-1111-1111-111111111104',
    scheduled_start: new Date('2026-11-09T08:00:00Z'),
    scheduled_end: new Date('2026-11-09T10:00:00Z'),
    created_by: '11111111-1111-1111-1111-111111111102',
    created_at: new Date('2026-11-07T08:00:00Z'),
    updated_at: new Date('2026-11-07T08:00:00Z'),
  },
  {
    id: '20000000-0000-0000-0000-000000000001',
    organisation_id: 'org-summit-02',
    reference_number: 'WO-SUMMIT-2001',
    title: 'High Voltage Transformer Inspection',
    description: 'Substation Alpha transformer oil level testing and infrared thermography.',
    priority: 'high',
    status: 'open',
    site_name: 'Summit Power Substation 04',
    assigned_technician_id: '22222222-2222-2222-2222-222222222203',
    scheduled_start: new Date('2026-11-10T10:00:00Z'),
    scheduled_end: new Date('2026-11-10T12:00:00Z'),
    created_by: '22222222-2222-2222-2222-222222222202',
    created_at: new Date('2026-11-08T09:00:00Z'),
    updated_at: new Date('2026-11-08T09:00:00Z'),
  },
];

let mockWorkOrders: MockWorkOrder[] = JSON.parse(JSON.stringify(initialMockWorkOrders));
const mockAuditLogs: MockAuditLog[] = [];

export interface MockProcessedEvent {
  event_id: string;
  organisation_id: string;
  work_order_id: string;
  event_type: string;
  occurred_at: Date;
  payload: any;
  created_at: Date;
}

export interface MockAttachment {
  id: string;
  organisation_id: string;
  work_order_id: string;
  original_filename: string;
  storage_key: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: string;
  created_at: Date;
}

let mockProcessedEvents: MockProcessedEvent[] = [];
let mockAttachments: MockAttachment[] = [];

export function resetMockProcessedEvents() {
  mockProcessedEvents = [];
}

export function getMockProcessedEvents(): MockProcessedEvent[] {
  return mockProcessedEvents;
}

export function resetMockAttachments() {
  mockAttachments = [];
}

export function getMockAttachments(): MockAttachment[] {
  return mockAttachments;
}

export function setMockOrgQuota(orgId: string, bytes: number) {
  const org = mockOrgs.find((o) => o.id === orgId);
  if (org) {
    org.storage_quota_bytes = bytes;
  }
}

export function resetMockWorkOrders() {
  mockWorkOrders = JSON.parse(JSON.stringify(initialMockWorkOrders));
}

export function getMockWorkOrders(): MockWorkOrder[] {
  return mockWorkOrders;
}

export function getMockAuditLogs(): MockAuditLog[] {
  return mockAuditLogs;
}

export function clearMockAuditLogs(): void {
  mockAuditLogs.length = 0;
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function getMockUsers(): MockUser[] {
  return mockUsers;
}

export function setUseMockDb(val: boolean) {
  useMock = val;
}

export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<R>> {
  if (!useMock) {
    try {
      const p = getDbPool();
      return await p.query<R>(text, params);
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED' || config.NODE_ENV === 'test') {
        logger.warn('PostgreSQL unreachable or test mode, using in-memory database mock');
        useMock = true;
      } else {
        throw err;
      }
    }
  }

  // Execute in-memory query handler
  return executeMockQuery<R>(text, params);
}

function executeMockQuery<R extends QueryResultRow = any>(
  text: string,
  params: any[] = []
): QueryResult<R> {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();

  // Find user by email
  if (normalized.includes('from users u') && normalized.includes('where lower(u.email) = lower($1)')) {
    const email = params[0]?.toLowerCase();
    const user = mockUsers.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    const org = mockOrgs.find((o) => o.id === user.organisation_id);
    const row = {
      ...user,
      organisation_name: org?.name ?? '',
    };
    return { rows: [row as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Find user by id and org
  if (normalized.includes('from users u') && normalized.includes('where u.id = $1 and u.organisation_id = $2')) {
    const id = params[0];
    const orgId = params[1];
    const user = mockUsers.find((u) => u.id === id && u.organisation_id === orgId);
    if (!user) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    const org = mockOrgs.find((o) => o.id === user.organisation_id);
    const row = {
      ...user,
      organisation_name: org?.name ?? '',
    };
    return { rows: [row as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // List technicians for an organisation
  if (normalized.includes('from users') && normalized.includes('role = \'technician\'') && normalized.includes('organisation_id = $1')) {
    const orgId = params[0];
    const techs = mockUsers.filter((u) => u.organisation_id === orgId && u.role === 'technician' && u.is_active);
    return { rows: techs as unknown as R[], rowCount: techs.length, command: 'SELECT', oid: 0, fields: [] };
  }

  // Insert refresh token
  if (normalized.includes('insert into refresh_tokens')) {
    const [userId, orgId, tokenHash, expiresAt] = params;
    const token: MockRefreshToken = {
      id: `rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      user_id: userId,
      organisation_id: orgId,
      token_hash: tokenHash,
      expires_at: new Date(expiresAt),
      revoked_at: null,
      created_at: new Date(),
    };
    mockRefreshTokens.push(token);
    return { rows: [token as unknown as R], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
  }

  // Find active refresh token by hash
  if (normalized.includes('from refresh_tokens') && normalized.includes('token_hash = $1')) {
    const tokenHash = params[0];
    const token = mockRefreshTokens.find((t) => t.token_hash === tokenHash && !t.revoked_at && new Date(t.expires_at) > new Date());
    if (!token) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    return { rows: [token as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Revoke refresh token by id
  if (normalized.includes('update refresh_tokens set revoked_at = now() where id = $1')) {
    const id = params[0];
    const token = mockRefreshTokens.find((t) => t.id === id);
    if (token) {
      token.revoked_at = new Date();
      return { rows: [token as unknown as R], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
    }
    return { rows: [] as R[], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] };
  }

  // Revoke all refresh tokens for a user
  if (normalized.includes('update refresh_tokens set revoked_at = now() where user_id = $1')) {
    const userId = params[0];
    let count = 0;
    for (const token of mockRefreshTokens) {
      if (token.user_id === userId && !token.revoked_at) {
        token.revoked_at = new Date();
        count++;
      }
    }
    return { rows: [] as R[], rowCount: count, command: 'UPDATE', oid: 0, fields: [] };
  }

  // Insert audit log
  if (normalized.includes('insert into audit_logs')) {
    const [orgId, actorId, action, targetType, targetId, beforeState, afterState, metadata] = params;
    const log: MockAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      organisation_id: orgId,
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      before_state: beforeState ? JSON.parse(typeof beforeState === 'string' ? beforeState : JSON.stringify(beforeState)) : null,
      after_state: afterState ? JSON.parse(typeof afterState === 'string' ? afterState : JSON.stringify(afterState)) : null,
      metadata: metadata ? JSON.parse(typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : {},
      created_at: new Date(),
    };
    mockAuditLogs.push(log);
    return { rows: [log as unknown as R], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
  }

  // Processed Events (Idempotency insert with ON CONFLICT DO NOTHING)
  if (normalized.includes('insert into processed_events')) {
    const [eventId, orgId, workOrderId, eventType, occurredAt, payload] = params;
    const exists = mockProcessedEvents.some(
      (e) => e.organisation_id === orgId && e.event_id === eventId
    );

    if (exists) {
      return { rows: [] as R[], rowCount: 0, command: 'INSERT', oid: 0, fields: [] };
    }

    const newEvent: MockProcessedEvent = {
      event_id: eventId,
      organisation_id: orgId,
      work_order_id: workOrderId,
      event_type: eventType,
      occurred_at: new Date(occurredAt),
      payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
      created_at: new Date(),
    };
    mockProcessedEvents.push(newEvent);

    return { rows: [{ event_id: eventId } as unknown as R], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
  }

  // Organisation quota & details
  if (normalized.includes('from organisations') && normalized.includes('where id = $1')) {
    const orgId = params[0];
    const org = mockOrgs.find((o) => o.id === orgId);
    if (!org) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    return { rows: [org as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Current storage quota usage query
  if (normalized.includes('from attachments') && normalized.includes('sum(file_size_bytes)')) {
    const orgId = params[0];
    const total = mockAttachments
      .filter((a) => a.organisation_id === orgId)
      .reduce((sum, a) => sum + Number(a.file_size_bytes), 0);
    return {
      rows: [{ current_usage: total, used_bytes: total } as unknown as R],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    };
  }

  // Insert attachment
  if (normalized.includes('insert into attachments')) {
    const [id, orgId, workOrderId, originalFilename, storageKey, mimeType, fileSizeBytes, uploadedBy] = params;
    const att: MockAttachment = {
      id: id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      organisation_id: orgId,
      work_order_id: workOrderId,
      original_filename: originalFilename,
      storage_key: storageKey,
      mime_type: mimeType,
      file_size_bytes: Number(fileSizeBytes),
      uploaded_by: uploadedBy,
      created_at: new Date(),
    };
    mockAttachments.push(att);
    return { rows: [att as unknown as R], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
  }

  // Find attachment by id and organisation
  if (normalized.includes('from attachments') && normalized.includes('where id = $1 and organisation_id = $2')) {
    const [id, orgId] = params;
    const att = mockAttachments.find((a) => a.id === id && a.organisation_id === orgId);
    if (!att) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    return { rows: [att as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // List attachments by work order
  if (normalized.includes('from attachments') && normalized.includes('where work_order_id = $1 and organisation_id = $2')) {
    const [woId, orgId] = params;
    const items = mockAttachments.filter((a) => a.work_order_id === woId && a.organisation_id === orgId);
    return { rows: items as unknown as R[], rowCount: items.length, command: 'SELECT', oid: 0, fields: [] };
  }

  // Delete attachment
  if (normalized.includes('delete from attachments') && normalized.includes('where id = $1 and organisation_id = $2')) {
    const [id, orgId] = params;
    const idx = mockAttachments.findIndex((a) => a.id === id && a.organisation_id === orgId);
    if (idx === -1) {
      return { rows: [] as R[], rowCount: 0, command: 'DELETE', oid: 0, fields: [] };
    }
    const deleted = mockAttachments.splice(idx, 1)[0];
    return { rows: [deleted as unknown as R], rowCount: 1, command: 'DELETE', oid: 0, fields: [] };
  }

  // Work Orders: Update status from event
  if (normalized.includes('update work_orders set status = $1') && normalized.includes('where id = $2')) {
    const [newStatus, id] = params;
    const item = mockWorkOrders.find((w) => w.id === id);
    if (item) {
      item.status = newStatus;
      item.updated_at = new Date();
      return { rows: [item as unknown as R], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
    }
    return { rows: [] as R[], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] };
  }

  // Work Orders: FOR UPDATE select
  if (normalized.includes('from work_orders') && normalized.includes('for update') && normalized.includes('where id = $1 and organisation_id = $2')) {
    const [id, orgId] = params;
    const item = mockWorkOrders.find((w) => w.id === id && w.organisation_id === orgId);
    if (!item) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    return { rows: [item as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Find audit logs by target_id
  if (normalized.includes('from audit_logs') && normalized.includes('target_id = $1')) {
    const targetId = params[0];
    const logs = mockAuditLogs.filter((l) => l.target_id === targetId);
    return { rows: logs as unknown as R[], rowCount: logs.length, command: 'SELECT', oid: 0, fields: [] };
  }

  // Advisory Lock for Scheduling Concurrency
  if (normalized.includes('pg_advisory_xact_lock')) {
    return { rows: [{ pg_advisory_xact_lock: null } as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Work Orders: Check schedule conflict (GiST tstzrange overlap &&)
  if (normalized.includes('tstzrange(scheduled_start, scheduled_end') && normalized.includes('assigned_technician_id = $1')) {
    const techId = params[0];
    const reqStart = new Date(params[1]).getTime();
    const reqEnd = new Date(params[2]).getTime();
    const excludeId = params[3] || null;

    const conflict = mockWorkOrders.find((w) => {
      if (w.assigned_technician_id !== techId) return false;
      if (['cancelled', 'completed'].includes(w.status)) return false;
      if (excludeId && w.id === excludeId) return false;
      if (!w.scheduled_start || !w.scheduled_end) return false;

      const wStart = new Date(w.scheduled_start).getTime();
      const wEnd = new Date(w.scheduled_end).getTime();

      // [wStart, wEnd) overlaps [reqStart, reqEnd) if max(start1, start2) < min(end1, end2)
      return Math.max(reqStart, wStart) < Math.min(reqEnd, wEnd);
    });

    if (conflict) {
      return {
        rows: [
          {
            id: conflict.id,
            reference_number: conflict.reference_number,
            scheduled_start: conflict.scheduled_start,
            scheduled_end: conflict.scheduled_end,
          } as unknown as R,
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }

    return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
  }

  // Work Orders: Assign technician schedule (Specific UPDATE)
  if (normalized.includes('update work_orders') && normalized.includes('assigned_technician_id = $3')) {
    const id = params[0];
    const orgId = params[1];
    const techId = params[2];
    const start = params[3];
    const end = params[4];

    const item = mockWorkOrders.find((w) => w.id === id && w.organisation_id === orgId);
    if (!item) {
      return { rows: [] as R[], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] };
    }

    // In mock mode: enforce GiST exclusion constraint (Postgres 23P01)
    const reqStart = new Date(start).getTime();
    const reqEnd = new Date(end).getTime();

    const hasConflict = mockWorkOrders.some((w) => {
      if (w.id === item.id) return false;
      if (w.assigned_technician_id !== techId) return false;
      if (['cancelled', 'completed'].includes(w.status)) return false;
      if (!w.scheduled_start || !w.scheduled_end) return false;
      const wStart = new Date(w.scheduled_start).getTime();
      const wEnd = new Date(w.scheduled_end).getTime();
      return Math.max(reqStart, wStart) < Math.min(reqEnd, wEnd);
    });

    if (hasConflict) {
      const err: any = new Error('conflicting key value violates exclusion constraint "no_overlapping_technician_schedules"');
      err.code = '23P01';
      throw err;
    }

    item.assigned_technician_id = techId;
    item.scheduled_start = new Date(start);
    item.scheduled_end = new Date(end);
    item.updated_at = new Date();

    const tech = mockUsers.find((u) => u.id === techId);
    const row = {
      ...item,
      technician_name: tech?.name || null,
      technician_email: tech?.email || null,
    };
    return { rows: [row as unknown as R], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
  }

  // Work Orders: Dashboard metrics aggregation
  if (normalized.includes('from work_orders') && (normalized.includes('count(*)') || normalized.includes('filter (where status ='))) {
    const orgId = params[0];
    const techId = params[1] || null;

    let items = mockWorkOrders.filter((w) => w.organisation_id === orgId);
    if (techId) {
      items = items.filter((w) => w.assigned_technician_id === techId);
    }

    const metrics = {
      total: items.length,
      open: items.filter((w) => w.status === 'open').length,
      in_progress: items.filter((w) => w.status === 'in_progress').length,
      blocked: items.filter((w) => w.status === 'blocked').length,
      completed: items.filter((w) => w.status === 'completed').length,
      cancelled: items.filter((w) => w.status === 'cancelled').length,
    };
    return { rows: [metrics as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Work Orders: Single work order by id and organisation_id
  if (normalized.includes('from work_orders wo') && normalized.includes('where wo.id = $1 and wo.organisation_id = $2')) {
    const id = params[0];
    const orgId = params[1];
    const techId = params[2] || null;

    let item = mockWorkOrders.find((w) => w.id === id && w.organisation_id === orgId);
    if (item && techId && item.assigned_technician_id !== techId) {
      item = undefined;
    }

    if (!item) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }

    const tech = mockUsers.find((u) => u.id === item?.assigned_technician_id);
    const creator = mockUsers.find((u) => u.id === item?.created_by);
    const row = {
      ...item,
      technician_name: tech?.name || null,
      technician_email: tech?.email || null,
      creator_name: creator?.name || null,
    };
    return { rows: [row as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Work Orders: Insert new work order
  if (normalized.includes('insert into work_orders')) {
    const [
      id,
      organisationId,
      referenceNumber,
      title,
      description,
      priority,
      status,
      siteName,
      assignedTechnicianId,
      scheduledStart,
      scheduledEnd,
      createdBy,
    ] = params;

    const newWo: MockWorkOrder = {
      id: id || `wo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      organisation_id: organisationId,
      reference_number: referenceNumber,
      title,
      description: description || null,
      priority: priority || 'medium',
      status: status || 'open',
      site_name: siteName,
      assigned_technician_id: assignedTechnicianId || null,
      scheduled_start: scheduledStart ? new Date(scheduledStart) : null,
      scheduled_end: scheduledEnd ? new Date(scheduledEnd) : null,
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockWorkOrders.unshift(newWo);

    const tech = mockUsers.find((u) => u.id === newWo.assigned_technician_id);
    const row = {
      ...newWo,
      technician_name: tech?.name || null,
      technician_email: tech?.email || null,
    };
    return { rows: [row as unknown as R], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
  }

  // Work Orders: Update work order
  if (normalized.includes('update work_orders') && normalized.includes('where id = $') && normalized.includes('organisation_id = $')) {
    // Dynamic params
    const id = params[params.length - 2];
    const orgId = params[params.length - 1];
    const item = mockWorkOrders.find((w) => w.id === id && w.organisation_id === orgId);

    if (!item) {
      return { rows: [] as R[], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] };
    }

    // Inspect fields dynamically by parsing SET assignments e.g. "title = $1"
    const setMatches = normalized.matchAll(/(\w+)\s*=\s*\$(\d+)/g);
    for (const match of setMatches) {
      const field = match[1];
      const paramIdx = parseInt(match[2], 10) - 1;
      const val = params[paramIdx];

      if (field === 'title' && val !== undefined) item.title = val;
      else if (field === 'description') item.description = val;
      else if (field === 'priority' && val !== undefined) item.priority = val;
      else if (field === 'status' && val !== undefined) item.status = val;
      else if (field === 'site_name' && val !== undefined) item.site_name = val;
      else if (field === 'assigned_technician_id') item.assigned_technician_id = val;
      else if (field === 'scheduled_start') item.scheduled_start = val ? new Date(val) : null;
      else if (field === 'scheduled_end') item.scheduled_end = val ? new Date(val) : null;
    }

    item.updated_at = new Date();

    const tech = mockUsers.find((u) => u.id === item.assigned_technician_id);
    const row = {
      ...item,
      technician_name: tech?.name || null,
      technician_email: tech?.email || null,
    };
    return { rows: [row as unknown as R], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
  }

  // Work Orders: List query (count or records)
  if (normalized.includes('from work_orders wo')) {
    const orgId = params[0];
    let items = mockWorkOrders.filter((w) => w.organisation_id === orgId);

    // Filter by tech if technician scope applied
    if (params.includes('11111111-1111-1111-1111-111111111103')) {
      items = items.filter((w) => w.assigned_technician_id === '11111111-1111-1111-1111-111111111103');
    } else if (params.includes('22222222-2222-2222-2222-222222222203')) {
      items = items.filter((w) => w.assigned_technician_id === '22222222-2222-2222-2222-222222222203');
    }

    // Check search param
    for (const p of params) {
      if (typeof p === 'string' && p.startsWith('%') && p.endsWith('%')) {
        const queryTerm = p.replace(/%/g, '').toLowerCase();
        items = items.filter(
          (w) =>
            w.reference_number.toLowerCase().includes(queryTerm) ||
            w.title.toLowerCase().includes(queryTerm) ||
            w.site_name.toLowerCase().includes(queryTerm)
        );
      }
    }

    // Check status filter
    const statusValues = ['open', 'in_progress', 'blocked', 'completed', 'cancelled'];
    for (const p of params) {
      if (statusValues.includes(p)) {
        items = items.filter((w) => w.status === p);
      }
    }

    // Check priority filter
    const priorityValues = ['low', 'medium', 'high', 'urgent'];
    for (const p of params) {
      if (priorityValues.includes(p)) {
        items = items.filter((w) => w.priority === p);
      }
    }

    if (normalized.startsWith('select count(*)')) {
      return { rows: [{ count: String(items.length) } as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
    }

    // Slice for pagination: LIMIT and OFFSET are last two params in dataQuery
    const limit = typeof params[params.length - 2] === 'number' ? params[params.length - 2] : 20;
    const offset = typeof params[params.length - 1] === 'number' ? params[params.length - 1] : 0;
    const paged = items.slice(offset, offset + limit);

    // Format rows with joined technician info
    const formatted = paged.map((w) => {
      const tech = mockUsers.find((u) => u.id === w.assigned_technician_id);
      return {
        ...w,
        technician_name: tech?.name || null,
        technician_email: tech?.email || null,
      };
    });

    return { rows: formatted as unknown as R[], rowCount: formatted.length, command: 'SELECT', oid: 0, fields: [] };
  }

  return { rows: [] as R[], rowCount: 0, command: 'UNKNOWN', oid: 0, fields: [] };
}

export async function withTransaction<T>(fn: (client: PoolClient | null) => Promise<T>): Promise<T> {
  if (useMock) {
    return fn(null);
  }

  const p = getDbPool();
  let client: PoolClient;
  try {
    client = await p.connect();
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || config.NODE_ENV === 'test') {
      useMock = true;
      return fn(null);
    }
    throw err;
  }

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
