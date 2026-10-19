-- The worker's recovery sweep must find pending notifications in every organisation, which the
-- tenant RLS policy deliberately prevents. This function exposes only the ids needed to re-enqueue
-- them; the worker then processes each one inside a transaction scoped to its organisation.
CREATE FUNCTION notifications_due_for_dispatch(p_stale_after interval, p_limit integer)
RETURNS TABLE (id uuid, org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT n.id, n.org_id
  FROM notifications n
  WHERE n.status = 'pending' AND n.updated_at < now() - p_stale_after
  ORDER BY n.created_at
  LIMIT least(p_limit, 1000)
$$;

REVOKE ALL ON FUNCTION notifications_due_for_dispatch(interval, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notifications_due_for_dispatch(interval, integer) TO fielddesk_runtime;
