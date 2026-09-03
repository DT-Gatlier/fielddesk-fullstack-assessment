---
labels: ["ready-for-agent"]
---

# PRD: FieldDesk Frontend Journeys

## Problem Statement

The user needs to build the frontend for FieldDesk, a multi-tenant platform for scheduling and tracking field-service work. Currently, there is no clear plan for what UI to show each persona (Owner, Dispatcher, Technician) and how they should navigate through their respective workflows without tripping over each other or using a bloated, generic UI.

## Solution

Build a role-based frontend architecture where users are routed to persona-specific dashboards immediately upon login. The Dispatcher gets a dense Data Table with a slide-out Side Panel for rapid scheduling and real-time WebSocket updates. The Technician gets a mobile-first, vertical Card Feed for easy status updates in the field (which scales to a responsive grid on desktop). The Owner gets an Administrative Control Panel for high-level stats, quota management, and user provisioning.

## User Stories

1. As an Owner, I want to view high-level summary counts (Total Open, Completed), so that I understand overall business volume.
2. As an Owner, I want to see a visual progress bar of our Organisation's storage quota, so that I know when we are approaching our attachment limit.
3. As an Owner, I want to manage users and assign roles, so that I can onboard or remove staff.
4. As an Owner, I want to download an organisation-scoped CSV export, so that I can run external reporting.
5. As a Dispatcher, I want to view all work orders in a dense Data Table, so that I can quickly search, filter, sort, and paginate through them.
6. As a Dispatcher, I want to click a work order and see a slide-out Side Panel, so that I can view details and make edits without losing my place in the list.
7. As a Dispatcher, I want to see work order statuses mutate in place with a brief highlight animation when changed by a Technician, so that I receive real-time updates via WebSockets without needing to refresh the page.
8. As a Dispatcher, I want to see inline validation errors on the scheduling form if I attempt an overlapping assignment, so that I immediately understand why the backend rejected the assignment (409 Conflict) and can pick a different time without losing my form state.
9. As a Technician, I want a mobile-optimized vertical feed of Cards representing my assigned work orders, so that I can easily view my schedule on my phone in the field.
10. As a Technician, I want to tap a card to see a touch-friendly detail view with large action buttons, so that I can easily transition a work order's status (e.g., Start Work, Complete Work) while on site.
11. As a Technician, I want a prominent button to upload attachments (images/PDFs) from my mobile device, so that I can document completed work.
12. As a Technician on a desktop computer, I want to see my cards laid out in a responsive grid, so that the screen real estate is used effectively without turning my view into an overly complex data table.

## Implementation Decisions

- The UI will be built in React (Vite).
- A centralized authentication context will intercept user roles upon login and route to `/owner`, `/dispatcher`, or `/technician`.
- A Data Table component with sorting/pagination hooks will be built for the Dispatcher.
- A Slide-out Drawer (Side Panel) component will be implemented for the Dispatcher edit view, allowing the underlying list to maintain state.
- WebSocket/SSE context will be established to listen for status events and trigger localized state updates (in-place mutations) in the Dispatcher's table.
- Form validation will handle 409 Conflict responses specifically by targeting the Time/Technician input fields with inline error messages.
- The Technician view will use a Card-based UI architecture, leveraging CSS Grid to switch from a single column on mobile to a multi-column grid on desktop breakpoints.
- The Owner view will consist of high-level dashboard widgets (stat cards, progress bars) and a user list table.

## Testing Decisions

- Good tests will focus on external behavior (user interactions and network responses) rather than implementation details of individual presentational components.
- **Network Boundary (MSW):** MSW (Mock Service Worker) will be used to mock REST endpoints and WebSocket/SSE events, ensuring components rely on actual network requests rather than mocked props.
- **Integration Tests (React Testing Library):** RTL will be used for Page-level integration tests (e.g., asserting that the Side Panel opens when a row is clicked, or that a row highlights when an MSW WebSocket event fires).
- **End-to-End Tests (Playwright):** Playwright will be used to test the actual running UI in a real browser, verifying the end-to-end routing, visual layouts, and complex interactive elements across breakpoints.

## Out of Scope

- Backend implementation of WebSockets/SSE (this PRD assumes the API contracts are established).
- Implementation of the database Row-Level Security (RLS) or file storage backend.
- Complex calendar or Gantt chart views (opted for Data Table to simplify assessment scope).

## Further Notes

- The backend API must return clear structured errors (especially for the 409 Concurrency conflicts) so the frontend can map them to the correct inline inputs.
