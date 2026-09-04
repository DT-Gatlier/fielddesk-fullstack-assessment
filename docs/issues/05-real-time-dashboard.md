## What to build

Mount `python-socketio` into FastAPI. Secure it with JWT auth and join org-specific rooms. Emit events when work orders change. Update the React app to listen and invalidate TanStack Queries.

## Acceptance criteria

- [x] Websocket connection requires a valid JWT.
- [x] Updates to a work order instantly reflect on the Dispatcher's dashboard without a full page refresh.
- [x] Organisation A does not receive events for Organisation B (strict org isolation).
- [x] Client handles reconnection automatically.

## Blocked by

- docs/issues/02-core-crud.md
