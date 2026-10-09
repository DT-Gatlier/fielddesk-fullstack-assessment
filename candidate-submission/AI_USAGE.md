# AI usage disclosure

AI-assisted development tools are permitted for this assessment. Their use does not reduce the score by itself. Transparency, independent verification and understanding of the submitted work are required.

List every AI tool used, including coding assistants, chat tools, code generators, design generators and automated review tools.

## Usage summary

| Tool and model, if known | Files, features or sections affected | Purpose of use | Nature of the output | How I reviewed or tested it |
| :--- | :--- | :--- | :--- | :--- |
| **Claude Sonnet 4.8** | System architecture, `apps/api`, `apps/web`, security patterns, database constraints | Architectural critique, threat modeling, scalability analysis, and implementation planning | Design critiques, edge-case analysis, and implementation planning breakdowns | Reviewed every architectural suggestion against assessment constraints; eliminated unnecessary dependencies; verified against multi-tenant isolation rules |
| **Codex sol 6.1** | Monorepo scaffolding, configuration packages, initial folder layouts, domain services, DTOs | Initial monorepo foundation, workspace boilerplate, and targeted code generation | Configuration files, initial NestJS/Next.js scaffolding, boilerplate DTOs and handlers | Manually refactored generated boilerplate to adhere to strict custom workspace rules; enforced consistent formatting, typing, and zero lint warnings |
| **Claude Sonnet 4.8 & Codex sol 6.1** | `apps/api/src/modules/work-order`, `apps/web/src/app`, `packages/database`, unit/e2e test suites | Code generation for domain logic, exclusion constraints, UI components, and test suites | NestJS services, Prisma queries, React components, and Jest/Vitest test files | Conducted line-by-line manual reviews; deliberately introduced intentional failures to ensure tests fail when assertions break; validated with `pnpm test` and `pnpm typecheck` |
| **DeepSeek V4 Pro (via OpenCode)** | Whole codebase review, assessment gap analysis, regression verification | Independent automated code review, edge-case identification, and pre-submission gap detection | Markdown code review audits, defect reports, and edge-case lists | Cross-referenced against my own manual audit checklist; independently confirmed each flagged finding before applying fixes; re-verified with full test suite runs |

## Details

### 1. Requirements Breakdown, Architectural Analysis & Stack Finalization (Claude Sonnet 4.8)
- **What I asked the tool to help with**: After reading the assessment brief, I drafted my initial architectural plan and asked Claude to analyze it for scalability bottlenecks, tenant isolation risks, concurrency edge cases (such as overlapping technician assignments), and architectural trade-offs.
- **Parts affected**: High-level system architecture, database schema design (deciding on PostgreSQL `btree_gist` exclusion constraints over in-memory locks), and Server-Sent Events vs. WebSocket decisions.
- **What I changed**: Rejected suggestions that introduced heavy third-party distributed message queues (e.g., Kafka/RabbitMQ) in favor of a lean, reliable PostgreSQL-backed Transactional Outbox pattern that guarantees atomic consistency within the same database transaction.
- **How I verified**: Verified that the chosen architecture satisfies all 13 sections of `docs/ASSESSMENT.md` and maintains zero external cloud dependencies for local execution.

### 2. Monorepo Foundation & Custom Engineering Standards (Codex sol 6.1)
- **What I asked the tool to help with**: I established custom engineering guidelines (focused on team maintainability, strict typing, and clean directory modularity) and instructed Codex to scaffold the initial Turborepo workspace, shared ESLint/TypeScript configurations, and Tailwind CSS design tokens.
- **Parts affected**: Root workspace configuration, `packages/typescript-config`, `packages/eslint-config`, `packages/database`, starter applications in `apps/api` and `apps/web`.
- **What I changed**: Cleaned up default template bloat, replaced external Google Fonts with robust system font stacks, normalized path aliases (`@/`), and enforced strict compiler flags across all workspace packages.
- **How I verified**: Executed frozen lockfile installations (`pnpm install --frozen-lockfile`), verified clean typecheck across all packages, and ensured both frontend and backend served HTTP 200 on independent ports.

### 3. Feature Implementation & Failure-First Testing (Claude Sonnet 4.8 & Codex sol 6.1)
- **What I asked the tool to help with**: For each domain feature (authentication, work orders, technician scheduling, transactional outbox worker, attachment handling, real-time SSE), I defined the folder structure and interface contracts based on my standards, discussed the security edge cases with Claude, and had Codex/Claude assist in generating the implementation code and automated test suites.
- **Parts affected**: `apps/api/src/modules/*`, `apps/web/src/app/*`, `packages/database/prisma/schema.prisma`, and corresponding unit/integration test suites.
- **What I changed**:
  - Re-implemented the progress event submission to enforce pre-authorization on idempotent replays, ensuring unauthorized callers cannot read cached events.
  - Enforced atomic outbox insertion inside the work order creation transaction.
  - Added dead-letter queue classification for background jobs that fail permanently or exhaust maximum retry attempts.
- **How I verified (Failure-First Testing)**:
  - For generated test suites, **I deliberately broke the underlying implementation first** (e.g., inverted an authorization check, broke an exclusion constraint) to confirm that the tests actively failed as expected before restoring the code to a passing state.
  - Verified full test runs across the entire workspace: `pnpm test` (105 API tests, 56 Web tests), `pnpm lint` (0 warnings), and `pnpm build`.

### 4. Automated Adversarial Review & Edge-Case Discovery (DeepSeek V4 Pro)
- **What I asked the tool to help with**: Used DeepSeek to run an adversarial code review across the codebase, searching for hidden race conditions, missed tenant isolation filters, CSV formula injection vulnerabilities, and incomplete assessment brief requirements.
- **Parts affected**: Security filters, sanitization utilities (`csv-sanitizer.ts`), file validation magic-byte sniffing (`file-validator.ts`), and gap reports.
- **What I changed**: Fixed potential race conditions on work order status transitions by enforcing row-level locking (`SELECT ... FOR UPDATE`), added spreadsheet formula neutralization for CSV exports, and implemented magic-byte file header validation.
- **How I verified**: Maintained an independent manual checklist of expected edge cases, verified that DeepSeek's audit aligned with my manual evaluation, and wrote dedicated regression tests for every identified gap.

## Candidate confirmation

Replace the unchecked boxes with checked boxes when true:

- [x] I have disclosed all AI-assisted work in this submission.
- [x] I personally reviewed every submitted file.
- [x] I can explain and modify every part of the implementation.
- [x] I independently ran the documented tests and checks.
- [x] I did not submit confidential or proprietary third-party material.

Candidate name: Arshad

Date: 2026-10-09
