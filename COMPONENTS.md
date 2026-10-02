# Components

## BedUpdateGrid

Purpose:

Fast hospital inventory update.

Props:

hospitalId

bedInventory

onUpdate

---

## BedTypeCard

Displays:

bed type

available count

total count

last updated

increment

decrement

---

## FreshnessIndicator

Input:

updatedAt

Output:

Fresh

2 min ago

18 min ago

Stale

---

## PatientNeedForm

Fields:

location

bed type

specialty

urgency

notes

---

## HospitalResultCard

Displays:

hospital

distance

ETA

bed availability

specialty

load

freshness

ranking

---

## HospitalMap

Displays:

patient location

hospital markers

selected hospital

route

---

## ReservationTimer

Displays:

2:00

1:59

...

0:00

The timer is visual only.

Backend expiration is authoritative.

---

## ReservationDialog

Displays:

hospital

required resource

ETA

freshness

current availability

confirmation action

---

## LoadIndicator

Example:

64%

Normal

85%

High

95%

Critical

---

## StatusBadge

Available

Reserved

Pending

Expired

Stale
