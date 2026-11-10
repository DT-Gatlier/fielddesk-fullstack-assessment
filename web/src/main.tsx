import React, { type FormEvent, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { OperationsFeed } from './OperationsFeed';

type Role = 'OWNER' | 'DISPATCHER' | 'TECHNICIAN';
type JobStatus = 'UNASSIGNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type JobPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type IconName = 'grid' | 'clipboard' | 'search' | 'bell' | 'download' | 'plus' | 'logout' | 'close' | 'arrow';
type User = { id: string; email: string; name: string; role: Role; organisationName: string };
type Customer = { id: string; name: string; address?: string; phone?: string; email?: string | null };
type Technician = { id: string; name: string; email: string };
type Attachment = {
  id: string; fileName: string; mimeType: string; sizeBytes: number | string; createdAt: string;
  uploadedBy?: { name: string } | null;
};
type Activity = {
  id: string; timestamp?: string; createdAt?: string; action?: string; eventType?: string;
  beforeData?: unknown; afterData?: unknown;
  message?: string | null; changedBy?: { name: string } | null; user?: { name: string } | null;
};
type Job = {
  id: string; referenceNumber: string; title: string; description: string; siteName: string | null;
  status: JobStatus; priority: JobPriority; customerId: string; technicianId: string | null;
  scheduledStart: string | null; scheduledEnd: string | null; customer?: Customer;
  technician?: Technician | null; auditLogs?: Activity[]; progressEvents?: Activity[];
  attachments?: Attachment[]; createdAt?: string; updatedAt?: string; createdBy?: { name: string };
  notifications?: { id: string; status: string; attempts: number; lastError: string | null }[];
};
type Dashboard = {
  counts: { total: number; unassigned: number; inProgress: number; completed: number };
  recentJobs: Job[];
};
type Pagination = { page: number; pages: number; total: number };
type RequestOptions = Omit<RequestInit, 'headers'> & { headers?: HeadersInit };

function errorMessage(issue: unknown): string {
  return issue instanceof Error ? issue.message : 'Something went wrong.';
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null as T;
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('fielddesk:session-ended'));
    if ([502, 503, 504].includes(response.status)) {
      throw new Error('The server is unavailable. Please try again shortly.');
    }
    throw new Error(body?.error?.message || 'Something went wrong.');
  }
  return body;
}

function Icon({ name }: { name: IconName }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    clipboard: <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M8 11h8M8 15h8" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const statusNames = {
  UNASSIGNED: 'Unassigned',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
} as const satisfies Record<JobStatus, string>;

const priorityNames = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
} as const satisfies Record<JobPriority, string>;

