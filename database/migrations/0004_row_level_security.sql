-- Tenant isolation as defence in depth.
--
-- The application already scopes every query by the organisation taken from the session. These
-- policies make Postgres enforce the same rule: the runtime role only sees rows whose org_id matches
-- the transaction-local setting app.org_id, which the API sets from the authenticated session
-- (SELECT set_config('app.org_id', $1, true)). With no setting, the runtime role sees nothing.
--
-- Policies do not apply to the table owner, which is used only for migrations and seeding.

CREATE FUNCTION current_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;

-- Runtime privileges. Append-only tables get SELECT and INSERT only.
GRANT SELECT, UPDATE ON organisations TO fielddesk_runtime;
GRANT SELECT, INSERT, UPDATE ON users, sessions, work_orders, notifications TO fielddesk_runtime;
GRANT SELECT, INSERT ON progress_events, attachments, audit_log, notification_attempts TO fielddesk_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO fielddesk_runtime;

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organisations
  USING (id = current_org_id()) WITH CHECK (id = current_org_id());

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'sessions', 'work_orders', 'progress_events', 'attachments',
    'audit_log', 'notifications', 'notification_attempts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id())',
      t
    );
  END LOOP;
END
$$;
