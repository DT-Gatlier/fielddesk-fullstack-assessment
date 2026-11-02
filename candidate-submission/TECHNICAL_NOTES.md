# FieldDesk – Technical Notes

## 1. Project Overview

FieldDesk is a full-stack work order management application built using Django REST Framework and React.

The application supports organization-based workflows, role-based access control, work order management, scheduling, attachments, background processing and activity tracking.

The implementation focuses on data integrity, authorization, security, reliability and maintainability.

## 2. Technology Stack

### Backend
- Python
- Django
- Django REST Framework
- PostgreSQL
- Redis
- Celery
- Server-Sent Events (SSE)

### Frontend
- React
- JavaScript
- REST API integration

### Infrastructure
- Docker
- Docker Compose

## 3. Architecture and Implementation

### Authentication and Authorization

- Implemented JWT-based authentication.
- Refresh tokens are handled using secure HTTP-only cookies.
- Access is controlled through role-based permissions.
- Protected endpoints validate user permissions before allowing operations.

### Organization Isolation

- Implemented organization-level data isolation.
- Users can only access resources belonging to their authorized organization.
- Backend querysets and permission checks enforce tenant boundaries.

### Work Order Management

- Implemented work order creation and management workflows.
- Added role-based restrictions for work order operations.
- Status changes are handled through controlled API operations.
- Activity history maintains a record of important changes.

### Scheduling and Concurrency

- Implemented scheduling conflict prevention.
- Used PostgreSQL database-level constraints to protect against conflicting concurrent operations.
- Database transactions are used where operations require atomicity.

### Idempotency

- Implemented idempotent event processing to prevent duplicate processing.
- Designed event handling to maintain consistency when requests or events are retried.

### Attachments

- Implemented attachment handling with access restrictions.
- Added quota-related validation.
- Resource access is checked before allowing attachment operations.

### Background Processing

- Celery handles asynchronous background tasks.
- Redis is used as the message broker and supporting infrastructure.

### Real-time Updates

- Implemented Server-Sent Events (SSE) for real-time updates.
- This allows clients to receive relevant updates without continuously polling the API.

### Audit History

- Maintained activity and audit records for important operations.
- Audit records are protected against unauthorized modification and deletion through the API.

### CSV Export

- Implemented CSV export functionality for relevant application data.

## 4. Testing

Automated tests cover important application functionality, including:

- Authentication and authorization.
- Role-based access restrictions.
- Organization-level isolation.
- Work order operations.
- Scheduling conflict handling.
- Idempotency.
- Attachment access and validation.
- Audit history.
- API behavior.

### Verification commands

Record the actual results from your final environment.

```bash
docker compose up -d --build
docker compose ps
```

Run the backend test suite using the configured test command:

```bash
docker compose exec backend pytest
```

Run frontend tests:

```bash
docker compose exec frontend npm test
```

Run frontend linting and production build if configured:

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

**Test results:** To be completed with the actual final test output. Do not report a passing test suite unless it has completed successfully.

## 5. Important Design Decisions

- Enforce authorization on the backend rather than relying only on frontend restrictions.
- Use database-level constraints for important data-integrity requirements.
- Use transactions for operations that must succeed or fail together.
- Keep audit history protected from ordinary application-level modification.
- Use asynchronous processing for background operations.
- Validate uploaded files and enforce resource access restrictions.
- Keep organization-level access checks consistent across API endpoints.

## 6. Known Limitations

Document any remaining limitations, incomplete features, environment-specific issues or test failures here.

Do not describe an unverified feature as fully tested.

## 7. Conclusion

The implementation aims to provide a secure and reliable work order management system with emphasis on backend correctness, data integrity, authorization and maintainable full-stack architecture.