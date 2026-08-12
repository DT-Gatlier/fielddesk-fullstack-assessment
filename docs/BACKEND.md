# Backend architecture and API

The backend is Node.js 22, Express 5, and strict TypeScript. It uses PostgreSQL through `pg`, Redis/BullMQ for background work, Zod for request validation, Argon2id for passwords, JWT access tokens with rotating refresh sessions, Pino JSON logs, Helmet, CORS allowlisting, and request rate limits. The complete endpoint contract is in [API.md](API.md).

## Structure

```text
backend/src/
|-- app.ts                    Express composition and routes
|-- server.ts                 HTTP lifecycle and graceful shutdown
|-- worker.ts                 Independent notification worker lifecycle
|-- config.ts                 Validated environment configuration
|-- common/                   Errors, request IDs, async handler
|-- database/                 Pool, transactions, migration and seed runners
|-- infrastructure/           Redis cache, Pub/Sub and SSE fan-out
`-- modules/
    |-- auth/                 Login, logout, JWT and role middleware
    |-- dynamic/              Config-driven CRUD/select routes
    |-- organisation, users/ Administration
    |-- dashboard, audit/     Summary cache and immutable history
    |-- work-orders/          Work-order lifecycle and availability
    |-- progress/             Atomic idempotent progress events
    |-- notifications/        Outbox API, BullMQ worker and mock provider
    |-- reports, realtime/    Streaming CSV and authenticated SSE
    `-- uploads/              Validation, quota and authorised file lifecycle
```

## Authentication and authorisation

Login requires the organisation slug, email, and password. Password hashes use Argon2id. The access token contains user ID, organisation ID, role, and token version and is constrained to HS256, issuer, audience, and expiration. Every authenticated request verifies the signature and checks the user is active with the same token version. A random refresh token is stored only as a SHA-256 hash, rotated on use, and normally transported in an HttpOnly SameSite cookie. Logout increments the token version and revokes refresh sessions.

Role policy:

| Operation | Owner | Dispatcher | Technician |
| --- | :---: | :---: | :---: |
| Read work orders | All in organisation | All in organisation | Assigned only |
| Create/update/assign work orders | Yes | Yes | No |
| Submit progress event | No | No | Assigned only |
| Add attachment | Yes | Yes | Assigned only |
| Download attachment | Organisation | Organisation | Assigned only |
| Manage departments | Yes | Read | Read |
| Manage employees | Yes | Create/update/read | Read |
| Manage users/organisation | Yes | User read only | No |
| Audit/notification diagnostics | Yes | Yes | No |

The API does not trust client-provided role or organisation values. Unknown or out-of-scope records use `404` where revealing existence would leak tenant information.

## Dynamic router

Routes are declared in `backend/src/modules/dynamic/routes.config.ts`. Configuration controls the fixed table, allowed methods, search/sort/result fields, validation schemas, pagination, authentication, and per-method roles.

```ts
{
  name: 'employees',
  table: 'employees',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'SELECT'],
  searchableFields: ['name', 'email'],
  selectableFields: ['id', 'name', 'email', 'department_id', 'created_at', 'updated_at'],
  selectValueField: 'name',
  sortableFields: ['name', 'created_at'],
  pagination: true,
  auth: true,
  roles: { POST: ['owner', 'dispatcher'], PUT: ['owner', 'dispatcher'], DELETE: ['owner'] },
  createSchema: employeeCreateSchema,
  updateSchema: employeeUpdateSchema
}
```

Generated endpoints are:

- `GET /api/v1/:resource` — search, sort, and paginate
- `GET /api/v1/:resource/select/options` — up to 100 `{ id, value }` options
- `GET /api/v1/:resource/:id` — one tenant-scoped record
- `POST /api/v1/:resource` — validated create
- `PUT /api/v1/:resource/:id` — validated partial update
- `DELETE /api/v1/:resource/:id` — tenant-scoped delete

SQL values are parameterised. SQL identifiers cannot be parameterised, so table/field identifiers come exclusively from server configuration and must match a conservative identifier pattern. Response and writable fields are explicit allowlists.

## Asynchronous and real-time architecture

Assignment writes a PostgreSQL outbox record in the work-order transaction and responds without waiting for the provider. The worker dispatches to BullMQ, which uses Redis job leases, delayed retries, and deterministic IDs. Provider attempts and outcomes return to PostgreSQL. Redis also supplies dashboard caching and organisation-isolated Pub/Sub for SSE. See [QUEUE_AND_OPERATIONS.md](QUEUE_AND_OPERATIONS.md).

## Upload security

Uploads use memory buffering with a configurable maximum. The backend permits JPEG, PNG, WebP, and PDF, checks magic bytes as well as the claimed MIME type, creates an unguessable storage key, and keeps local paths out of API responses. The original name is retained only as display/download metadata after basename normalisation.

## API conventions

Success bodies use `data` and list bodies additionally use `meta`. Errors have a stable shape:

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": {} },
  "requestId": "..."
}
```

The API accepts or generates `x-request-id`, returns it in responses, and includes it in structured error logs. `/health` reports process liveness; `/ready` reports PostgreSQL and Redis readiness.
