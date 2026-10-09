# Monorepo foundation

Status: accepted

Date: 2026-10-06

## Decision

Use pnpm 10 workspaces and Turborepo 2 for one Next.js 16 frontend and one NestJS
11 API. Use Node.js 22.23.1 locally and in CI. The root package-manager field pins
pnpm 10.34.6; the single lockfile records exact dependency resolution.

Keep application code in `apps/web` and `apps/api`. Share TypeScript and ESLint
configuration through two private `@fielddesk/*` packages. Both apps use strict
TypeScript, with Next.js bundler/JSX options and NestJS CommonJS/decorator options
kept separate. Use root Prettier configuration and LF line endings.

## Rationale

The LMS reference demonstrates a useful apps/packages layout and task runner.
FieldDesk follows those organisational ideas independently, without copying
application code, integrations, credentials, or branding. A single package-manager
version and shared checks avoid inconsistent app tooling.

## Consequences

Root commands run both apps or select an individual app. Turbo caches builds,
lint, types, and tests; it does not cache persistent servers or lint mutations.
GitHub CI checks formatting, lint, types, API starter tests, and production builds
on pull requests and pushes to `main` and `assessment/arshadakl`.
Apps cannot depend on each other. Any future shared runtime package must have a
real consumer and explicit workspace dependencies.

This milestone has only starter routes. PostgreSQL, Prisma, Redis, an independent
worker, Docker Compose, authentication, OpenAPI generation, frontend data libraries,
and domain features remain future work. Git hooks and commit-message enforcement
are deferred. Environment validation and dependency-aware readiness will be added
when runtime services are introduced.
