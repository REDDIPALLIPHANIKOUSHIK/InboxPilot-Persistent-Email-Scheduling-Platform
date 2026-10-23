# InboxPilot — Persistent Email Scheduling Platform

> Built for the **ReachInbox.ai Full-Stack Email Job Scheduler** Hiring Assignment.  
> **Author**: [REDDIPALLIPHANIKOUSHIK](https://github.com/REDDIPALLIPHANIKOUSHIK)  
> **Repository**: [https://github.com/REDDIPALLIPHANIKOUSHIK/InboxPilot-Persistent-Email-Scheduling-Platform](https://github.com/REDDIPALLIPHANIKOUSHIK/InboxPilot-Persistent-Email-Scheduling-Platform)

---

## 1. Project Overview & Motivation

### Why I Built InboxPilot
Email schedulers are deceptively simple: schedule a list of emails with delays and send them out. However, typical hobbyist implementations rely on in-memory timers (`setTimeout`, `setInterval`), cron libraries (`node-cron`, `Agenda`), or database polling loops (`SELECT * FROM emails WHERE status='scheduled' AND scheduled_at <= NOW()`). 

These approaches fail in real-world scenarios:
1. **Server reboots cause complete job loss** if jobs are held in process memory.
2. **Database polling creates immense I/O spikes** and does not scale past thousands of pending rows.
3. **Concurrent workers can easily double-send** or bypass sender hourly limits when counters are stored locally.
4. **Network glitches to SMTP relays produce duplicate dispatches** unless idempotency is strictly enforced across queue boundaries.

**InboxPilot** was engineered to solve every single one of these problems from first principles. It combines:
- **BullMQ + Persistent Redis** for delayed job queues that survive process terminations.
- **PostgreSQL + Prisma ORM** for ACID persistence, relational audit logs, and delivery attempt tracking.
- **Distributed Redis Lua Scripts** for atomic per-sender sliding-window rate limiting and send spacing across horizontal worker nodes.
- **Hard Idempotency Guarantees** with stable job IDs and conditional status updates.
- **Ethereal SMTP Integration** with preview URLs logged and linked in the UI.
- **Modern ReachInbox-Inspired SaaS Dashboard** built with React, Vite, Tailwind CSS, TanStack Query, and React Hook Form.

---

## 2. Core Feature Summary

- **Delayed BullMQ Scheduling**: Non-blocking delayed jobs backed by Redis sorted sets (`ZSET`). Zero cron jobs, zero polling intervals.
- **Crash Recovery & Restart Resilience**: Jobs scheduled for the future remain intact in Redis even if the API or Worker is halted.
- **Distributed Hourly Rate Limiting**: Per-sender rolling 1-hour sliding-window limits using atomic Redis Lua scripts (`MAX_EMAILS_PER_HOUR_PER_SENDER=200`). When exceeded, jobs are delayed into the next window—never dropped or failed.
- **Worker Concurrency & Send Spacing**: Concurrency controls (`WORKER_CONCURRENCY=5`) coupled with distributed per-sender spacing (`MIN_SEND_INTERVAL_MS=2000`) to avoid spamming mail servers.
- **Strict Idempotency**:
  - Unique campaign & recipient database keys.
  - Stable BullMQ job IDs (`email:${email.id}`).
  - Worker-side check preventing duplicate sends if a job is redelivered.
- **Lead Ingestion & Validation**:
  - CSV / plain text upload and manual paste.
  - Automatic column detection (handles headers and headerless CSVs).
  - RFC 5322 validation, deduplication, and live statistics (Valid Unique, Duplicates, Invalid).
- **Two Real-Time Dashboard Views**:
  - **Scheduled Emails**: Non-terminal queue (`scheduled`, `processing`), local timezone display, pagination, and safe cancellation.
  - **Sent Emails**: Terminal dispatches (`sent`, `failed`), retry history, error inspection, and one-click Ethereal web preview links.
- **Real Google OAuth 2.0**:
  - Secure HTTP-only cookies (`inboxpilot_session`), anti-CSRF state validation, and profile synchronization.

---

## 3. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Monorepo** | pnpm Workspaces, TypeScript 5.7 |
| **Backend API** | Node.js, Express.js, TypeScript, Zod, Cookie-Parser, CORS |
| **Worker Service** | Standalone Node.js process, BullMQ 5.41, Nodemailer 6.10, ioredis 5.5 |
| **Frontend UI** | React 18, Vite 6, TypeScript, Tailwind CSS, TanStack Query v5, Lucide React |
| **Database & ORM** | PostgreSQL 16, Prisma ORM 6 |
| **Queue & Cache** | Redis 7 (AOF enabled + RDB snapshots) |
| **Email Protocol** | Ethereal Email SMTP (`smtp.ethereal.email`) |
| **Authentication** | Google OAuth 2.0 (`google-auth-library`), JWT session cookies |
| **Testing** | Vitest 2.1, Supertest 7 |
| **DevOps** | Docker Compose, Vercel SPA configuration (`vercel.json`) |

---

## 4. Architecture & Workflow Diagrams

### High-Level Architecture
```mermaid
flowchart TD
    subgraph Frontend["Frontend Client (React + Vite + Tailwind)"]
        UI["React SPA Dashboard"]
        ComposeModal["Compose & Lead Ingestion"]
    end

    subgraph BackendAPI["Backend API Service (Express.js)"]
        AuthRouter["OAuth & Session Handler"]
        EmailRouter["Email Scheduling & Queries"]
        PrismaService["Prisma Client"]
    end

    subgraph Storage["Persistent Infrastructure Tier"]
        Postgres[(PostgreSQL\nUsers, Senders, Campaigns, Emails)]
        Redis[(Redis Key-Value & BullMQ Queue\nAOF + RDB Enabled)]
    end

    subgraph Workers["BullMQ Worker Tier"]
        WorkerNode["BullMQ Worker Process\n(Concurrency: 5)"]
        RateLimiter["Distributed Limiter\n(Redis Lua Scripts)"]
    end

    subgraph MailService["SMTP Delivery"]
        EtherealSMTP["Ethereal SMTP Server\nTest Inboxes & Preview URLs"]
    end

    UI -->|HTTP / Secure Cookie| BackendAPI
    ComposeModal -->|POST /api/emails/schedule| EmailRouter
    EmailRouter --> PrismaService
    PrismaService -->|ACID Transaction| Postgres
    EmailRouter -->|Bulk Delayed Jobs| Redis

    Redis -.->|Dispatches Ready Jobs| WorkerNode
    WorkerNode <-->|Atomic Token Reservation| RateLimiter
    RateLimiter <--> Redis
    WorkerNode -->|Conditional Status Updates| Postgres
    WorkerNode -->|SMTP Transmission| EtherealSMTP
```

### Scheduling Sequence Flow
```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Frontend as Frontend UI
    participant API as Express API
    participant DB as PostgreSQL
    participant Redis as BullMQ (Redis)
    participant Worker as BullMQ Worker
    participant SMTP as Ethereal SMTP

    User->>Frontend: Submits campaign (Recipients, Start Time, Delay, Rate Limit)
    Frontend->>API: POST /api/emails/schedule
    API->>API: Deduplicates & calculates scheduledAt(i) = startAt + i * delayMs
    API->>DB: Transaction: Create Campaign & Email records (status='scheduled')
    DB-->>API: Persisted
    API->>Redis: emailQueue.addBulk([jobs with stable IDs and delays])
    Redis-->>API: Queued in Delayed Sorted Set
    API-->>Frontend: 201 Created

    Note over Redis,Worker: Time advances to scheduled timestamp...

    Redis->>Worker: Executes job (emailId)
    Worker->>DB: Check email.status
    alt status == 'sent' or 'cancelled'
        Worker-->>Redis: Ack and skip (Idempotency)
    else status == 'scheduled'
        Worker->>Redis: Lua: Enforce send spacing (MIN_SEND_INTERVAL_MS)
        Worker->>Redis: Lua: Check hourly limit (MAX_PER_HOUR)
        alt Limit exceeded
            Worker->>DB: UPDATE email.scheduledAt = nextWindow
            Worker->>Redis: Re-delay job to next window
        else Limit OK
            Worker->>DB: UPDATE status='processing'
            Worker->>SMTP: sendMail via Ethereal SMTP
            SMTP-->>Worker: 250 Accepted (Message ID, Preview URL)
            Worker->>DB: UPDATE status='sent', sentAt=NOW
            Worker->>DB: Record DeliveryAttempt (success)
            Worker-->>Redis: Job Done
        end
    end
```

---

## 5. Repository Structure

```
InboxPilot-Persistent-Email-Scheduling-Platform/
├── apps/
│   ├── backend/               # Express.js REST API with Prisma & BullMQ producer
│   │   ├── src/
│   │   │   ├── config/        # Zod environment variable validation
│   │   │   ├── lib/           # Prisma, Redis, Queue, Logger singletons
│   │   │   ├── middleware/    # Auth, Error handling, Request logging
│   │   │   ├── routes/        # Auth, Email, Campaign, Sender, Health routes
│   │   │   ├── services/      # Business logic, scheduling, queries
│   │   │   ├── tests/         # Supertest & Vitest integration tests
│   │   │   ├── app.ts         # Express application configuration
│   │   │   └── server.ts      # Server entrypoint with graceful shutdown
│   │   └── package.json
│   ├── worker/                # BullMQ Worker consumer process
│   │   ├── src/
│   │   │   ├── config/        # Worker environment validation
│   │   │   ├── lib/           # Redis, Prisma, Mailer (Ethereal)
│   │   │   ├── rateLimiter/   # Distributed Lua script rate limiter & spacing
│   │   │   ├── worker.ts      # BullMQ worker execution loop & idempotency
│   │   │   └── index.ts       # Worker entrypoint with graceful shutdown
│   │   └── package.json
│   └── frontend/              # React 18 + Vite + Tailwind CSS SPA
│       ├── src/
│       │   ├── components/    # Navbar, MetricCards, Tables, ComposeModal
│       │   ├── context/       # AuthContext, ToastContext
│       │   ├── pages/         # DashboardPage, LoginPage
│       │   ├── services/      # Typed API client
│       │   ├── App.tsx        # Routing & providers
│       │   └── main.tsx
│       ├── index.html
│       ├── vite.config.ts
│       └── package.json
├── packages/
│   └── shared/                # Shared types, Zod schemas, lead parser, math
│       ├── src/
│       │   ├── schemas/       # Zod request validation schemas
│       │   ├── types/         # DTOs and API interfaces
│       │   └── utils/         # CSV parser, schedule calculator, constants
│       └── package.json
├── prisma/
│   └── schema.prisma          # PostgreSQL schema (User, Sender, Campaign, Email, DeliveryAttempt)
├── tests/
│   └── restart-recovery.test.ts # Reproducible restart & idempotency test suite
├── docs/
│   ├── architecture.md        # Technical architecture & sequence diagrams
│   └── demo-script.md         # 5-minute hiring manager speaker script
├── docker-compose.yml         # Local PostgreSQL & Redis with AOF persistence
├── package.json               # Root monorepo workspace configuration
├── pnpm-workspace.yaml        # pnpm workspace definition
├── sample-leads.csv           # Ready-to-use sample leads file
├── .env.example               # Complete environment variable template
├── .gitignore
├── vercel.json                # Vercel deployment configuration
└── README.md
```

---

## 6. Database Schema Design

Implemented in `prisma/schema.prisma`:

- **User**: Authenticated Google user (`id`, `googleId`, `name`, `email`, `avatarUrl`, `createdAt`, `updatedAt`).
- **Sender**: Configurable sender identities (`id`, `userId`, `name`, `email`, `isDefault`, `hourlyLimit`, `minimumSendIntervalMs`). Never returns credentials to frontend.
- **Campaign**: Batch email groupings (`id`, `userId`, `senderId`, `name`, `subject`, `body`, `startAt`, `delayBetweenEmailsMs`, `hourlyLimit`, `status`, `totalEmails`, `sentCount`, `failedCount`).
- **Email**: Individual recipient dispatches (`id`, `userId`, `campaignId`, `senderId`, `recipientEmail`, `subject`, `body`, `scheduledAt`, `sentAt`, `status`, `idempotencyKey`, `bullmqJobId`, `attempts`, `lastError`).
  - Indexed by `userId`, `campaignId`, `senderId`, `status`, `scheduledAt`, and unique `idempotencyKey`.
- **DeliveryAttempt**: Immutable audit log of every transmission attempt (`id`, `emailId`, `attemptNumber`, `startedAt`, `completedAt`, `status`, `errorMessage`, `providerMessageId`).

---

## 7. Distributed Rate Limiting & Concurrency Architecture

### Concurrency vs. Minimum Send Spacing
- **`WORKER_CONCURRENCY`** controls how many jobs a worker process pulls simultaneously from BullMQ (default: `5`).
- **`MIN_SEND_INTERVAL_MS`** controls the minimum time that MUST elapse between two dispatches from the same sender (default: `2000ms`).
- Even with 10 workers running concurrently, an atomic Redis Lua script ensures two jobs for the same sender are never sent closer together than `MIN_SEND_INTERVAL_MS`.

### Distributed Sliding-Window Hourly Rate Limiting
Implemented via an atomic Redis Lua script operating on sorted set `ratelimit:hourly:{senderId}`:
1. Purges sends older than 3600 seconds (`ZREMRANGEBYSCORE key -inf (now - 3600000)`).
2. Counts sends currently inside the 1-hour window (`ZCARD key`).
3. If `count < limit`: records send (`ZADD key now emailId`) and allows dispatch.
4. If `count >= limit`: reads oldest send in window, computes exact `retryAfterMs = (oldestTimestamp + 3600000) - now`, and reschedules the job in BullMQ to that future time.
5. **No job is ever dropped or failed** when hitting a rate limit.

---

## 8. Idempotency & Crash Recovery Guarantees

1. **Unique Idempotency Keys**: Database-enforced uniqueness on `idempotencyKey` (`campaignId:recipientEmail`) prevents duplicate scheduling.
2. **Stable BullMQ Job IDs**: Assigned as `email:${email.id}`. BullMQ deduplicates identical job IDs in Redis.
3. **Worker-Side Status Check**: If an email is already marked `sent` or `cancelled` in PostgreSQL, the worker immediately acknowledges and skips the job without transmitting.
4. **Redis AOF Persistence**: Docker configuration runs Redis with `--appendonly yes --appendfsync everysec`, preserving delayed queue states across container or host reboots.
5. **The SMTP Ambiguity Window**: SMTP protocol transmission and database writes cannot be committed in a single distributed transaction. If Ethereal accepts a message but the process crashes before updating PostgreSQL, the delivery attempt record preserves `startedAt` and `attemptNumber` to facilitate transparent recovery without duplicate sends.

---

## 9. Environment Variables (`.env`)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Default in Development |
| :--- | :--- | :--- |
| `PORT` | API server port | `5000` |
| `FRONTEND_URL` | Client origin for CORS | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/inboxpilot?schema=public` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret key for JWT session cookies | (32-character string) |
| `SESSION_SECRET` | Cookie signing secret | (32-character string) |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | (From Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | (From Google Cloud Console) |
| `GOOGLE_REDIRECT_URI` | Google OAuth Callback URL | `http://localhost:5000/api/auth/google/callback` |
| `ETHEREAL_HOST` | Ethereal SMTP host | `smtp.ethereal.email` |
| `ETHEREAL_PORT` | Ethereal SMTP port | `587` |
| `ETHEREAL_USER` | Ethereal username (auto-generated if empty) | *Optional* |
| `ETHEREAL_PASSWORD` | Ethereal password (auto-generated if empty) | *Optional* |
| `WORKER_CONCURRENCY` | Parallel jobs per worker | `5` |
| `MIN_SEND_INTERVAL_MS` | Per-sender minimum send delay | `2000` |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-sender hourly limit | `200` |
| `VITE_API_BASE_URL` | Frontend API URL | `http://localhost:5000` |

---

## 10. Local Setup & Running Instructions

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Start PostgreSQL & Redis via Docker
```bash
docker compose up -d
```
Verify containers are healthy:
```bash
docker compose ps
```

### Step 3: Run Database Migrations
```bash
pnpm prisma:generate
pnpm prisma:push
```

### Step 4: Run Services
You can run all three services concurrently:
```bash
pnpm dev
```
Or run each service in separate terminal windows:
```bash
# Terminal 1: Backend API (Port 5000)
pnpm dev:backend

# Terminal 2: BullMQ Worker
pnpm dev:worker

# Terminal 3: Frontend Client (Port 5173)
pnpm dev:frontend
```

Open `http://localhost:5173` in your browser.

---

## 11. Google OAuth 2.0 Configuration

1. Visit [Google Cloud Console](https://console.cloud.google.com/) -> **APIs & Services** -> **Credentials**.
2. Click **Create Credentials** -> **OAuth Client ID**.
3. Application Type: **Web application**.
4. Authorized JavaScript origins:
   - `http://localhost:5173`
   - `http://localhost:5000`
5. Authorized redirect URIs:
   - `http://localhost:5000/api/auth/google/callback`
6. Copy the **Client ID** and **Client Secret** into your `.env` file:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
   ```

---

## 12. API Endpoint Reference

### Authentication
- `GET /api/auth/google`: Initiates Google OAuth 2.0 flow with state parameter.
- `GET /api/auth/google/callback`: Handles OAuth exchange, sets secure HTTP-only cookie.
- `GET /api/auth/me`: Returns authenticated user profile and senders.
- `POST /api/auth/logout`: Clears session cookie.

### Emails
- `POST /api/emails/schedule`: Validates payload, persists records, and enqueues BullMQ delayed jobs.
- `GET /api/emails/scheduled`: Paginated non-terminal emails (`scheduled`, `processing`).
- `GET /api/emails/sent`: Paginated terminal emails (`sent`, `failed`) with Ethereal preview URLs.
- `GET /api/emails/:id`: Single email inspection.
- `POST /api/emails/:id/cancel`: Safely cancels email in DB and deletes BullMQ job.

### Senders & Campaigns
- `GET /api/senders`: Lists sender identities.
- `POST /api/senders`: Creates sender identity with hourly limit and minimum interval.
- `GET /api/campaigns`: Lists campaigns with delivery metrics.
- `GET /api/campaigns/stats/overview`: Returns KPI counts for dashboard cards.

### Health
- `GET /api/health`: Liveness probe (`{ status: "ok" }`).
- `GET /api/health/ready`: Readiness probe checking PostgreSQL, Redis, and BullMQ connectivity.

---

## 13. Testing & Verification

Run the full automated test suite:
```bash
pnpm test
```

### Included Tests:
- `packages/shared/src/utils/csvParser.test.ts`: RFC 5322 parsing, header detection, deduplication, invalid address detection.
- `packages/shared/src/utils/scheduleCalculator.test.ts`: `scheduledAt(i)` progression, BullMQ delay math, rate limit window rolling.
- `apps/worker/src/rateLimiter/rateLimiter.test.ts`: Redis Lua script hourly quota reservation and send spacing enforcement.
- `apps/backend/src/tests/health.test.ts`: Health & readiness endpoints.
- `apps/backend/src/tests/auth.test.ts`: Auth protection and logout.
- `apps/backend/src/tests/email.test.ts`: Unauthenticated request rejection and parameter validation.
- `tests/restart-recovery.test.ts`: Worker stop/restart simulation, delayed job preservation, and idempotency guards.

---

## 14. Vercel & Production Deployment Guide

### Frontend on Vercel
1. The repository root contains `vercel.json` configured for Vite SPA rewrites:
   ```json
   {
     "framework": "vite",
     "buildCommand": "pnpm --filter @inboxpilot/shared build && pnpm --filter @inboxpilot/frontend build",
     "outputDirectory": "apps/frontend/dist",
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```
2. Configure Environment Variables in Vercel:
   - `VITE_API_BASE_URL`: Your deployed backend API URL (e.g., `https://api.inboxpilot.yourdomain.com`).

### Backend API & Worker Deployment
> **Crucial Architecture Note**: The frontend on Vercel is a static SPA. The BullMQ Worker **CANNOT** run as a serverless function because BullMQ workers require persistent, long-lived process execution and socket connections to Redis.

- **Recommended Platforms**: Render, Railway, AWS ECS, or Fly.io.
- **Components**:
  1. **PostgreSQL**: Managed database (Supabase, Neon, AWS RDS).
  2. **Redis**: Persistent Redis with AOF enabled (Upstash Redis with persistence or Redis Cloud).
  3. **Backend Service**: Deployed as a web service (`pnpm start` in `apps/backend`).
  4. **Worker Service**: Deployed as a background worker (`pnpm start` in `apps/worker`).

---

## 15. Requirement-to-Implementation Checklist

| Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **Monorepo Structure** | Verified | `apps/frontend`, `apps/backend`, `apps/worker`, `packages/shared`, `prisma` |
| **Real BullMQ Delayed Jobs** | Verified | Zero cron/intervals. Pure BullMQ delayed sets via `emailQueue.addBulk()` |
| **PostgreSQL & Prisma** | Verified | User, Sender, Campaign, Email, DeliveryAttempt models with indexes |
| **Idempotency & Crash Recovery** | Verified | Stable job IDs `email:${id}`, DB idempotency keys, worker duplicate check |
| **Distributed Hourly Rate Limiting** | Verified | Per-sender atomic sliding-window Lua script. Jobs rescheduled, never dropped |
| **Concurrency & Send Spacing** | Verified | `WORKER_CONCURRENCY` and distributed `MIN_SEND_INTERVAL_MS` via Redis |
| **Ethereal SMTP Integration** | Verified | Nodemailer Ethereal transport, preview URLs generated and displayed |
| **Real Google OAuth 2.0** | Verified | `google-auth-library` flow, HTTP-only JWT cookies, CSRF state protection |
| **React Dashboard (ReachInbox Design)** | Verified | Scheduled Emails, Sent Emails, KPI cards, dark SaaS theme, toasts |
| **Lead Parser (CSV / Text)** | Verified | Header & headerless CSV support, RFC 5322 validation, duplicate removal |
| **Comprehensive Tests** | Verified | Unit tests, API integration tests, rate limiter tests, restart recovery test |
| **Vercel & Docker Configuration** | Verified | `vercel.json` SPA config, `docker-compose.yml` with persistent Redis AOF |
| **Documentation & Demo Script** | Verified | `README.md`, `docs/architecture.md`, `docs/demo-script.md` |
