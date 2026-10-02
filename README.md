# BedLink

**Find the nearest hospital with the right free bed, hold it for the ambulance, and move on to the next hospital automatically if the first one says no.**

Built for **Techforge 2026 (Healthtech track)**. Mumbai pilot data: 19 real hospitals.

> An ambulance crew with a critical patient needs the nearest hospital that has the right bed (ICU, ventilator, oxygen, or a specialty such as cardiac or burns) right now. Build BedLink with three parts: a 10-second bed-update screen for hospital nurses (one tap per bed type, works on a cheap phone); a dispatch screen that takes the patient's needs and ranks hospitals by bed match, estimated travel time, data freshness and current load; and a reservation step where the chosen hospital accepts or rejects within 2 minutes, the bed is held for the ambulance, and the next-best hospital is offered automatically on rejection or timeout. Every listing shows how many minutes old its data is.
>
> *(Problem statement)*

---

## How BedLink answers the brief

| The brief asks for | BedLink |
| --- | --- |
| The right bed: ICU, ventilator, oxygen, cardiac, burns | All five bed types, plus specialties (cardiac, burns, trauma, neuro, pediatric) |
| **10-second nurse screen**, one tap per bed type, cheap phone | "Free beds right now": every bed type on one phone screen with big − / + buttons and "Saved in 0.3 s" after each tap. One tap on "All counts still correct" when nothing changed. Or update from **Telegram** by text or voice note. |
| **Dispatch ranking** by bed match, travel time, freshness, load | Ranks by bed match 40 % · drive time 25 % (real road routes) · data freshness 15 % · hospital load 10 % · reliability 10 %. Each card explains its score. |
| Hospital **accepts or rejects within 2 minutes** | A request with a big countdown on the hospital screen (and on Telegram, with Accept / Reject buttons) |
| **Bed is held** for the ambulance | One atomic database update (`available_beds - 1 WHERE available_beds > 0`): two ambulances can never get the same last bed. `npm run race-test` proves it with 20 at once. |
| **Next-best offered automatically** on reject or timeout | The 2-minute clock runs in the database every 10 seconds (pg_cron); the dispatcher's screen then holds the next-best hospital by itself and shows every step on a timeline. |
| **Every listing shows how old its data is** | Every hospital card and every bed type shows "Updated 4 min ago", green / amber / red. Old data also lowers the ranking. |

## Beyond the brief

