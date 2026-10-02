# BedLink

## Problem

Ambulance crews often need to find a hospital that has the correct
resource immediately.

The nearest hospital may not have:

- ICU beds
- ventilators
- oxygen-supported beds
- cardiac facilities
- burn facilities

BedLink coordinates this information in real time.

---

# Core Users

## Dispatcher

Creates an emergency request.

Inputs:

- patient location
- required bed type
- specialty
- urgency

Receives ranked hospitals.

---

## Hospital Nurse

Updates hospital bed availability.

The workflow must take approximately 10 seconds.

---

## Hospital Coordinator

Receives incoming reservation requests.

Can:

Accept

Reject

Allow timeout

---

# Core Workflow

Dispatcher

↓

Enter patient requirements

↓

Get hospital candidates

↓

Ranking engine

↓

Select hospital

↓

Reservation request

↓

Hospital receives request

↓

2-minute countdown

↓

Accept / Reject

↓

If accepted:

Bed held

Ambulance receives confirmation

↓

If rejected or timeout:

Automatically offer next hospital

---

# Required Features

## Bed updates

Support:

ICU

Ventilator

Oxygen

Cardiac

Burns

General Emergency

Allow hospital-specific specialty capabilities.

---

## Dispatch

Dispatcher can specify:

patient location

required bed

specialty

urgency

optional notes

---

## Hospital ranking

Rank based on:

bed match

travel time

data freshness

hospital load

---

## Reservation

Reservation state:

pending

accepted

rejected

expired

cancelled

completed

---

# Important Rule

Never claim that a hospital has an available bed without checking
the most recent availability record.

Every availability record must contain updated_at.

---

# Demo Mode

The application should include seeded demo hospitals.

Example hospitals:

CityCare Hospital

Metro General Hospital

Lifeline Medical Center

St. Mary Emergency Hospital

Apollo-style demo hospital

These are fictional demo records.

Do not represent them as real hospital availability.