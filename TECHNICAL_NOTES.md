# FieldDesk Technical Notes

## 1. Architecture Overview
FieldDesk is designed as a robust, concurrency-safe, multi-tenant Field Service Management system. The architecture separates concerns across three main domains:
- **Backend API**: A Node.js/Express server providing RESTful endpoints, SSE real-time streaming, JWT-based authentication, and structured validation.
- **Background Worker**: A dedicated BullMQ processor responsible for executing reliable third-party API calls (e.g., notifications) independent of the API server's request cycle.
- **Frontend SPA**: A React application utilizing Context for Auth and Zustand for managing real-time state via SSE, ensuring UI components react instantly to backend events.

## 2. Key Design Decisions

### Tenant Isolation
Multi-tenancy is enforced securely at the middleware layer. The `orgScope` middleware extracts the \`orgId\` from the validated JWT and injects it into every incoming request. All subsequent database operations strictly filter by this \`orgId\`, making cross-tenant data leakage virtually impossible.

### Concurrency and Scheduling Safety
To satisfy the strict requirement of preventing overlapping work-order assignments for technicians, a PostgreSQL Exclusion Constraint was implemented. Using \`btree_gist\` and the \`tstzrange\` type, the database natively rejects any concurrent transaction attempting to book a technician into conflicting time slots. This avoids race conditions entirely at the lowest layer, while the application layer translates the resulting constraint violation into a clean 409 Conflict response.

### Idempotency in Progress Events
Idempotency for progress event submissions is handled using a client-provided UUID (\`eventId\`) combined with a UNIQUE constraint in the database. When the backend detects a \`P2002\` unique constraint violation during event insertion, it safely ignores the error and returns a 200 OK to the client. This allows for safe, concurrent retries without side effects.

### Background Job Processing
BullMQ and Redis were selected for background processing. The separation allows the API to respond immediately upon work order assignment while the worker handles the unstable mocked notification provider. The worker implements an exponential backoff strategy for temporary failures, ensuring eventual consistency.

### Real-time Architecture
Server-Sent Events (SSE) were chosen over WebSockets due to their simplicity, native browser support for reconnection, and unidirectional data flow (server to client) which perfectly fits the requirement of broadcasting updates (like status changes). SSE connections are managed in-memory and mapped by \`orgId\` to guarantee isolated broadcasts.

## 3. Storage Quotas
Storage quotas are enforced atomically during the file upload process using a raw SQL transaction to check and increment \`usedBytes\`. This guarantees that even highly concurrent uploads cannot breach an organization's allocated limit.

## 4. Known Limitations
- In-memory SSE connections mean that if the backend were scaled horizontally to multiple instances, a Redis Pub/Sub backplane would be required to distribute events across instances.
- The attachment storage currently utilizes the local filesystem (\`/app/uploads\`). For production, this should be abstracted behind an interface (like AWS S3) for durability and scalability.

## 5. AI Usage Disclosure
I utilized the **Antigravity AI Assistant (Google Deepmind)** throughout this assessment to accelerate the setup of boilerplate code, implement robust database constraints, and structure the test suites. AI was heavily leveraged for configuring the PostgreSQL exclusion constraints and developing the concurrency-safe logic. All code was carefully reviewed to ensure it met the strict security and idempotency requirements outlined in the specifications.