- **Telegram bot for ward staff.** Nurses send "ICU 3, O2 5" or a voice note in Hindi, Marathi or English; counts 30+ minutes old get a "still right?" reminder with a one-tap ✅. Coordinators get ambulance requests with Accept / Reject buttons. Free, no app to install.
- **Voice for the crew.** Describe the patient in any Indian language ("ICU chahiye, ventilator bhi"); BedLink reads back the best match and holds it on a spoken "haan". Status updates are spoken back. (Sarvam AI)
- **"Free on arrival" %.** The chance a bed is still free when the ambulance arrives, from the number of free beds, how old the count is, the drive time, how full the hospital is and how many other ambulances took that bed type there in the last hour.
- **Live ambulance map** on the hospital screen after Accept, moving along the real road with minutes and km left. *(Position is simulated from the route and expected arrival until the crew's phone shares GPS.)*
- **Sealed vitals handover.** The crew sends vitals before arrival; the sheet is sealed with a SHA-256 code made from its content, and the hospital can check nothing changed on the way.
- **Hospital reliability and diversion.** Reliability drops on reject (−2), timeout (−5) or a lost bed (−15) and rises on arrival (+1). Hospitals can set Open / Busy / Diversion; hospitals on diversion are skipped.
- **"Patient can't pay".** Government hospitals (free) and charitable trust hospitals (10 % of beds free for poor patients by Maharashtra law) come first.
- **Mass casualty mode.** Many patients from one place are spread across hospitals, most serious first, at most N per hospital, so no single emergency room is flooded; one tap holds every bed.
- **Quick messages** between crew and hospital, **sunlight mode** for outdoor phones, and a stabilise-first suggestion when no hospital has everything.

**Privacy:** no patient names, ages or sex are stored or sent. A patient is a case number.

## Screens and roles

| Role | Screen | Can do |
| --- | --- | --- |
| Dispatcher / ambulance crew | `/` | Enter patient needs (form or voice), see ranked hospitals and the map, hold a bed, send vitals, mass casualty |
| Ward nurse | `/hospital` | Update free beds (one tap per type), confirm counts, see incoming requests (read-only), connect Telegram |
| Hospital coordinator | `/hospital` | Accept / reject requests, see ambulances coming on the map, mark arrivals or "bed lost", set Open / Busy / Diversion, add beds |
| Admin | everything | Switch hospital, preview nurse and coordinator screens, run the one-click demo, audit trail at `/history` |

Roles are enforced three times: in `proxy.ts` (pages and APIs), in every API route, and in the database (row-level security). A user's role and hospital live in Supabase Auth `app_metadata`, which only the server can change.

## How it works

```
 Nurse / Coordinator (phone or Telegram)          Dispatcher / ambulance crew
            │  bed counts, accept/reject                 │  patient needs, hold
            ▼                                            ▼
   ┌──────────────────────── Supabase (Postgres) ────────────────────────┐
   │  hold_bed()  atomic hold          tick_holds()  2-min clock (pg_cron) │
   │  adjust_bed_count()  set_ed_status()  cancel_hold()  RLS by role      │
   │  Realtime: every change reaches every open screen in about a second   │
   └──────────────────────────────────────────────────────────────────────┘
            ▲                                            ▲
     Telegram bot (webhook)                    OSRM road routes · Sarvam AI voice
```

- **Next.js 16** (App Router, React 19, Turbopack), **Tailwind CSS 4**, **Leaflet** + OpenStreetMap.
- **Supabase**: Postgres is the single source of truth; database functions do every write that must not race; Realtime pushes changes to all screens.
- **Routing**: real road distance and drive time from OSRM, saved per ambulance location so the list doesn't reshuffle on every bed update.
- **Voice**: Sarvam AI speech-to-text, translation and text-to-speech (server-side key).
- **Telegram**: Bot API via a webhook (deployed) or long polling (local); requests are checked with a shared secret, and chats are linked to a hospital with a signed link from the hospital screen.

## Getting started

### 1. Install

```bash
npm install
cp .env.example .env.local   # then fill it in
```

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Live data across devices (without them BedLink runs in single-browser demo mode) |
| `SUPABASE_SERVICE_ROLE_KEY` | Creating demo accounts and the Telegram bot (server only) |
| `DEMO_USER_PASSWORD` | Password for the demo accounts (8+ characters) |
| `SARVAM_API_KEY` | Voice (optional) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Telegram bot (optional; create the bot with @BotFather) |

Server-only keys must never start with `NEXT_PUBLIC_` and must never be committed.

### 2. Database (Supabase SQL editor, in this order)

1. `supabase/migrations/20261002000000_bedlink_schema.sql`: tables
2. `supabase/seed.sql`: the first 5 hospitals (**clears existing data**)
3. `supabase/setup_and_seed.sql`: bed history and handover tables
4. `supabase/migrations/20261002130000_role_based_access.sql`: row-level security (re-run it whenever step 3 is run)
5. `supabase/migrations/20261002140000_add_procedures_performed.sql`
6. `supabase/migrations/20261003000000_spec_features.sql`: atomic hold, server clock, reliability, diversion
7. `supabase/migrations/20261003000100_more_mumbai_hospitals.sql`: 14 more hospitals (19 in total)
8. `supabase/migrations/20261003000200_free_care.sql`: government and charity hospitals
9. `supabase/migrations/20261003000300_telegram_bot.sql`: Telegram chat links

Steps 5 to 9 only add things and are safe to run again. Step 6 needs the **pg_cron** extension for the server-side clock (Database → Extensions); without it, open screens run the clock instead. In Authentication → Providers, turn off "Allow new users to sign up" so only accounts you create can sign in.

### 3. Accounts and run

```bash
npm run seed:users   # admin, dispatcher, and a nurse + coordinator per hospital (lib/auth/demo-users.json)
npm run dev          # http://localhost:3000
```

Sign in as e.g. `dispatcher@bedlink.test`, `coordinator.aditi@bedlink.test` or `nurse.aditi@bedlink.test` with `DEMO_USER_PASSWORD`. The microphone needs `localhost` or HTTPS; for phones on the same Wi-Fi use `npx next dev --experimental-https`.

### 4. Telegram bot (optional)

1. Create a bot with **@BotFather**; put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in `.env.local`.
2. Local: run `npm run telegram` next to `npm run dev` (no public URL needed).
   Deployed: `npm run telegram:webhook -- https://your-app.example.com`, and have a cron job POST to `/api/telegram/nudge` every minute with the header `X-BedLink-Cron` (the webhook secret) for "still right?" reminders.
3. On the hospital screen tap **Connect Telegram**, then **Start** in Telegram.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run seed:users` | Create or reset the demo accounts |
| `npm run race-test` | 20 ambulances try to hold the same last bed at once; exactly one must win (uses the live database, cleans up after) |
| `npm run telegram` | Run the Telegram bot locally |
| `npm run telegram:webhook -- <url>` | Point the Telegram bot at a deployed app |

## Demo in 3 minutes (3 phones)

1. **Nurse** (`nurse.aditi@…`): tap + on ICU; the dispatcher's list updates within a second and the card says "Updated just now".
2. **Dispatcher**: pick ICU + ventilator, see the ranked list with drive times, data age and "free on arrival"; tap **Hold bed (2 min)**.
3. **Coordinator** (`coordinator.aditi@…`): the request appears with a countdown; **Reject**, and the dispatcher's screen moves to the next-best hospital by itself. Let the next one time out; it moves on again.
4. Accept the third; the hospital watches the ambulance on the map, and the crew's sealed vitals arrive. **Verify Seal** shows the sheet was not changed.
5. Run `npm run race-test`: 20 holds on one last bed, exactly 1 winner.

Admins also have a one-click **Run demo** on the dispatch screen.

## Known limits

- The ambulance position on the hospital map is simulated from the route and expected arrival; real crew GPS is the next step.
- After a reject or timeout, the next hospital is offered by the dispatcher's open screen (the database still expires the hold on time if that screen is closed).
- Hospital locations, bed counts and free-care status are demo data based on public information; only 10 hospitals have free-care status set.
- Telegram connect links do not expire; share them only with hospital staff.

## Project layout

```
app/                 pages (/, /hospital, /history, /login) and API routes (beds, reservations, voice, telegram)
components/          dispatch, hospital, handover, voice, shared UI
lib/data/store.ts    in-browser data store kept in sync with Supabase
lib/dispatch/        ranking, "free on arrival", mass casualty planner
lib/supabase/        browser sync, server and admin clients
lib/telegram/        Telegram bot (messages, buttons, reminders)
lib/voice/           Sarvam AI client and voice intake
lib/routing/         OSRM road routes
supabase/            schema, seed data and migrations
scripts/             demo accounts, race test, Telegram runner
```
