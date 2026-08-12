# Frontend architecture

The frontend is a Vite, React, and TypeScript single-page application in `frontend/`. It uses React Router for URL-backed navigation and route-level lazy loading, TanStack Query for server state, and the backend contract documented in [API.md](API.md).

## Run locally

After starting PostgreSQL, Redis, the API, and the worker as described in the root README:

```bash
npm run frontend:dev
```

The app runs at `http://localhost:5173`. This must match the backend `CORS_ORIGIN`. `VITE_API_URL` defaults to `http://localhost:8000/api/v1`; copy `frontend/.env.example` to `frontend/.env` only when a different URL is required.

## Structure

```text
frontend/src/
|-- api/          Authenticated fetch, refresh replay, errors, downloads
|-- components/   Reusable form fields, API select, table, pagination, feedback
|-- context/      In-memory authentication state
|-- hooks/        Authenticated fetch-based SSE connection
|-- layouts/      Responsive role-aware application navigation
|-- pages/        Lazy-loaded route screens and work-order workflows
|-- utils/        Display formatting
`-- types.ts      Shared frontend domain types
```

## Behaviour and security

- The access token is held only in memory. Startup attempts refresh through the HttpOnly cookie, and a failed refresh returns the user to login without a loop.
- A `401` triggers one shared refresh operation and one request replay. `403`, `404`, validation errors, conflicts, and request IDs are presented through reusable states.
- Navigation is adapted to the user's role, and privileged routes are guarded for usability. The backend remains the security boundary.
- Search, filters, sorting, and pagination live in the URL. This makes work-order list views linkable and keeps CSV export aligned with visible filters.
- Work-order routes are lazy-loaded. Live events invalidate relevant cached data; edits remain available while SSE reconnects.
- Technician availability is a preview. A `409` from create/update is still displayed beside schedule fields because the database constraint is authoritative.
- Attachments are uploaded as `FormData` and downloaded through authenticated API requests; no storage path is expected in metadata.

## Reusable components

- `TextInput`, `TextArea`, `SelectInput`, and `Field` provide consistent labels, hints, accessible error descriptions, and validation styling.
- `AsyncSelect` loads either a dynamic resource's `/select/options` endpoint or a custom API list path and supports a configurable label field.
- `DataTable<T>` accepts render columns, server-driven sorting, stable row keys, and contextual empty states.
- `Pagination`, `LoadingState`, `ErrorState`, `EmptyState`, `Badge`, `Button`, `Toast` and the layout primitives provide consistent interaction states.

## Verification

```bash
npm run build -w frontend
npm run lint -w frontend
npm run test -w frontend
```

The frontend test exercises the important create-work-order workflow, including loading technician options, submitting the API payload, and navigating after persistence.

## Delivery plan

The implemented core covers the reviewer path: authentication, dashboard, URL-driven work-order discovery, create/edit/detail, scheduling conflicts, attachments, technician progress, real-time invalidation, CSV export, and role-appropriate administration menus.

Recommended follow-on increments are:

1. Add browser-level tests for refresh rotation, schedule conflict presentation, upload limits, and role-specific navigation against a real local stack.
2. Add editable user details and richer notification-attempt drill-down while retaining the existing backend permissions.
3. Add an offline progress-event queue for technician devices if offline field operation becomes a product requirement.
4. Add performance telemetry and route-error reporting once the deployment target and monitoring provider are selected.
