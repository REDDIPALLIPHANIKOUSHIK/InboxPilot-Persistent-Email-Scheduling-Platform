# InboxPilot — System Architecture & Design Specification

InboxPilot is an enterprise-grade, distributed, persistent email scheduling platform engineered for high reliability, strict idempotency, crash resilience, and distributed rate limiting.

---

## 1. High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React + Vite + Tailwind)"]
        UI["React SPA Dashboard"]
        Compose["Compose & Lead Parser Modal"]
    end

    subgraph API["Backend API Service (Express + TypeScript)"]
        AuthRoute["OAuth & Session Controller"]
        EmailRoute["Email & Campaign Controller"]
        ZodValidator["Zod Schema Validator"]
        DBService["Prisma ORM Service"]
    end

    subgraph Storage["Persistent Storage Tier"]
        Postgres[(PostgreSQL Database\nCampaigns, Emails, Attempts)]
        Redis[(Redis Key-Value & BullMQ Queue\nAOF + RDB Persistence)]
    end

    subgraph Workers["Distributed Worker Tier (BullMQ)"]
        Worker1["BullMQ Worker Process 1\nConcurrency: 5"]
        Worker2["BullMQ Worker Process N\nConcurrency: 5"]
        RateLimiter["Distributed Limiter\nRedis Lua Scripts"]
    end

    subgraph SMTP["Email Delivery Tier"]
        Nodemailer["Nodemailer Engine"]
        Ethereal["Ethereal SMTP Server\nTest Delivery & Previews"]
    end

    UI -->|HTTP / HTTPS + Secure Cookies| API
    Compose -->|POST /api/emails/schedule| EmailRoute
    EmailRoute --> ZodValidator
    ZodValidator --> DBService
    DBService -->|ACID Transaction| Postgres
    EmailRoute -->|Bulk Delayed Jobs| Redis

    Redis -.->|Pulls Ready Jobs| Worker1
    Redis -.->|Pulls Ready Jobs| Worker2
    Worker1 <-->|Atomic Lua Checks| RateLimiter
    Worker2 <-->|Atomic Lua Checks| RateLimiter
    RateLimiter <--> Redis
    Worker1 -->|Conditional State Updates| Postgres
    Worker2 -->|Conditional State Updates| Postgres
    Worker1 --> Nodemailer
    Worker2 --> Nodemailer
    Nodemailer -->|SMTP Protocol| Ethereal
```

---

## 2. Scheduling & Execution Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as Marketer / User
    participant Frontend as Frontend Dashboard
    participant API as Express API
    participant DB as PostgreSQL
    participant Redis as BullMQ (Redis)
    participant Worker as BullMQ Worker Process
    participant SMTP as Ethereal SMTP

    User->>Frontend: Uploads CSV & clicks "Schedule 100 Emails"
    Frontend->>Frontend: Validates leads, deduplicates, detects columns
    Frontend->>API: POST /api/emails/schedule (startAt, delayBetweenEmailsMs, hourlyLimit)
    API->>API: Re-validates RFC 5322 syntax & generates idempotency keys
    API->>DB: BEGIN Transaction: INSERT Campaign & INSERT Emails (status='scheduled')
    DB-->>API: COMMIT
    API->>Redis: emailQueue.addBulk([jobs with calculated delayMs & stable job IDs])
    Redis-->>API: Jobs Queued in Delayed Sorted Set
    API-->>Frontend: 201 Created (campaignId, firstScheduledAt, lastScheduledAt)

    Note over Redis,Worker: Time passes until job.scheduledAt arrives...

    Redis->>Worker: Delivers mature job (emailId)
    Worker->>DB: SELECT email WHERE id = emailId
    alt Email status is already 'sent' or 'cancelled'
        Worker-->>Redis: Ack and skip job (Idempotency guarantee)
    else Email status is 'scheduled'
        Worker->>Redis: Lua Script: Check send spacing (MIN_SEND_INTERVAL_MS)
        alt Spacing violation
            Worker->>Redis: Re-delay job by waitMs
        else Spacing OK
            Worker->>Redis: Lua Script: Check & acquire hourly slot (MAX_PER_HOUR)
            alt Hourly limit exceeded
                Worker->>DB: UPDATE email scheduledAt = nextWindowTime
                Worker->>Redis: Re-delay job to next rate-limit window
            else Slot acquired
                Worker->>DB: UPDATE status='processing', attempts=attempts+1
                Worker->>DB: INSERT deliveryAttempt (status='pending')
                Worker->>SMTP: sendMail(from, to, subject, html)
                alt SMTP Success
                    SMTP-->>Worker: 250 Accepted (messageId, previewUrl)
                    Worker->>DB: UPDATE deliveryAttempt (status='success')
                    Worker->>DB: UPDATE email (status='sent', sentAt=NOW)
                    Worker->>DB: UPDATE campaign (sentCount += 1)
                    Worker-->>Redis: Job Completed
                else SMTP Error
                    Worker->>DB: UPDATE deliveryAttempt (status='failed', errorMessage)
                    Worker->>Redis: Release reserved hourly slot
                    alt Retryable error & attempts < 3
                        Worker->>DB: UPDATE status='scheduled'
                        Worker-->>Redis: Re-queue with exponential backoff
                    else Permanent error or attempts >= 3
                        Worker->>DB: UPDATE status='failed', lastError=err.message
                        Worker->>DB: UPDATE campaign (failedCount += 1)
                        Worker-->>Redis: Mark Job Failed
                    end
                end
            end
        end
    end
```

