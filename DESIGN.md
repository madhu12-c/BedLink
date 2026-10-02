# BedLink — Design System

## Product

BedLink is a real-time emergency hospital bed coordination platform.

It connects:

1. Ambulance / dispatch teams
2. Hospitals
3. Emergency patients

The system helps dispatchers find hospitals with the correct available
resources instead of simply finding the nearest hospital.

---

# Design Principles

## 1. Emergency-first

Every important action must be understandable within seconds.

Avoid:

- unnecessary animations
- decorative UI
- excessive modals
- complicated forms
- tiny buttons

Prioritize:

- large touch targets
- strong hierarchy
- clear status
- immediate feedback

---

## 2. Mobile-first

The hospital nurse workflow must work comfortably on a cheap Android phone.

Minimum target:

360px wide viewport.

Touch targets:

minimum 44x44px.

Primary bed update actions should be possible with one tap.

---

# Visual Direction

Style:

Professional healthcare operations dashboard.

Avoid:

- futuristic neon UI
- excessive gradients
- glassmorphism
- gaming aesthetics
- excessive rounded cards
- decorative 3D elements

Use:

- white / very light background
- dark navy text
- emergency red only for urgent states
- green for available
- amber for warning
- blue for active/information

---

# Color Tokens

Background:

#F8FAFC

Surface:

#FFFFFF

Primary:

#0F172A

Primary action:

#2563EB

Success:

#16A34A

Warning:

#D97706

Danger:

#DC2626

Muted:

#64748B

Border:

#E2E8F0

---

# Typography

Use Inter or Geist.

Headings:

bold / semibold

Body:

14–16px

Emergency information:

18–24px

Critical numbers:

28–40px

---

# Status Colors

Available:

green

Limited:

amber

Unavailable:

red

Stale:

gray

Emergency:

red

Reserved:

blue

---

# Freshness Indicator

Every hospital listing must display:

"Updated 2 min ago"

or:

"Updated 18 min ago"

or:

"Stale · 47 min ago"

Never hide data freshness.

Freshness states:

0–5 min:

Fresh

5–15 min:

Recent

15–30 min:

Aging

30+ min:

Stale

---

# Hospital Result Card

Each result should contain:

Hospital name

Distance

ETA

Bed match

Required specialty

Current hospital load

Data freshness

Availability

Reserve button

Example:

------------------------------------------------

CityCare Hospital

2.8 km · 9 min

ICU ✓
Ventilator ✓
Oxygen ✓

Hospital load
68%

Updated 2 min ago

[ HOLD BED ]

------------------------------------------------

---

# Emergency Mode

When patient is critical:

Use a clear emergency banner.

Example:

CRITICAL PATIENT

ICU + Ventilator required

Do not use flashing animations.

---

# Nurse Bed Update Screen

The nurse interface must be extremely simple.

Example:

Hospital

GoodCare Hospital

Last updated:
1 minute ago

--------------------------------

ICU

[-]  12  [+]

Available beds

--------------------------------

Ventilator

[-]  6  [+]

Available beds

--------------------------------

Oxygen

[-]  18  [+]

Available beds

--------------------------------

Cardiac

[-]  2  [+]

Available beds

--------------------------------

[ UPDATE ALL ]

The preferred interaction is a single tap.

---

# Navigation

Desktop:

Sidebar

Mobile:

Bottom navigation

Main navigation:

Dispatch
Hospitals
Active Routes
History

Hospital role:

Beds
Requests
History

---

# Accessibility

WCAG AA target.

Must support:

keyboard navigation

screen readers

visible focus states

sufficient color contrast

ARIA labels

large touch targets

Never communicate status using color alone.

---

# Responsive Breakpoints

Mobile:

< 640px

Tablet:

640–1024px

Desktop:

> 1024px

The desktop layout must not simply be a stretched mobile layout.

---

# Animation

Use subtle transitions only.

200ms maximum for normal interactions.

Emergency workflows should not depend on animation.