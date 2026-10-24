# InboxPilot — Persistent Email Scheduling Platform

> Enterprise-grade persistent email scheduling, transactional outbox delivery, and distributed rate limiting platform.  
> **Author**: [REDDIPALLIPHANIKOUSHIK](https://github.com/REDDIPALLIPHANIKOUSHIK)  
> **Repository**: [https://github.com/REDDIPALLIPHANIKOUSHIK/InboxPilot-Persistent-Email-Scheduling-Platform](https://github.com/REDDIPALLIPHANIKOUSHIK/InboxPilot-Persistent-Email-Scheduling-Platform)  
> **Frontend Deployment**: [https://inboxpilot-persistent-email-schedul.vercel.app/](https://inboxpilot-persistent-email-schedul.vercel.app/)

---

## 1. Project Overview & Problem Statement

Email scheduling at production scale is deceptively complex. Naive implementations frequently rely on in-memory timers (`setTimeout`, `setInterval`), cron triggers (`node-cron`, `Agenda`), or database polling loops (`SELECT * FROM emails WHERE status='scheduled' AND scheduled_at <= NOW()`).

In distributed production environments, these approaches break down:
1. **Process Restarts Cause Silent Job Loss**: In-memory timers vanish when a Node.js process terminates, deploys, or crashes.
2. **Database Polling Collapses Under Load**: Frequent polling loops saturate database IOPS, generate lock contention, and do not scale to thousands of pending emails.
3. **Multi-Worker Rate Limiting Overflows**: Independent worker processes sharing an account will double-send or burst past hourly SMTP rate limits unless state is atomically synchronized across all instances.
4. **Network & Crash Partitions Strand Records**: If a database transaction commits but network transmission to the queue fails, emails become permanently stranded unless a transactional outbox reconciles them.

**InboxPilot** was designed and implemented to solve these distributed systems challenges from first principles:
- **BullMQ + Persistent Redis (AOF)**: Delayed job queues stored in Redis sorted sets (`ZSET`). Zero cron jobs, zero database polling loops.
- **Transactional Outbox Pattern**: Campaign, Email, and Outbox records are created in a single atomic PostgreSQL transaction. An asynchronous dispatcher and reconciliation runner drain outbox messages into BullMQ with stable job IDs.
- **Fail-Safe Distributed Rate Limiting**: Rolling 1-hour sliding-window limiter executed atomically via Redis Lua scripts. If Redis is degraded, the limiter fails safe—never allowing unmetered sends.
- **Distributed Send Spacing**: Enforces minimum intervals between dispatches per sender identity across all concurrent workers without blocking worker threads with inline sleep.
- **Strict Idempotency**: Database-level unique constraints (`userId + idempotencyKey`) and stable BullMQ job IDs (`email:${emailId}`) prevent duplicate sends across retries or double clicks.
- **Ethereal SMTP Integration**: Real SMTP transmission via Nodemailer, recording message IDs and direct web preview inspection links.
- **Modern SaaS Dashboard**: React SPA with live dark theme, lead CSV/text ingestion, Scheduled & Sent tables, and isolated preview mode.

---

## 2. Architecture & Request Workflow

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React 18 + Vite + Tailwind CSS)"]
        UI["React SPA Dashboard\n(Scheduled & Sent Views)"]
        Compose["Compose Modal &\nLead CSV Ingestion"]
    end

    subgraph API["Backend API Service (Express.js)"]
        AuthRouter["OAuth & Session Handler"]
        EmailService["EmailService\n(Idempotency Guard)"]
        OutboxDispatcher["Outbox Dispatcher &\nReconciler Loop (5s)"]
    end

    subgraph Storage["Persistent Infrastructure"]
        Postgres[("PostgreSQL 16 (Prisma ORM)\nUsers, Senders, Campaigns,\nEmails, Outbox, Attempts")]
        RedisQueue[("Redis 7 (AOF + RDB)\nBullMQ Delayed ZSET &\nSliding-Window Lua Keys")]
    end

    subgraph WorkerTier["Distributed Worker Tier"]
        BullWorker["BullMQ Worker Process\n(WORKER_CONCURRENCY=5)"]
        Limiter["DistributedLimiter\n(Sliding Window & Spacing)"]
    end

    subgraph External["External Services"]
        GoogleOAuth["Google Cloud OAuth 2.0"]
        EtherealSMTP["Ethereal SMTP Server\n(Message ID & Preview URL)"]
    end

    Compose -->|POST /api/emails/schedule| EmailService
    AuthRouter <-->|Verify ID Token| GoogleOAuth
    EmailService -->|1. ACID Transaction:\nCampaign + Emails + Outbox| Postgres
    EmailService -->|2. Immediate Dispatch| OutboxDispatcher
    OutboxDispatcher -->|3. addBulk() with Stable Job IDs| RedisQueue
    OutboxDispatcher -->|4. Mark outbox 'published'| Postgres
    RedisQueue -.->|5. Dispatches mature delayed job| BullWorker
    BullWorker <-->|6. Atomic Rate Limit & Spacing| Limiter
    Limiter <-->|Lua Evaluation| RedisQueue
    BullWorker -->|7. Conditional lease to 'processing'| Postgres
    BullWorker -->|8. SMTP Send| EtherealSMTP
    BullWorker -->|9. Atomic status='sent' + attempt log| Postgres
```

### Detailed Scheduling Workflow
1. **Submission & Deduplication**: The user uploads leads (CSV or raw text). The client validates email syntax and removes duplicates before submission.
2. **Idempotency Check**: `EmailService` verifies whether `clientCampaignKey` was previously submitted for this user. If so, it returns the existing campaign immediately.
3. **Transactional Outbox Commit**: Within a single PostgreSQL transaction:
   - The `Campaign` record is created with the idempotency key.
   - Individual `Email` records are created with `status: 'scheduled'`, `idempotencyKey: '${campaignId}:${recipient}'`, and `bullmqJobId: 'email:${emailId}'`.
   - `OutboxMessage` records are created with `status: 'pending'`, stable `jobId`, delay offset, and job payload.
4. **Outbox Dispatch & Background Reconciler**:
   - The backend immediately triggers `OutboxService.dispatchOutboxMessages()`, calling BullMQ's `addBulk()` with stable job IDs.
   - Upon successful enqueueing, outbox records are marked `status: 'published'`.
   - If Redis is temporarily unreachable, outbox records remain `pending` with incremented `retryCount`. The background reconciler runs every 5 seconds, draining any pending outbox rows as soon as Redis recovers.
5. **Worker Execution & Lease Acquisition**:
   - BullMQ holds jobs in the delayed sorted set until their target timestamp arrives.
   - When a job matures, the BullMQ worker picks it up and verifies that the email is not already `sent` or `cancelled`.
   - The worker executes an atomic conditional update (`status: 'processing'`). If another worker already claimed the job, it skips execution immediately.
6. **Spacing & Rate Limit Coordination**:
   - The worker invokes `checkSendSpacing(senderId, minIntervalMs)`. If another send recently occurred for this sender, the job is re-delayed in BullMQ via `job.moveToDelayed()`—never blocking with inline sleep.
   - The worker invokes `acquireHourlySlot(senderId, hourlyLimit, emailId)`. If the hourly limit is reached, it computes the exact remaining time until the oldest send drops out of the sliding window and re-delays the job.
7. **SMTP Transmission & Attempt Logging**:
   - The worker dispatches the email via Nodemailer to Ethereal SMTP.
   - On success: An atomic database transaction records the `DeliveryAttempt`, updates the email to `status: 'sent'`, and increments the campaign's `sentCount`.
   - On failure: If the error is permanent (SMTP 5xx or 3 attempts), the email is marked `failed`. If transient, the status reverts to `scheduled` and BullMQ's exponential backoff retries the job.

---

## 3. Distributed Rate Limiting & Spacing Algorithms

### Atomic Sliding-Window Hourly Limiter
Implemented in `apps/worker/src/rateLimiter/distributedLimiter.ts` using Redis sorted sets (`ratelimit:hourly:${senderId}`):
- **Algorithm**:
  1. Purges entries older than the 1-hour window: `ZREMRANGEBYSCORE key -inf (now - 3600000)`.
  2. Counts active sends within the window: `ZCARD key`.
  3. If `count < limit`: records the reservation `ZADD key now emailId`, refreshes key TTL to `2 hours`, and returns `{ allowed: true }`.
  4. If `count >= limit`: inspects the oldest timestamp via `ZRANGE key 0 0 WITHSCORES`, calculates `retryAfterMs = (oldestTimestamp + 3600000) - now`, and returns `{ allowed: false, retryAfterMs }`.
- **Fail-Safe Guarantee**: If Redis is offline or Lua execution encounters an error, the limiter **fails safe** (`allowed: false, isError: true, retryAfterMs: 5000`). It NEVER permits unchecked dispatches.
- **Reservation Release**: If an error occurs before network transmission, `releaseHourlySlot()` removes the reservation via `ZREM` so that quota is not consumed.

### Distributed Minimum Send Spacing
- Configurable per sender identity (`MIN_SEND_INTERVAL_MS`, default `2000ms`).
- Key: `spacing:sender:${senderId}`.
- Atomic Lua script verifies `now - lastSent >= minIntervalMs`. If too soon, returns `{ allowed: false, waitMs }`.
- **Zero Inline Sleep**: Workers do not call `setTimeout()` or block concurrency slots. The job is rescheduled in BullMQ using `job.moveToDelayed(Date.now() + waitMs)`.

---

## 4. Idempotency & Crash Recovery Guarantees

| Failure Scenario | Recovery Mechanism |
| :--- | :--- |
| **User clicks "Schedule" multiple times** | Client passes unique `idempotencyKey`. Database enforces `@@unique([userId, idempotencyKey])`. Repeated calls return the existing campaign. |
| **Duplicate recipient in CSV** | Client and backend deduplicate recipient arrays before persistence, rejecting duplicate email rows. |
| **Backend crashes right after DB write** | Transactional outbox records are committed with `status: 'pending'`. Upon backend restart, the reconciler loop enqueues them into BullMQ. |
| **Redis connection drops during scheduling** | Outbox messages remain stored in PostgreSQL. As soon as Redis reconnects, the 5-second reconciler loop drains them to BullMQ. |
| **Worker crashes while processing job** | BullMQ's stalled job mechanism reassigns the job. The worker's conditional update (`WHERE status = 'scheduled'`) ensures only one worker acquires execution ownership. |
| **Worker reboot during delayed wait** | Redis persistence (`--appendonly yes --appendfsync everysec`) preserves all delayed sorted sets. When workers resume, delayed jobs fire on schedule. |
| **Email cancelled while delayed** | Worker checks database state upon pickup. If `status === 'cancelled'`, it drops the job without contacting SMTP. |

---

## 5. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Monorepo** | pnpm Workspaces, TypeScript 5.7 |
| **Backend API** | Node.js, Express.js, Prisma ORM 6, Zod, Cookie-Parser, CORS |
| **Worker Service** | BullMQ 5.41, ioredis 5.5, Nodemailer 6.10 |
| **Frontend UI** | React 18, Vite 6, Tailwind CSS, TanStack Query v5, Lucide React |
| **Database** | PostgreSQL 16 (ACID transactions, relational schemas, indexed lookups) |
| **Queue & Cache** | Redis 7 (AOF enabled, RDB snapshots, atomic Lua scripts) |
| **SMTP Delivery** | Ethereal Email SMTP (`smtp.ethereal.email`) |
| **Authentication** | Google OAuth 2.0 (`google-auth-library`), secure HTTP-only session cookies |
| **Testing** | Vitest 2.1, Supertest 7 (44 automated tests) |

---

## 6. Environment Variables (`.env`)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Default in Development |
| :--- | :--- | :--- |
| `PORT` | Backend Express server port | `5000` |
| `NODE_ENV` | Environment mode (`development` / `production`) | `development` |
| `FRONTEND_URL` | Frontend origin for CORS and OAuth redirection | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/inboxpilot?schema=public` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `JWT_SECRET` | Secret key for signing JWT cookies (>= 32 chars) | (random 32-char string) |
| `SESSION_SECRET` | Secret key for signed cookie verification | (random 32-char string) |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth 2.0 Client ID | (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth 2.0 Client Secret | (from Google Cloud Console) |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URL | `http://localhost:5000/api/auth/google/callback` |
| `ETHEREAL_HOST` | Ethereal SMTP server hostname | `smtp.ethereal.email` |
| `ETHEREAL_PORT` | Ethereal SMTP server port | `587` |
| `ETHEREAL_USER` | Ethereal username (auto-generated if empty) | *Optional* |
| `ETHEREAL_PASSWORD` | Ethereal password (auto-generated if empty) | *Optional* |
| `WORKER_CONCURRENCY` | Parallel jobs per worker process | `5` |
| `MIN_SEND_INTERVAL_MS` | Minimum interval between sends per sender identity | `2000` |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Distributed hourly rate limit per sender identity | `200` |
| `VITE_API_BASE_URL` | Base API URL consumed by Vite frontend | `http://localhost:5000` |

---

## 7. Local Development Guide

### Prerequisites
- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose (or local PostgreSQL & Redis)

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Start PostgreSQL & Redis
```bash
docker compose up -d
```
Verifies Redis is running with AOF persistence:
```bash
docker compose ps
```

### Step 3: Run Database Migrations
```bash
pnpm prisma:generate
pnpm prisma:push
```

### Step 4: Run Services
Start all packages concurrently in development mode:
```bash
pnpm dev
```
Or run each service individually in separate terminals:
```bash
# Terminal 1: Backend API (Port 5000)
pnpm dev:backend

# Terminal 2: BullMQ Worker
pnpm dev:worker

# Terminal 3: React Frontend (Port 5173)
pnpm dev:frontend
```

Open `http://localhost:5173` in your browser.

---

## 8. Google OAuth 2.0 Configuration

1. Open [Google Cloud Console](https://console.cloud.google.com/) -> **APIs & Services** -> **Credentials**.
2. Click **Create Credentials** -> **OAuth Client ID**.
3. Select **Web application**.
4. Set **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `http://localhost:5000`
5. Set **Authorized redirect URIs**:
   - `http://localhost:5000/api/auth/google/callback`
6. Copy the generated credentials into your `.env`:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
   ```

---

## 9. Testing & Verification

Run the full automated test suite:
```bash
pnpm test
```

Type-check all packages:
```bash
pnpm typecheck
```

Build production bundles:
```bash
pnpm build
```

### Automated Test Suites (44 Tests across 9 Files)
- **Rate Limiting & Spacing (`apps/worker/src/rateLimiter/rateLimiter.test.ts`)**:
  - Hourly quota acquisition and reservation.
  - Limit reached with accurate `retryAfterMs` computation.
  - Fail-safe behavior on Redis connection error (never fails open).
  - Fail-safe behavior on Redis Lua script execution failure.
  - Slot release upon pre-transmission failure.
  - Concurrent worker coordination for shared sender keys.
  - Key isolation across distinct sender identities.
  - Minimum send spacing enforcement and fail-safe re-delay.
- **Campaign Idempotency & Outbox (`tests/idempotency-outbox.test.ts`)**:
  - Deterministic BullMQ job ID assignment (`email:${id}`).
  - Scoped campaign idempotency keys per user.
  - Duplicate recipient syntax normalization and deduplication.
  - Outbox message creation in transaction and BullMQ dispatch.
  - Outbox retry and status tracking on Redis failure.
  - Atomic conditional lease ownership preventing double-sends.
  - Safe skip of cancelled emails.
  - Safe campaign counter increments.
- **Redis & BullMQ Persistence (`tests/redis-bullmq-persistence.test.ts`)**:
  - BullMQ stable job ID deduplication.
  - Delayed jobs surviving worker shutdown and resuming on restart.
  - Sliding-window mathematical expiry calculations.
  - Distributed send spacing interval progression.
- **CSV & Lead Parsing (`packages/shared/src/utils/csvParser.test.ts`)**:
  - RFC 5322 syntax validation.
  - Header and headerless CSV detection.
  - Duplicate and invalid lead handling.
- **Schedule Calculations (`packages/shared/src/utils/scheduleCalculator.test.ts`)**:
  - Arithmetic progression `startAt + i * delayBetweenEmailsMs`.
  - BullMQ delay calculations relative to `now`.
- **Backend API Integration (`apps/backend/src/tests/`)**:
  - Health & readiness probes (`/api/health`, `/api/health/ready`).
  - Auth protection on `/api/emails/schedule`, `/api/emails/scheduled`, `/api/emails/sent`.
  - OAuth logout and session invalidation.

---

## 10. Production Deployment Architecture

### Frontend on Vercel
The React SPA is deployed on Vercel using `vercel.json` for client-side routing rewrites:
```json
{
  "framework": "vite",
  "buildCommand": "pnpm --filter @inboxpilot/shared build && pnpm --filter @inboxpilot/frontend build",
  "outputDirectory": "apps/frontend/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Backend & BullMQ Worker (Persistent Hosting)
> **Critical Architectural Constraint**: The BullMQ Worker **CANNOT** run on serverless platforms (e.g. Vercel Serverless, AWS Lambda). BullMQ workers require persistent process execution, continuous Redis socket connections, and atomic Redis Lua locks.
- **Recommended Providers**: Render, Railway, AWS ECS, or Fly.io.
- **Persistent Managed Services**:
  1. **PostgreSQL**: Managed PostgreSQL instance (Supabase, Neon, AWS RDS).
  2. **Redis**: Persistent Redis with AOF enabled (Upstash Redis or Redis Cloud).
  3. **Backend Service**: Long-running container (`pnpm start` in `apps/backend`).
  4. **Worker Service**: Long-running worker container (`pnpm start` in `apps/worker`).

---

## 11. Engineering Trade-offs & Realities

1. **The SMTP Delivery Ambiguity Window**:
   - It is physically impossible to execute an SMTP network delivery and a PostgreSQL database commit in a single distributed transaction.
   - If Ethereal accepts an email (SMTP 250 OK) but the worker container is killed before the database update completes, the `delivery_attempts` table records `startedAt` and `attemptNumber`. Upon recovery, the worker inspects provider message IDs to resolve ambiguity.
2. **Ethereal Email vs. Production Mailboxes**:
   - Ethereal SMTP is an ephemeral test relay. It accepts emails and generates preview links, but does NOT perform mailbox MX routing. Preview URLs in the UI allow hiring evaluators to inspect exact message formatting without spamming external mailboxes.
3. **Fail-Safe vs. Fail-Open Rate Limiting**:
   - In hobbyist platforms, Redis errors are often caught and ignored (fail-open) to avoid stuck queues. In InboxPilot, we enforce a strict **fail-safe** policy: if Redis is unavailable, dispatches are postponed rather than sent unchecked, preserving domain reputation and sender quotas.
