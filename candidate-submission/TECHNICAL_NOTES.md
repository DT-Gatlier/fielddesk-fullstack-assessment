# Technical Notes

## Candidate Details
- **Name:** Sanooj Sahadevan
- **GitHub:** Sanooj-Sahadevan
- **Final Commit SHA:** [Add your latest commit SHA]
- **Screen Recording:** [Google Drive Recording](https://drive.google.com/drive/folders/1ziRLAslCsrtqDsNjc4VXerWX6yzoQ9-G?usp=drive_link)

## 1. Local Setup

Run the complete application using Docker Compose:

```bash
docker compose up --build
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- PostgreSQL
- Redis
- Background Worker

Stop services:

```bash
docker compose down
```

## 2. Architecture

The application uses:

- **Frontend:** Next.js, React, TypeScript
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL with Prisma
- **Queue:** Redis and BullMQ
- **Worker:** TypeScript
- **Deployment:** Docker Compose

The frontend communicates with the backend through API routes.

## 3. Authentication and Authorization

- Passwords are hashed using bcrypt.
- JWT authentication uses HTTP-only cookies.
- Role-based access control supports Owner, Dispatcher, and Technician.
- Organisation-level data isolation is enforced by the backend.
- Technicians can access their assigned work orders.

## 4. Database Design

Main database models:

- Organisation
- User
- WorkOrder
- ProgressEvent
- Attachment
- AuditLog
- NotificationDelivery

Prisma handles database operations, migrations, relationships, and constraints.

## 5. Background Jobs and Real-Time Updates

- BullMQ manages notification jobs through Redis.
- A separate worker processes notification tasks.
- Retry attempts use exponential backoff.
- Server-Sent Events (SSE) deliver real-time dashboard updates.

## 6. Security

The application implements:

- bcrypt password hashing
- JWT authentication
- HTTP-only cookies
- Role-based authorization
- Organisation-level access control
- Request rate limiting
- File type and size validation
- Secure file identifiers
- Helmet security headers

## 7. File Storage

Attachments are limited to 5 MB and support PDF, JPEG, PNG, and WebP.

Files are stored locally using Docker volumes. Production deployment should use private object storage.

## 8. Testing and Verification

Run the following commands:

```bash
npm --prefix backend test
npm --prefix frontend test
npm --prefix worker test

npm --prefix frontend run lint

npm --prefix backend run build
npm --prefix frontend run build
npm --prefix worker run build
```

Record the actual results before submission.

## 9. Known Limitations

- Inactive user accounts are not currently rejected during authentication.
- Technician organisation validation needs improvement during assignment.
- Schedule validation should require both start and end times.
- SSE currently uses in-memory connections.
- Notification processing needs a transactional outbox for better reliability.
- Additional automated tests are required for concurrency, access control, and worker retries.

## 10. Final Submission

Before submission:
- Add the latest Git commit SHA.
- Complete the testing results.
- Verify the screen-recording link.
- Confirm that the application runs successfully.