function prettyDate(value: string | null | undefined) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function Avatar({ name = 'User', size = 'normal' }: { name?: string; size?: 'normal' | 'small' | 'tiny' }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <span className={`avatar ${size}`}>{initials}</span>;
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('raju@lakshmi.test');
  const [password, setPassword] = useState('FieldDesk123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } = await request<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onLogin(user);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-layout">
      <section className="login-art">
        <div className="brand light"><span className="brand-mark">F</span><span>fielddesk</span></div>
        <div className="login-copy">
          <span className="eyebrow">FIELD SERVICE, IN SYNC</span>
          <h1>Make every<br />service call count.</h1>
          <p>One calm workspace for your team, your customers, and the work that keeps everything moving.</p>
        </div>
        <div className="art-card">
          <span className="art-icon">✓</span>
          <div><strong>Today’s schedule is ready</strong><small>Work orders, people, and progress — together.</small></div>
          <span className="art-pill">LIVE</span>
        </div>
        <span className="login-art-footer">FIELD OPERATIONS, MADE CLEAR.</span>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="brand mobile"><span className="brand-mark">F</span><span>fielddesk</span></div>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to FieldDesk</h2>
          <p className="muted">Use your work account to continue.</p>
          <form onSubmit={submit} className="login-form">
            <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <div className="alert error">{error}</div>}
            <button className="button primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<Icon name="arrow" /></button>
          </form>
          <div className="demo-hint"><strong>Demo account</strong><span>raju@lakshmi.test</span><span>Password: FieldDesk123!</span></div>
          <p className="login-foot">Protected workspace · Your organisation data stays private</p>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<'overview' | 'jobs' | 'schedule' | 'reports' | 'activity' | 'notifications'>('overview');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [scheduleDate, setScheduleDate] = useState(() => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
  const [jobsLoading, setJobsLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const jobRequest = useRef(0);
  const pendingProgress = useRef<{ key: string; body: string } | null>(null);
  const [sort, setSort] = useState('updatedAt');
  const [direction, setDirection] = useState('desc');
  const [settings, setSettings] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

  useEffect(() => {
    request('/auth/me').then(({ user: current }) => setUser(current)).catch(() => setUser(null)).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const endSession = () => { jobRequest.current++; setSelected(null); setModal(false); setSettings(false); setJobs([]); setDashboard(null); setPage('overview'); setUser(null); };
    window.addEventListener('fielddesk:session-ended', endSession);
    return () => window.removeEventListener('fielddesk:session-ended', endSession);
  }, []);

  const loadJobs = async (targetPage = 1) => {
    if (!user) return;
    setError('');
    const requestNumber = ++jobRequest.current;
    setJobsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: '8' });
      params.set('sort', sort);
      params.set('direction', direction);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (technicianFilter) params.set('technicianId', technicianFilter);
      if (page === 'schedule' && scheduleDate) {
        const start = new Date(scheduleDate + 'T00:00:00');
        const end = new Date(start); end.setDate(end.getDate() + 1);
        params.set('from', start.toISOString()); params.set('to', end.toISOString());
        params.set('sort', 'scheduledStart'); params.set('direction', 'asc');
      }
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      const result = await request<{ jobs: Job[]; pagination: Pagination }>(`/jobs?${params}`);
      if (requestNumber !== jobRequest.current) return;
      setJobs(result.jobs);
      setPagination(result.pagination);
    } catch (issue) {
      if (requestNumber === jobRequest.current) setError(errorMessage(issue));
    } finally { if (requestNumber === jobRequest.current) setJobsLoading(false); }
  };

  const loadDashboard = async () => {
    if (!user) return;
    try {
      setDashboard(await request<Dashboard>('/dashboard'));
    } catch (issue) {
      setError(errorMessage(issue));
    }
  };

  const loadOptions = async () => {
    try {
      const [customerResult, techResult] = await Promise.all([
        request<{ customers: Customer[] }>('/customers'),
        request<{ users: Technician[] }>('/users?role=TECHNICIAN'),
      ]);
      setCustomers(customerResult.customers);
      setTechnicians(techResult.users);
    } catch (issue) {
      setError(errorMessage(issue));
    }
  };

  useEffect(() => {
    if (user) {
      loadDashboard();
      loadJobs();
      loadOptions();
    }
  }, [user]);

  useEffect(() => {
    if (user && ['jobs', 'schedule', 'reports'].includes(page)) {
      const timer = setTimeout(() => loadJobs(1), 250);
      return () => clearTimeout(timer);
    }
  }, [search, statusFilter, priorityFilter, technicianFilter, scheduleDate, sort, direction, page, user]);

  useEffect(() => {
    if (!user) return undefined;
    const events = new EventSource('/api/events', { withCredentials: true });
    events.addEventListener('connected', () => { setLive(true); refresh(); });
    const refresh = () => {
      loadDashboard();
      loadJobs(pagination.page);
    };
    events.addEventListener('job.created', refresh);
    events.addEventListener('job.updated', refresh);
    events.addEventListener('job.progress', refresh);
    events.onerror = () => setLive(false);
    const fallback = setInterval(refresh, 30000);
    return () => { events.close(); clearInterval(fallback); };
  }, [user, pagination.page, search, statusFilter, priorityFilter, technicianFilter, scheduleDate, sort, direction, page]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const canEdit = Boolean(user && user.role !== 'TECHNICIAN');

  async function logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
      jobRequest.current++; setJobs([]); setDashboard(null); setSelected(null); setModal(false); setSettings(false); setPage('overview'); pendingProgress.current = null; setUser(null);
    } catch (issue) { setError(errorMessage(issue)); }
  }

  async function openDetails(job: Job) {
    setDetailsLoading(true);
    try {
      const result = await request<{ job: Job }>(`/jobs/${job.id}`);
      setSelected(result.job);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally { setDetailsLoading(false); }
  }

  async function saveJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '');
    const payload = {
      referenceNumber: field('referenceNumber'),
      title: field('title'),
      description: field('description'),
      customerId: field('customerId'),
      technicianId: field('technicianId') || null,
      siteName: field('siteName') || null,
      priority: field('priority'),
      ...(editing ? { status: field('status') } : {}),
      scheduledStart: field('scheduledStart') ? new Date(field('scheduledStart')).toISOString() : null,
      scheduledEnd: field('scheduledEnd') ? new Date(field('scheduledEnd')).toISOString() : null,
    };
    try {
      await request(editing ? `/jobs/${editing.id}` : '/jobs', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setModal(false);
      setEditing(null);
      setToast(editing ? 'Work order updated.' : 'Work order created.');
      loadJobs();
      loadDashboard();
    } catch (issue) {
      throw issue;
    }
  }

  async function submitProgress(event: FormEvent<HTMLFormElement>, type: 'status_changed' | 'note_added') {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      eventId: crypto.randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      payload: type === 'status_changed'
        ? { status: String(form.get('status') ?? '') }
        : { note: String(form.get('note') ?? '') },
    };
    const key = JSON.stringify({ jobId: selected.id, type, payload: payload.payload });
    if (pendingProgress.current?.key !== key) pendingProgress.current = { key, body: JSON.stringify(payload) };
    try {
      await request(`/jobs/${selected.id}/events`, { method: 'POST', body: pendingProgress.current.body });
      pendingProgress.current = null;
      await openDetails(selected);
      loadJobs();
      loadDashboard();
      setToast('Progress updated.');
    } catch (issue) {
      throw issue;
    }
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/jobs/${selected.id}/attachments`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Attachment upload failed.');
      await openDetails(selected);
      setToast('Attachment uploaded.');
    } catch (issue) {
      throw issue;
    }
  }

  async function downloadCsv() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (technicianFilter) params.set('technicianId', technicianFilter);
      if (page === 'schedule' && scheduleDate) {
        const start = new Date(scheduleDate + 'T00:00:00'); const end = new Date(start); end.setDate(end.getDate() + 1);
        params.set('from', start.toISOString()); params.set('to', end.toISOString());
      }
      if (search.trim()) params.set('search', search.trim());
      const query = params.size ? `?${params}` : '';
      const response = await fetch(`/api/jobs.csv${query}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Could not export work orders.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'fielddesk-work-orders.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (issue) {
      setError(errorMessage(issue));
    }
  }

  if (checking) return <div className="boot-screen"><span className="brand-mark">F</span><span>Opening your workspace…</span></div>;
  if (!user) return <Login onLogin={setUser} />;

  const metrics = dashboard?.counts ?? { total: 0, unassigned: 0, inProgress: 0, completed: 0 };
  const pageTitle = { overview: 'Overview', jobs: user.role === 'TECHNICIAN' ? 'My work orders' : 'Work orders', schedule: 'Schedule', reports: 'Reports', activity: 'Activity history', notifications: 'Notifications' }[page];
  const jobRows = page === 'overview' ? dashboard?.recentJobs ?? [] : jobs;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">F</span><span>fielddesk</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switch"><span className="workspace-avatar">{user.organisationName?.[0] ?? 'F'}</span><span><b>{user.organisationName}</b><small>Service operations</small></span><span className="chevron">⌄</span></div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={page === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('overview')}><Icon name="grid" />Overview</button>
          <button className={page === 'jobs' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('jobs')}><Icon name="clipboard" />Work orders<span className="nav-count">{metrics.total}</span></button>
          <button className={page === 'schedule' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('schedule')}><Icon name="clipboard" />Schedule</button>
          <button className={page === 'reports' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('reports')}><Icon name="download" />Reports</button>
          {canEdit && <><button className={page === 'activity' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('activity')}><Icon name="clipboard" />Activity history</button><button className={page === 'notifications' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('notifications')}><Icon name="bell" />Notifications</button></>}
          {user.role === 'OWNER' && <button className="nav-item" onClick={() => setSettings(true)}><Icon name="grid" />Team &amp; settings</button>}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card"><span className="support-icon">?</span><b>Need a hand?</b><p>Your team’s workflow, all in one place.</p><button onClick={() => setToast('Ask your workspace owner for help.')}>View quick guide <Icon name="arrow" /></button></div>
          <button className="profile" onClick={logout}><Avatar name={user.name} /><span><b>{user.name}</b><small>{user.role.toLowerCase()}</small></span><Icon name="logout" /></button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="crumb"><span>Workspace</span><b>/</b><strong>{pageTitle}</strong></div>
          <div className="top-actions"><span className={`live-indicator ${live ? 'online' : ''}`}><i />{live ? 'Live updates on' : 'Reconnecting'}</span><button className="icon-button" aria-label="Notifications" onClick={() => canEdit ? setPage('notifications') : setPage('jobs')}><Icon name="bell" /></button><Avatar name={user.name} size="small" /></div>
        </header>
        <div className="page-content">
          {error && <div className="alert error global-alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" /></button></div>}
          {detailsLoading && <p className="loading-state" role="status">Opening work order…</p>}
          {(page === 'activity' || page === 'notifications') ? <><div className="welcome-row"><div><h1>{pageTitle}</h1><p>Recorded activity for {user.organisationName}.</p></div></div><OperationsFeed key={page} kind={page} /></> : page === 'overview' ? (
            <>
              <div className="welcome-row">
                <div><div className="eyebrow">YOUR OPERATIONS AT A GLANCE</div><h1>Good day, {user.name.split(' ')[0]} <span className="wave">✳</span></h1><p>Here’s what’s happening across your service team.</p></div>
                <div className="welcome-actions"><button className="button secondary" onClick={downloadCsv}><Icon name="download" />Export</button>{canEdit && <button className="button primary" onClick={() => { setEditing(null); setModal(true); }}><Icon name="plus" />New work order</button>}</div>
              </div>
              <section className="metric-grid" aria-label="Work order summary">
                <Metric label="Total work orders" value={metrics.total} caption="Across your workspace" icon="clipboard" tone="blue" />
                <Metric label="Needs assignment" value={metrics.unassigned} caption="Ready for a technician" icon="⌖" tone="amber" />
                <Metric label="In progress" value={metrics.inProgress} caption="Currently being worked" icon="↗" tone="violet" />
                <Metric label="Completed" value={metrics.completed} caption="Successfully wrapped up" icon="✓" tone="green" />
              </section>
              <section className="panel recent-panel">
                <div className="panel-heading"><div><h2>Recent work orders</h2><p>Your team’s latest activity</p></div><button className="text-button" onClick={() => setPage('jobs')}>View all <Icon name="arrow" /></button></div>
                <JobTable loading={jobsLoading} jobs={jobRows} onSelect={openDetails} onEdit={(job) => { setEditing(job); setModal(true); }} canEdit={canEdit} />
              </section>
              <div className="bottom-note"><span className="note-icon">✦</span><span><b>Stay in the know</b><small>Work order changes show up here as they happen.</small></span><span className="note-live"><i /> Live</span></div>
            </>
          ) : (
            <>
              <div className="welcome-row list-title">
                <div><div className="eyebrow">PLAN, TRACK, AND DELIVER</div><h1>{pageTitle}</h1><p>{page === 'schedule' ? 'Review appointments by day, then open a work order to assign or reschedule.' : page === 'reports' ? 'Filter your organisation’s work and export the matching records.' : 'Keep every customer request moving forward.'}</p></div>
                <div className="welcome-actions"><button className="button secondary" onClick={downloadCsv}><Icon name="download" />Export CSV</button>{canEdit && <button className="button primary" onClick={() => { setEditing(null); setModal(true); }}><Icon name="plus" />New work order</button>}</div>
              </div>
              <section className="panel list-panel">
                {page === 'schedule' && <div className="schedule-toolbar"><label>Schedule date<input aria-label="Schedule date" type="date" required value={scheduleDate} onChange={event => setScheduleDate(event.target.value)} /></label><span>Times are shown in your local timezone.</span></div>}
                <div className="list-toolbar">
                  <div className="searchbox"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, title, customer…" aria-label="Search work orders" /></div>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{Object.entries(statusNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
                  <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} aria-label="Filter by priority"><option value="">All priorities</option>{Object.entries(priorityNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
                  {canEdit && <select value={technicianFilter} onChange={event => setTechnicianFilter(event.target.value)} aria-label="Filter by technician"><option value="">All technicians</option>{technicians.map(technician => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select>}
                  <select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort work orders"><option value="updatedAt">Last updated</option><option value="scheduledStart">Scheduled start</option></select>
                  <select value={direction} onChange={event => setDirection(event.target.value)} aria-label="Sort direction"><option value="desc">Descending</option><option value="asc">Ascending</option></select>
                </div>
                <JobTable loading={jobsLoading} jobs={jobRows} onSelect={openDetails} onEdit={(job) => { setEditing(job); setModal(true); }} canEdit={canEdit} />
                <div className="pagination"><span>Showing {jobs.length ? (pagination.page - 1) * 8 + 1 : 0}–{Math.min(pagination.page * 8, pagination.total)} of {pagination.total}</span><div><button disabled={pagination.page <= 1} onClick={() => loadJobs(pagination.page - 1)}>Previous</button><span>Page {pagination.page} of {pagination.pages || 1}</span><button disabled={pagination.page >= pagination.pages} onClick={() => loadJobs(pagination.page + 1)}>Next</button></div></div>
              </section>
            </>
          )}
        </div>
      </main>
      {modal && <JobModal job={editing} customers={customers} technicians={technicians} onCustomerCreated={customer => setCustomers(current => [...current, customer])} onClose={() => { setModal(false); setEditing(null); }} onSubmit={saveJob} />}
      {settings && <OwnerSettings onClose={() => { setSettings(false); loadOptions(); request('/auth/me').then(({ user }) => setUser(user)).catch(issue => setError(errorMessage(issue))); }} />}
      {selected && <JobDetails onEdit={() => { setEditing(selected); setSelected(null); setModal(true); }} job={selected} user={user} onClose={() => setSelected(null)} onProgress={submitProgress} onUpload={uploadAttachment} />}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

function OwnerSettings({ onClose }: { onClose: () => void }) {
  const [members, setMembers] = useState<(User & { isActive: boolean })[]>([]);
  const [organisation, setOrganisation] = useState<{ name: string; storageUsedBytes: string; storageLimitBytes: number } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const [team, settings] = await Promise.all([request('/users'), request('/organisation')]);
    setMembers(team.users); setOrganisation(settings.organisation);
  }
  useEffect(() => { load().catch(issue => setMessage(errorMessage(issue))); }, []);
  async function mutate(path: string, method: string, body: unknown) {
    setBusy(true); setMessage('');
    try { await request(path, { method, body: JSON.stringify(body) }); await load(); setMessage('Saved.'); }
    catch (issue) { setMessage(errorMessage(issue)); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-label="Team and settings">
    <button className="button secondary" onClick={onClose}>Close</button><h2>Team and settings</h2>
    {message && <p role="status">{message}</p>}
    {!organisation ? <p>Loading settings…</p> : <form className="login-form" onSubmit={event => { event.preventDefault(); void mutate('/organisation', 'PATCH', { name: organisation.name }); }}>
      <label>Organisation name<input required maxLength={120} value={organisation.name} onChange={event => setOrganisation({ ...organisation, name: event.target.value })} /></label>
      <p>Storage: {Number(organisation.storageUsedBytes).toLocaleString()} / {organisation.storageLimitBytes.toLocaleString()} bytes</p>
      <button className="button primary" disabled={busy}>Save organisation</button>
    </form>}
    <h3>Team members</h3>
    {members.map(member => <div key={member.id} className="settings-member"><strong>{member.name}</strong><small>{member.email}</small>
      {member.role === 'OWNER' ? <span>Owner</span> : <>
        <select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={event => void mutate(`/users/${member.id}`, 'PATCH', { role: event.target.value })}><option value="DISPATCHER">Dispatcher</option><option value="TECHNICIAN">Technician</option></select>
        <button className="button secondary" disabled={busy} onClick={() => void mutate(`/users/${member.id}`, 'PATCH', { isActive: !member.isActive })}>{member.isActive ? 'Deactivate' : 'Activate'}</button>
      </>}
    </div>)}
    <h3>Add team member</h3><form className="login-form" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      void mutate('/users', 'POST', Object.fromEntries(form));
    }}>
      <label>Name<input name="name" required maxLength={120} /></label><label>Email<input name="email" type="email" required /></label>
      <label>Temporary password<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
      <label>Role<select name="role"><option value="DISPATCHER">Dispatcher</option><option value="TECHNICIAN">Technician</option></select></label>
      <button className="button primary" disabled={busy}>Create user</button>
    </form>
  </section></div>;
}

function Metric({ label, value, caption, icon, tone }: {
  label: string; value: number; caption: string; icon: IconName | '⌖' | '↗' | '✓';
  tone: 'blue' | 'amber' | 'violet' | 'green';
}) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}>{icon === 'clipboard' ? <Icon name="clipboard" /> : icon}</div><div className="metric-number">{value}</div><div className="metric-label">{label}</div><div className="metric-caption">{caption}</div></article>;
}

