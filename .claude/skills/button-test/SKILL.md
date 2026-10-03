---
name: button-test
description: Click every button in BedLink in a visible Chrome window (dispatcher, nurse, coordinator, admin), run the real hold → accept → arrive → admit and reject → re-route flows, check that bed counts and bed numbers match on every screen and in the database, and report the bugs found. Use when asked to "test every button", "click through the app", "find bugs in the UI" or "check the bed numbers match".
---

# BedLink button test

Drives the running app in **real Chrome** (headed, so the user can watch) with puppeteer-core,
signed in as each role in its own window, and writes a bug report.

## What it does

1. Signs in (demo accounts, password `DEMO_USER_PASSWORD` from `.env.local`, never printed):
   dispatcher (desktop window), Aditi coordinator (desktop), Aditi nurse (phone size), admin.
2. **Sweeps every clickable** on each role's pages (`button`, links, `summary`, `[role=button]`,
   checkboxes, radios): clicks it, waits, records page errors, console errors, failed requests
   (4xx/5xx), and whether anything visibly happened; closes any dialog it opened (testing the
   dialog's own buttons first) and goes back if it navigated.
3. **Beds across devices**: nurse taps a bed number, -1/+1; coordinator adds/removes a bed. After
   each step the nurse screen, coordinator screen, dispatcher card and the database must show the
   same free count, total and red bed numbers.
4. **Hold flow**: dispatcher holds Aditi → coordinator opens Reject, cancels, then Accepts →
   dispatcher's hold bar buttons → coordinator "Bed lost" (first tap only) → Admit → nurse frees
   the bed again (counts end where they started).
5. **Reject flow**: hold Aditi → coordinator rejects with a reason → dispatcher must get the next
   hospital automatically → dispatcher cancels it (two taps).
6. **Admin**: sweeps Dispatch, Hospital, Audit Trail, plays "▶ Run demo", then "Reset Demo Data"
   so the shared demo database is left clean.

Not clicked on purpose (listed as skipped in the report): Sign out, voice recording (needs a real
voice), links that leave the app (phone, maps, Telegram: their link is checked instead), and the
final "Hold all N beds" of a mass casualty (would send many real holds).

## How to run

1. The dev server must be running: `npm run dev` in the BedLink folder (start it in the background
   if `http://localhost:3000/login` doesn't answer).
2. First time only: `npm install` inside `.claude/skills/button-test`.
3. Run (from the BedLink folder):
   ```
   node .claude/skills/button-test/button-test.mjs
   ```
   Options: `--headless` (no window), `--base http://localhost:3000`, `--only sweep|beds|hold|reject|admin`
   (comma-separated), `--sweep dispatcher,coordinator,nurse,admin` (whose screens get every button
   clicked), `--slow 80` (ms between actions, default 60), `--keep-open` (leave Chrome open).
   Don't edit app files while it runs: the dev server reloads the pages under the test.
4. It takes about 5-10 minutes. Holds made during the test send real Telegram messages to any
   chats linked to Aditi or to the dispatcher account.

## Reading the result

The script prints a summary and writes `.claude/skills/button-test/reports/<time>/report.md`
(plus `report.json` and a screenshot per problem). Tell the user, in plain short words:

- **Bugs**: page errors, console errors, failed requests, flow steps that failed, count or bed
  number mismatches between screens / database. Say where (role, page, button) and what happened.
- **Worth a look**: buttons that did nothing visible (may be fine, e.g. Copy).
- Counts: buttons clicked / skipped / disabled per page.

Then offer to fix the bugs. Don't fix anything before the user says so.
