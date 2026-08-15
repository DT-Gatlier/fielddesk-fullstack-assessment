# FieldDesk

Multi-tenant field-service management platform.

## Prerequisites
- Docker & Docker Compose
- Node.js 20+

## Setup & Running

1. **Install dependencies**
   \`\`\`bash
   npm run install:all
   \`\`\`

2. **Start Infrastructure (PostgreSQL, Redis)**
   \`\`\`bash
   docker-compose up -d
   \`\`\`

3. **Database Migration and Seeding**
   \`\`\`bash
   cd backend
   npx prisma migrate dev
   npx prisma db seed
   \`\`\`

4. **Start Application**
   \`\`\`bash
   # In terminal 1:
   npm run dev:backend
   
   # In terminal 2:
   npm run dev:worker
   
   # In terminal 3:
   npm run dev:frontend
   \`\`\`

## Commands Run During Assessment

### Testing
\`\`\`bash
cd backend && npx vitest run
\`\`\`
**Result**: 2 tests passed successfully. Verified Concurrency and Idempotency logic.

### Building
\`\`\`bash
cd backend && npm run build
cd worker && npm run build
cd frontend && npm run build
\`\`\`
**Result**: Built all packages successfully using \`tsc\` and \`vite\`.

### Linting
\`\`\`bash
cd backend && npm run lint
\`\`\`

## Default Seed Data
Two organizations are pre-seeded (password for all accounts: `Password123!`):

**AcmeFix Maintenance:**
1. `owner@acmefix.com` - Owner
2. `dispatcher@acmefix.com` - Dispatcher
3. `tech@acmefix.com` - Technician

**TechServe Solutions:**
1. `owner@techserve.com` - Owner
2. `dispatcher@techserve.com` - Dispatcher
3. `tech@techserve.com` - Technician

## Architecture
See \`TECHNICAL_NOTES.md\` for in-depth details on how concurrency, multi-tenancy, and background workers were implemented.