function JobTable({ jobs, onSelect, onEdit, canEdit, loading }: {
  jobs: Job[]; onSelect: (job: Job) => void; onEdit: (job: Job) => void; canEdit: boolean; loading: boolean;
}) {
  if (loading) return <div className="loading-state" role="status">Loading work orders…</div>;
  if (!jobs.length) return <div className="empty-state"><span className="empty-icon"><Icon name="clipboard" /></span><b>No work orders here yet</b><p>Try changing your filters, or create a work order to get started.</p></div>;
  return (
    <div className="table-scroll">
      <table className="jobs-table">
        <thead><tr><th>WORK ORDER</th><th>CUSTOMER</th><th>ASSIGNEE</th><th>SCHEDULE</th><th>STATUS</th><th>PRIORITY</th><th /></tr></thead>
        <tbody>{jobs.map((job) => (
          <tr key={job.id} onClick={() => onSelect(job)}>
            <td><div className="job-ref"><span className="job-dot">{job.referenceNumber?.slice(-2)}</span><span><b>{job.title}</b><small>{job.referenceNumber}</small></span></div></td>
            <td>{job.customer?.name ?? '—'}</td>
            <td>{job.technician ? <span className="assignee"><Avatar name={job.technician.name} size="tiny" />{job.technician.name.split(' ')[0]}</span> : <span className="muted">Unassigned</span>}</td>
            <td>{prettyDate(job.scheduledStart)}</td>
            <td><span className={`status-badge ${job.status.toLowerCase()}`}><i />{statusNames[job.status] || job.status}</span></td>
            <td><span className={`priority ${job.priority.toLowerCase()}`}><i />{priorityNames[job.priority] || job.priority}</span></td>
            <td className="row-actions">{canEdit && <button className="row-action edit-action" aria-label={`Edit ${job.referenceNumber}`} onClick={(event) => { event.stopPropagation(); onEdit(job); }}>Edit</button>}<button className="row-action" aria-label={`View ${job.referenceNumber}`} onClick={(event) => { event.stopPropagation(); onSelect(job); }}>View</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function JobModal({ job, customers, technicians, onClose, onSubmit, onCustomerCreated }: {
  job: Job | null; customers: Customer[]; technicians: Technician[]; onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCustomerCreated: (customer: Customer) => void;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [customerId, setCustomerId] = useState(job?.customerId || '');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    setError('');
    setSavingCustomer(true);
    try {
      const result = await request<{ customer: Customer }>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          address: form.get('address'),
          phone: form.get('phone'),
          ...(email ? { email } : {}),
        }),
      });
      setCustomerOptions(current => [...current, result.customer]);
      onCustomerCreated(result.customer);
      setCustomerId(result.customer.id);
      setAddingCustomer(false);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setSavingCustomer(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="job-form-title">
        <div className="modal-heading"><div><span className="eyebrow">{job ? 'UPDATE SERVICE DETAILS' : 'ADD TO YOUR SCHEDULE'}</span><h2 id="job-form-title">{job ? 'Edit work order' : 'New work order'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <button className="button secondary" type="button" onClick={() => setAddingCustomer(value => !value)}>
          {addingCustomer ? 'Close customer form' : 'Add customer'}
        </button>
        {addingCustomer && (
          <form className="job-form" aria-label="New customer" onSubmit={saveCustomer}>
            <h3>New customer</h3>
            <label>Customer name<input name="name" required maxLength={160} /></label>
            <label>Customer address<input name="address" required maxLength={500} /></label>
            <label>Customer phone<input name="phone" required maxLength={40} /></label>
            <label>Customer email<input name="email" type="email" maxLength={254} /></label>
            <button className="button primary" disabled={savingCustomer}>
              {savingCustomer ? 'Saving customer…' : 'Save customer'}
            </button>
          </form>
        )}
        <form className="job-form" onSubmit={(event) => { setError(''); setSaving(true); onSubmit(event).catch((issue: unknown) => setError(errorMessage(issue))).finally(() => setSaving(false)); }}>
          <div className="form-grid">
            <label>Reference number<input name="referenceNumber" required defaultValue={job?.referenceNumber} placeholder="FD-1004" /></label>
            <label>Customer<select aria-label="Customer" name="customerId" required value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="" disabled>Select customer</option>{customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
          </div>
          <label>Work order title<input name="title" required defaultValue={job?.title} placeholder="e.g. Inspect rooftop HVAC unit" /></label>
          <label>Description<textarea name="description" rows={3} required defaultValue={job?.description} placeholder="Add the details the technician needs…" /></label>
          <div className="form-grid">
            <label>Technician<select aria-label="Technician" name="technicianId" defaultValue={job?.technicianId || ''}><option value="">Unassigned</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>
            <label>Priority<select aria-label="Priority" name="priority" defaultValue={job?.priority || 'NORMAL'}>{Object.entries(priorityNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          </div>
          <label>Site name<input name="siteName" defaultValue={job?.siteName || ''} placeholder="Building or site" /></label>
          {job && <label>Status<select name="status" defaultValue={job.status}>{Object.entries(statusNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>}
          <div className="form-grid">
            <label>Scheduled start<input name="scheduledStart" type="datetime-local" defaultValue={job?.scheduledStart ? new Date(new Date(job.scheduledStart).getTime() - new Date(job.scheduledStart).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} /></label>
            <label>Scheduled end<input name="scheduledEnd" type="datetime-local" defaultValue={job?.scheduledEnd ? new Date(new Date(job.scheduledEnd).getTime() - new Date(job.scheduledEnd).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} /></label>
          </div>
          {error && <div className="alert error">{error}</div>}
          <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : job ? 'Save changes' : 'Create work order'}<Icon name="arrow" /></button></div>
        </form>
      </section>
    </div>
  );
}

function JobDetails({ job, user, onClose, onProgress, onUpload, onEdit }: {
  job: Job; user: User; onClose: () => void; onEdit: () => void;
  onProgress: (event: FormEvent<HTMLFormElement>, type: 'status_changed' | 'note_added') => Promise<void>;
  onUpload: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [tab, setTab] = useState<'activity' | 'update'>('activity');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const canProgress = user.role === 'TECHNICIAN' && job.technicianId === user.id;
  const canAttach = canProgress || user.role === 'OWNER' || user.role === 'DISPATCHER';
  async function handleProgress(event: FormEvent<HTMLFormElement>, type: 'status_changed' | 'note_added') {
    setFormError(''); setBusy(true);
    try {
      await onProgress(event, type);
    } catch (issue) {
      setFormError(errorMessage(issue));
    } finally { setBusy(false); }
  }
  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    setFormError(''); setBusy(true);
    try {
      await onUpload(event);
    } catch (issue) {
      setFormError(errorMessage(issue));
    } finally { setBusy(false); }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="details-card" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="details-top"><span className="eyebrow">{job.referenceNumber} · WORK ORDER</span><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <h2 id="detail-title">{job.title}</h2><p className="detail-description">{job.description}</p>
        {formError && <div className="alert error" role="alert">{formError}</div>}
        <div className="detail-badges"><span className={`status-badge ${job.status.toLowerCase()}`}><i />{statusNames[job.status]}</span><span className={`priority ${job.priority.toLowerCase()}`}><i />{priorityNames[job.priority]} priority</span></div>
        <div className="detail-facts"><div><small>CUSTOMER</small><b>{job.customer?.name}</b></div><div><small>TECHNICIAN</small><b>{job.technician?.name || 'Not assigned'}</b></div><div><small>SCHEDULE</small><b>{prettyDate(job.scheduledStart)} – {prettyDate(job.scheduledEnd)}</b></div><div><small>SITE</small><b>{job.siteName || '—'}</b></div></div>
        <div className="detail-facts"><div><small>CREATED BY</small><b>{job.createdBy?.name || '—'}</b></div><div><small>CREATED</small><b>{prettyDate(job.createdAt)}</b></div><div><small>LAST UPDATED</small><b>{prettyDate(job.updatedAt)}</b></div></div>
        {user.role !== 'TECHNICIAN' && <button className="button primary" onClick={onEdit}>Edit / assign / reschedule</button>}
        {job.notifications?.length ? <section className="delivery-summary"><h3>Assignment delivery</h3>{job.notifications.map(item => <p key={item.id}><span className={`delivery-status ${item.status.toLowerCase()}`}>{item.status}</span> · {item.attempts} attempts {item.lastError && <span>· {item.lastError}</span>}</p>)}</section> : null}
        <section className="attachments-section"><div className="attachments-heading"><b>Attachments</b><span>{job.attachments?.length || 0}</span></div>{job.attachments?.length ? <div className="attachment-list">{job.attachments.map((file) => <a key={file.id} href={`/api/attachments/${file.id}`} target="_blank" rel="noreferrer"><span className="file-mark">{file.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}</span><span><b>{file.fileName}</b><small>{(Number(file.sizeBytes) / 1024).toFixed(0)} KB · {file.uploadedBy?.name}</small></span><Icon name="download" /></a>)}</div> : <p className="no-attachments">No files attached.</p>}{canAttach && <form className="upload-row" onSubmit={handleUpload}><input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/gif,image/webp" required /><button className="button secondary" disabled={busy}>{busy ? 'Uploading…' : 'Upload file'}</button></form>}</section>
        <div className="detail-tabs"><button className={tab === 'activity' ? 'selected' : ''} onClick={() => setTab('activity')}>Activity history</button>{canProgress && <button className={tab === 'update' ? 'selected' : ''} onClick={() => setTab('update')}>Add progress</button>}</div>
        {tab === 'activity' ? <OperationsFeed key={job.updatedAt} kind="activity" jobId={job.id} /> : <div className="progress-forms"><form onSubmit={(event) => handleProgress(event, 'status_changed')}><label>Update status<select name="status" defaultValue={job.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS'}><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></select></label><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save status'}</button></form><form onSubmit={(event) => handleProgress(event, 'note_added')}><label>Add a work note<textarea name="note" rows={3} maxLength={2000} required placeholder="What happened on site?" /></label><button className="button secondary" disabled={busy}>{busy ? 'Saving…' : 'Post note'}</button></form></div>}
        <div className="modal-footer"><button className="button secondary" onClick={onClose}>Close</button></div>
      </section>
    </div>
  );
}

function Root() {
  return <App />;
}

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('The application root element is missing.');
createRoot(rootElement).render(<Root />);
