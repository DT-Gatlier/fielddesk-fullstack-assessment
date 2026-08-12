# Frontend integration guide

## Application startup

Start the API and worker in separate processes:

```bash
npm run dev
npm run worker:dev -w backend
```

The frontend origin must match `CORS_ORIGIN`. Browser fetch calls should use `credentials: 'include'` so refresh-token cookies are sent.

## Authentication state

Keep the short-lived access token in application memory. Do not place it in local storage. On startup, call `POST /auth/refresh` with credentials included. On a `401`, attempt one refresh and replay the original request once; if refresh fails, clear state and show login. Call `/auth/me` after authentication to initialise the role and organisation display.

```ts
type Role = 'owner' | 'dispatcher' | 'technician';
type Priority = 'low' | 'medium' | 'high' | 'urgent';
type WorkOrderStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}
```

Role-based UI hiding improves usability but is not security; the API remains authoritative. Render `403` as insufficient permission, `404` as unavailable, and scheduling `409` beside the technician/date controls.

## Recommended data flows

Dashboard loads `/dashboard`; work-order list loads `/work-orders` with URL-backed filters and pagination. Details load `/work-orders/:id`, which already embeds history, attachments, and progress events. Owner/dispatcher assignment controls use `/users?role=technician&active=true`. Lookup controls use `/departments/select/options` or `/employees/select/options`.

On create/update success, navigate or update optimistic state using the returned work order. A successful assignment means notification intent is durable, not necessarily delivered. Notification status is visible through `/notifications`.

For upload, submit `FormData` without manually setting `Content-Type`. Use the metadata ID to construct the authorised download endpoint; never expect a local storage URL in metadata.

For real-time updates, use a fetch-based SSE library capable of setting `Authorization`. On any event relevant to the current screen, invalidate/refetch the corresponding query. On disconnect, continue normal polling or manual refresh and refetch once connected.

## Empty and error states

- Empty work-order lists should distinguish no records from no filter matches.
- `409` schedule conflicts include conflicting work orders from the preview endpoint, while the write endpoint remains final authority.
- `413` should name the configured file-size limit shown by the UI configuration.
- A refresh failure returns the user to login without retry loops.
- SSE loss must not block edits; show a subtle reconnecting state and refetch afterward.
- `202` notification retry means queued for background processing, not delivered.
