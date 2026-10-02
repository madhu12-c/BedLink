# BedLink UX

# Flow 1 — Nurse

Login

↓

Hospital Bed Dashboard

↓

See current inventory

↓

Tap bed type

↓

Increase/decrease availability

↓

Save

↓

"Updated just now"

Total interaction target:

10 seconds.

---

# Flow 2 — Dispatcher

Open Dispatch

↓

Patient location

Use current ambulance location

OR

Select location on map

↓

Select:

ICU

Ventilator

Oxygen

Specialty

↓

Select urgency

↓

Search hospitals

↓

Results appear immediately

↓

Map + ranked cards

↓

Select hospital

↓

Hold Bed

↓

2-minute confirmation state

---

# Flow 3 — Hospital

Incoming request

--------------------------------

CRITICAL REQUEST

ICU + Ventilator

ETA:

8 minutes

Patient:

Emergency #BK-1024

Respond within:

01:42

[ ACCEPT & HOLD ]

[ REJECT ]

--------------------------------

---

# Flow 4 — Timeout

Timer:

00:00

↓

Reservation automatically expires

↓

Next hospital becomes active

↓

Hospital receives request

↓

Dispatcher sees:

"Previous hospital did not confirm.
Request sent to next available hospital."

---

# Dispatcher Result Ranking

Every result displays:

Rank

Hospital

Bed match

ETA

Freshness

Load

Reservation status

---

# Example

1

CityCare

ICU ✓

Ventilator ✓

ETA 7 min

Updated 2 min ago

Load 64%

[ HOLD ]

---

2

Metro General

ICU ✓

Ventilator ✓

ETA 11 min

Updated 1 min ago

Load 72%

[ HOLD ]

---

# No Availability

If no hospital satisfies all requirements:

Display:

"No exact match found"

Then show:

Closest partial matches

Clearly identify missing resources.

Never pretend partial match is a full match.