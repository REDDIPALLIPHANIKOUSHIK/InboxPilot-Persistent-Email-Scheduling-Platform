# InboxPilot — 5-Minute Technical Demonstration Script

> **Note**: This is the natural speaker script for presenting the ReachInbox Full-Stack Email Job Scheduler hiring assignment. Total duration: 5 minutes.

---

### [0:00 – 0:30] Introduction & Architecture Overview
* **Visual**: Show browser tab with architecture diagram (`docs/architecture.md`) or terminal running Docker Compose services.
* **Speaker Script**:
  > "Hello everyone! Today I'm presenting **InboxPilot**, a persistent, distributed email scheduling platform built for ReachInbox.
  >
  > Unlike typical projects that use basic node-cron polling or in-memory arrays, InboxPilot is built on a distributed production architecture:
  > - An Express and TypeScript backend utilizing Prisma with PostgreSQL for ACID persistence.
  > - Redis-backed BullMQ delayed jobs to handle millions of scheduled dispatches without memory leaks.
  > - Dedicated worker processes enforcing distributed sliding-window hourly rate limits and per-sender minimum send spacing via atomic Redis Lua scripts.
  > - Real Ethereal SMTP integration with delivery receipts, and a modern React dashboard adhering to ReachInbox design standards."

---

### [0:30 – 1:15] Google OAuth 2.0 & Dashboard Walkthrough
* **Visual**: Navigate to `http://localhost:5173/login`. Click **"Continue with Google"**. Land on the Dashboard.
* **Speaker Script**:
  > "Let's begin with authentication. InboxPilot implements real Google OAuth 2.0 with HTTP-only cookies and state validation.
  >
  > I'll click 'Continue with Google'. We complete the OAuth handshake, exchange tokens on the backend, and our session is stored in a secure HTTP-only cookie.
  >
  > Here in our dashboard, you can see our authenticated user profile with avatar and email, real-time KPI cards tracking Scheduled, Sent, and Failed deliveries, and our two primary views: 'Scheduled Emails' and 'Sent Emails'."

---

### [1:15 – 2:00] Lead Ingestion (CSV / Text) & Campaign Configuration
* **Visual**: Click **"Compose Email"** button. Drag & drop a CSV file (`sample-leads.csv`) or paste mixed text with headers, duplicates, and invalid addresses.
* **Speaker Script**:
  > "Now, let's click 'Compose Email' to open our scheduler modal.
  >
  > I'll drag in our CSV lead list. Notice how our client-side parser instantly inspects the file. It automatically detects email columns even when headers are mixed, filters out syntactically invalid addresses, removes duplicates, and presents clean validation chips.
  >
  > In our form, we configure:
  > - Our Sender Identity (with sender hourly limits).
  > - Subject and body.
  > - Start Time: we'll set it to 1 minute from now.
  > - Delay between emails: 3 seconds.
  > - Hourly limit: 200 per hour.
  >
  > Notice the dynamic pre-flight banner below that summarizes the exact scheduling horizon and estimated completion time."

---

### [2:00 – 2:45] Scheduling & The BullMQ Delayed Queue
* **Visual**: Click **"Schedule Emails"**. Modal closes, success toast appears, and the **Scheduled Emails** table populates.
* **Speaker Script**:
  > "I'll click 'Schedule'. In a single database transaction, the campaign and individual email records are inserted into PostgreSQL with status `scheduled`.
  >
  > Simultaneously, individual BullMQ delayed jobs are enqueued in bulk into Redis with stable IDs tied directly to our database email IDs: `email:${id}`.
  >
  > Look at our 'Scheduled Emails' table. We can see each recipient, their calculated delivery timestamp, and their active status. If a user needs to cancel a dispatch, they can safely click 'Cancel', which atomically updates the database and deletes the pending job from BullMQ."

---

### [2:45 – 3:30] SMTP Submission & Sent Emails Auditing
* **Visual**: Wait until the scheduled timestamp matures. Show worker terminal logs outputting Ethereal preview URLs. Switch to the **"Sent Emails"** tab. Click an Ethereal preview link.
* **Speaker Script**:
  > "As our scheduled timestamp arrives, our BullMQ worker picks up the job.
  >
  > In the terminal, you can see the worker executing: it runs our rate-limit and spacing checks, establishes connection to Ethereal SMTP, transmits the message, and outputs the official Ethereal preview URL.
  >
  > Let's switch to our 'Sent Emails' tab. Here are our delivered emails with exact sent timestamps.
  >
  > Clicking 'Preview' opens Ethereal's web viewer in our browser, showing the rendered email, headers, and provider message ID. Clicking 'Details' reveals our delivery attempt audit log with timestamps and retry counters."

---

### [3:30 – 4:30] Crash Recovery & Worker Restart Resilience
* **Visual**: In terminal, kill the worker process (`Ctrl + C`). In UI, schedule 5 emails for 1 minute in the future. Show that jobs exist. Restart the worker (`pnpm dev:worker`).
* **Speaker Script**:
  > "Now let's demonstrate crash recovery and restart resilience—a critical requirement.
  >
  > I'm going to terminate the running worker process completely by killing the terminal. The worker is dead.
  >
  > Now, I'll schedule 5 new emails set to send in 1 minute. The API persists them in PostgreSQL and pushes the delayed jobs into Redis with AOF persistence.
  >
  > Even with the worker down, our jobs are safely held in Redis delayed sorted sets. Now, I restart the worker with `pnpm dev:worker`.
  >
  > Notice: not a single job was lost. The worker starts, reads the delayed set, waits for the scheduled timestamps, and processes each email in sequence without duplicate dispatches."

---

### [4:30 – 5:00] Distributed Rate Limiting & Send Spacing
* **Visual**: Show a sender reaching their configured hourly limit. Show worker logs indicating: `[RATE-LIMIT] Sender reached limit. Rescheduled job by X ms`.
* **Speaker Script**:
  > "Finally, let's look at distributed rate limiting and minimum send spacing.
  >
  > When multiple worker instances run concurrently with concurrency set to 5, our atomic Redis Lua scripts ensure that two jobs from the same sender can never send closer together than `MIN_SEND_INTERVAL_MS`.
  >
  > And if a sender reaches their hourly quota, the worker does NOT drop or fail the job. Instead, the Lua script computes the exact remaining time in the rolling 1-hour window, reschedules the job in BullMQ to the next window, and updates `email.scheduledAt` in PostgreSQL.
  >
  > That completes the demonstration of InboxPilot. Thank you!"
