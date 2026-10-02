// BedLink Telegram bot runner.
//
//   npm run telegram                      local: no public URL needed. Long-polls Telegram and
//                                         passes every message to the running app (npm run dev),
//                                         and asks for "still right?" reminders once a minute.
//   npm run telegram:webhook -- <url>     deployed: tells Telegram to call <url>/api/telegram/webhook
//
// Needs TELEGRAM_BOT_TOKEN in .env.local (from @BotFather). Never prints the token.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // no .env.local: use the real environment
  }
}
loadEnvFile('.env.local');

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is missing. Create a bot with @BotFather and add it to .env.local.');
  process.exit(1);
}
// Same secret as lib/telegram/api.ts webhookSecret()
const secret =
  process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
  createHash('sha256').update(`bedlink-webhook:${token}`).digest('hex').slice(0, 48);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function telegram(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

const me = await telegram('getMe');
if (!me.ok) {
  console.error('Telegram did not accept the bot token:', me.description);
  process.exit(1);
}

const [mode = 'poll', target] = process.argv.slice(2);

if (mode === 'webhook') {
  if (!target || !/^https:\/\//.test(target)) {
    console.error('Usage: npm run telegram:webhook -- https://your-app.vercel.app');
    process.exit(1);
  }
  const url = `${target.replace(/\/$/, '')}/api/telegram/webhook`;
  const res = await telegram('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query']
  });
  console.log(res.ok ? `@${me.result.username} now calls ${url}` : `setWebhook failed: ${res.description}`);
  console.log('For "still right?" reminders, have a cron job POST to /api/telegram/nudge every minute');
  console.log('with the header X-BedLink-Cron set to TELEGRAM_WEBHOOK_SECRET.');
  process.exit(res.ok ? 0 : 1);
}

// ── Local polling ──
const appUrl = (process.env.BEDLINK_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

async function forward(path, body, header) {
  const res = await fetch(`${appUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [header]: secret },
    body: JSON.stringify(body)
  });
  if (!res.ok) console.warn(`  ${path} answered ${res.status}`);
  return res;
}

// getUpdates only works while no webhook is set
await telegram('deleteWebhook');
console.log(`@${me.result.username} is running. Messages go to ${appUrl}. Ctrl+C to stop.`);

setInterval(() => {
  forward('/api/telegram/nudge', {}, 'x-bedlink-cron')
    .then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (body.sent) console.log(`  sent ${body.sent} "still right?" reminder(s)`);
    })
    .catch((err) => console.warn('  reminder check failed:', err.message));
}, 60_000);

let offset = 0;
for (;;) {
  try {
    const res = await telegram('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['message', 'callback_query']
    });
    if (!res.ok) {
      console.warn('getUpdates failed:', res.description);
      await sleep(3000);
      continue;
    }
    for (const update of res.result) {
      offset = update.update_id + 1;
      const from = update.message?.from?.first_name ?? update.callback_query?.from?.first_name ?? 'someone';
      const kind = update.callback_query ? 'button' : update.message?.voice ? 'voice note' : 'message';
      console.log(`← ${kind} from ${from}`);
      await forward('/api/telegram/webhook', update, 'x-telegram-bot-api-secret-token').catch((err) =>
        console.warn(`  could not reach ${appUrl} (is npm run dev running?):`, err.message)
      );
    }
  } catch (err) {
    console.warn('Polling error:', err.message);
    await sleep(3000);
  }
}
