This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Voice assistant (Sarvam AI)

BedLink has a multilingual voice assistant built on [Sarvam AI](https://docs.sarvam.ai):

- **Dispatch screen:** tap "Tap and speak" and describe the patient in any Indian language or English. BedLink shows what it understood, reads back the best hospital match and asks "hold this bed?". Saying "haan" / "hoy" / "yes" holds that exact hospital; "nahin" / "nako" / "no" holds nothing. A "Hold bed at …" button does the same with a tap.
- **Dispatch screen:** request status (sent, accepted, rejected, timed out) is spoken to the crew in their language. A confirmation that arrives while the crew is on another page is announced when they come back.
- **Hospital page:** new ambulance requests are read aloud to the coordinator, and "Bed allotted" is spoken when the hospital accepts (default Hindi; change it in the language picker).

Setup:

1. Copy `.env.example` to `.env.local` and set `SARVAM_API_KEY`. The key stays on the server.
2. Restart `npm run dev`.

Notes:

- The microphone only works on `localhost` or over HTTPS. For phones on the same Wi-Fi, use `npx next dev --experimental-https` or a deployed HTTPS URL.
- Voice only holds a bed after an explicit spoken "yes" to the hospital it just read back (or a tap); anything unclear holds nothing. Accepting or rejecting a patient is never done by voice.
- No audio or transcripts are stored. The assistant is told not to keep patient names.
- Without a key, voice controls show "not set up" and the rest of the app works as before.

Code: `lib/voice/` (Sarvam client, parsing, phrases, recorder, player), `app/api/voice/` (routes), `components/voice/` (UI).

## Login and roles

When Supabase is configured, everyone signs in at `/login` and only sees the screens for their role:

| Role | Lands on | Can open | Can do |
| --- | --- | --- | --- |
| Dispatcher | `/` | Dispatch, EMS Analytics | Find hospitals, hold beds (incl. by voice) |
| Ward Nurse | `/hospital` | Their own hospital only | Update free bed counts; sees incoming requests (read-only). No accept/reject |
| Hospital Coordinator | `/hospital` | Their own hospital only | Accept/reject requests, mark arrivals, add beds, see bed history |
| Admin | `/` | Everything, incl. Audit Trail | Everything; can switch hospital and preview the nurse or coordinator screen |

The same rules are enforced in three places: `proxy.ts` (pages and API redirects), each API route (`requireApiUser`), and the database (row-level security). A user's role and hospital live in Supabase Auth `app_metadata`, which only the service role can change.

Setup (once per Supabase project):

1. In the Supabase SQL editor, run `supabase/migrations/20261002130000_role_based_access.sql` (after the schema and `setup_and_seed.sql`). It turns row-level security on and removes the old open demo policies. `setup_and_seed.sql` turns it off again, so re-run this file whenever that one is run.
2. Add to `.env.local`: `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API keys) and `DEMO_USER_PASSWORD` (8+ characters). Never commit these and never prefix them with `NEXT_PUBLIC_`.
3. Run `npm run seed:users`. It creates the accounts in `lib/auth/demo-users.json`: `admin@bedlink.test`, `dispatcher@bedlink.test`, and a `nurse.<hospital>@bedlink.test` and `coordinator.<hospital>@bedlink.test` for each of the 5 hospitals (aditi, lifeline, dna, apex, shatabdi). All use `DEMO_USER_PASSWORD`. Run it again any time to reset them.
4. In Supabase → Authentication → Sign In / Providers, turn off "Allow new users to sign up", so only accounts you create can sign in.
5. Restart `npm run dev`.

To add a real person, add them to `lib/auth/demo-users.json` (email, name, role, hospitalId) and run `npm run seed:users`, or set `role` / `hospital_id` in their `app_metadata` from the Supabase dashboard. Role changes apply on their next sign-in.

Without Supabase configured, there is no login: the app runs in demo mode with every screen open, as before.

Code: `proxy.ts`, `lib/auth/` (roles, session), `components/auth/` (login form, auth context), `app/login/`, `scripts/create-demo-users.mjs`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