---

## 3. Distributed Rate Limiting & Concurrency Controls

### 3.1 Worker Concurrency (`WORKER_CONCURRENCY`)
`WORKER_CONCURRENCY` defines how many parallel BullMQ jobs a single worker node will pull from Redis concurrently (default: `5`). Concurrency allows the node to saturate non-blocking I/O during network transmissions.

### 3.2 Minimum Send Spacing (`MIN_SEND_INTERVAL_MS`)
Even with high concurrency, sending multiple emails to mail transfer agents (MTAs) from the same sender in the exact same millisecond triggers spam filters.
- **Coordination**: Distributed Redis key `spacing:sender:{senderId}`.
- **Lua Script**:
  ```lua
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local min_interval_ms = tonumber(ARGV[2])

  local last_sent = redis.call('GET', key)
  if last_sent then
    local diff = now - tonumber(last_sent)
    if diff < min_interval_ms then
      return {0, min_interval_ms - diff}
    end
  end
  redis.call('SET', key, now, 'PX', min_interval_ms * 4)
  return {1, 0}
  ```
- **Behavior**: If two workers pull jobs for the same sender within 500ms when `MIN_SEND_INTERVAL_MS=2000`, the second worker is returned `{0, 1500}`. If the wait is `<= 2000ms`, the worker sleeps inline; if longer, it reschedules the job in BullMQ without dropping it.

### 3.3 Distributed Hourly Rate Limiting (`MAX_EMAILS_PER_HOUR_PER_SENDER`)
- **Key**: `ratelimit:hourly:{senderId}` (Redis Sorted Set).
- **Algorithm**: Rolling 3600-second sliding window via Redis Lua script:
  1. `ZREMRANGEBYSCORE key -inf (now - 3600000)` removes sends older than 1 hour.
  2. `ZCARD key` counts sends within the current 1 hour.
  3. If `count < limit`, `ZADD key now emailId` atomically reserves the slot.
  4. If `count >= limit`, the oldest timestamp in the window is read (`ZRANGE key 0 0 WITHSCORES`). The script calculates exact `retryAfterMs = (oldestTimestamp + 3600000) - now`.
  5. The job is rescheduled into BullMQ via `job.moveToDelayed(now + retryAfterMs)` and `email.scheduledAt` is updated in PostgreSQL.

---

## 4. Idempotency & Crash Recovery Mechanics

### 4.1 Unique Idempotency Keys
- **Campaign**: Unique constraint on client idempotency key or generated UUID.
- **Email**: Unique database constraint on `idempotencyKey` (`campaignId:recipientEmail`).
- Prevents double-scheduling even if the frontend triggers multiple retries on flaky Wi-Fi.

### 4.2 Stable BullMQ Job IDs
Every BullMQ job has its ID explicitly assigned as `email:${email.id}`. BullMQ guarantees that Redis cannot hold two jobs with the same ID, preventing duplicate queue insertion.

### 4.3 Safe State Machine
State transitions are strictly one-way:
$$\text{scheduled} \longrightarrow \text{processing} \longrightarrow \begin{cases} \text{sent} & (\text{terminal}) \\ \text{failed} & (\text{terminal}) \\ \text{cancelled} & (\text{terminal}) \end{cases}$$

- If an email is already `sent`, redelivered jobs immediately exit without re-sending.
- If an email was `cancelled`, worker skips dispatch and acknowledges job.

### 4.4 The SMTP Ambiguity Window
No distributed system can atomically commit an SMTP submission and an external PostgreSQL database write in a single two-phase transaction without provider-level two-phase commit:
- If Ethereal accepts the message (250 OK) and the node suffers catastrophic hardware power failure in the 5ms before the DB update completes, the email was physically delivered, but PostgreSQL still records it as `processing`.
- **Mitigation**: Delivery attempts record `startedAt` before transmission. Upon reboot, reconciliation identifies stuck `processing` jobs, checks provider receipts, and avoids blind re-transmissions.
