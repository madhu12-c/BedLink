# BedLink Architecture

## Frontend

Next.js App Router

React

TypeScript

Tailwind CSS

shadcn/ui

---

## Backend

Supabase

PostgreSQL

Supabase Auth

Supabase Realtime

Row Level Security

Edge Functions where appropriate.

---

# Architecture

Browser

↓

Next.js

↓

Server Actions / Route Handlers

↓

Supabase

↓

PostgreSQL

---

# Realtime Flow

Hospital nurse updates bed count.

↓

Supabase database update

↓

Realtime event

↓

Dispatcher dashboard receives update

↓

Hospital result card updates

↓

Freshness timestamp updates

---

# Reservation Flow

Dispatcher selects hospital.

↓

Create reservation

status = pending

expires_at = now + 2 minutes

↓

Realtime event

↓

Hospital receives request

↓

Hospital accepts

↓

Reservation becomes accepted

↓

Bed count is atomically decremented / held

OR

Hospital rejects

↓

Reservation becomes rejected

↓

Ranking engine selects next candidate

---

# Automatic Timeout

A reservation expires after 2 minutes.

Do not rely only on the browser timer.

The backend/database must determine expiration.

The UI timer is only a visual countdown.

---

# Concurrency

Bed reservation must be atomic.

Two dispatchers must not reserve the same final bed.

Use PostgreSQL transactions / RPC functions.

---

# Security

All hospital bed updates require authenticated
hospital users.

Dispatchers can create emergency requests.

Hospitals can only manage their own hospital data.

---

# Location

Hospital records store:

latitude

longitude

address

Travel time should be calculated through a routing provider.

For the hackathon demo, use mock ETA or a routing API abstraction.

Never hardcode ETA into UI components.