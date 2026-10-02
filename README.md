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
- **Hospital page:** new ambulance requests are read aloud, and "Bed allotted" is spoken when the hospital accepts (default Hindi; change it in the language picker).

Setup:

1. Copy `.env.example` to `.env.local` and set `SARVAM_API_KEY`. The key stays on the server.
2. Restart `npm run dev`.

Notes:

- The microphone only works on `localhost` or over HTTPS. For phones on the same Wi-Fi, use `npx next dev --experimental-https` or a deployed HTTPS URL.
- Voice only holds a bed after an explicit spoken "yes" to the hospital it just read back (or a tap); anything unclear holds nothing. Accepting or rejecting a patient is never done by voice.
- No audio or transcripts are stored. The assistant is told not to keep patient names.
- Without a key, voice controls show "not set up" and the rest of the app works as before.

Code: `lib/voice/` (Sarvam client, parsing, phrases, recorder, player), `app/api/voice/` (routes), `components/voice/` (UI).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
