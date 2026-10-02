# Coding Rules

## TypeScript

Use strict TypeScript.

Never use:

any

unless absolutely unavoidable.

---

## Components

Prefer small reusable components.

Avoid giant page components.

---

## Server vs Client

Use Server Components by default.

Use "use client" only when required.

Client components are appropriate for:

maps

timers

interactive forms

realtime subscriptions

---

## Supabase

Never expose service-role keys to the browser.

Use:

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

Server-only secrets must never use NEXT_PUBLIC_.

---

## Validation

Validate all user input with Zod.

Never trust client-side validation alone.

---

## Database

Do not directly manipulate sensitive tables from arbitrary clients.

Use RLS.

---

## Error handling

Every async operation must handle:

loading

success

error

empty

---

## UI

Never use alert().

Use toast / inline feedback.

---

## Emergency workflow

Do not silently fail.

Every reservation action must provide visible status.

---

## Performance

Avoid unnecessary polling.

Prefer Supabase Realtime.

---

## Accessibility

Every interactive element needs an accessible label.

---

## Mobile

Test at:

360x800

390x844

412x915

---

## Formatting

Use ESLint.

Use Prettier.

Keep components readable.

---

## No fake data in production logic

Seed data is acceptable for demo mode.

Clearly mark demo data.
