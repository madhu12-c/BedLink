// BedLink button test (see SKILL.md): clicks every button in Chrome as each role, runs the
// hold / reject flows, checks bed counts and bed numbers on every screen, writes a bug report.
// Reads DEMO_USER_PASSWORD and the Supabase keys from .env.local and never prints them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const BASE = opt('base', 'http://localhost:3000');
const SLOW = Number(opt('slow', '60'));
const ONLY = new Set(opt('only', 'sweep,beds,hold,reject,admin').split(','));
// Whose screens the sweep clicks through (admin's are swept in the admin step)
const SWEEP = new Set(opt('sweep', 'dispatcher,coordinator,nurse,admin').split(','));
const HEADLESS = argv.includes('--headless');

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
if (!env.DEMO_USER_PASSWORD) {
  console.error('DEMO_USER_PASSWORD is missing in .env.local');
  process.exit(1);
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((p) => existsSync(p));
if (!CHROME) {
  console.error('Chrome not found');
  process.exit(1);
}

const ADITI = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(HERE, 'reports', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

// ── Report ──────────────────────────────────────────────────────────────────
const report = { base: BASE, startedAt: new Date().toISOString(), pages: [], flows: [], bugs: [], warnings: [], newTabs: [] };
let shots = 0;
async function bug(page, where, what, detail) {
  const entry = { where, what, detail: detail ?? '' };
  if (page) {
    entry.screenshot = `${String(++shots).padStart(2, '0')}.png`;
    await page.screenshot({ path: join(OUT, entry.screenshot) }).catch(() => {});
  }
  report.bugs.push(entry);
  console.log(`  ✗ BUG  ${where}: ${what}${detail ? `\n         ${detail}` : ''}`);
}
function warn(where, what) {
  report.warnings.push({ where, what });
  console.log(`  ! ${where}: ${what}`);
}
function flowStep(flow, step, ok, detail) {
  report.flows.push({ flow, step, ok, detail: detail ?? '' });
  console.log(`  ${ok ? '✓' : '✗'} [${flow}] ${step}${detail && !ok ? ` (${detail})` : ''}`);
}

// ── Database (read only, service key) ───────────────────────────────────────
async function rest(path) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
    const body = await res.json().catch(() => null);
    return res.ok ? body : { error: body };
  } catch (err) {
    return { error: String(err) };
  }
}

let numbersInDb = true;
async function readDbBeds() {
  let rows = numbersInDb
    ? await rest(`bed_inventory?hospital_id=eq.${ADITI}&bed_type=eq.icu&select=total_beds,available_beds,occupied_beds`)
    : null;
  if (!numbersInDb || rows?.error) {
    numbersInDb = false;
    rows = await rest(`bed_inventory?hospital_id=eq.${ADITI}&bed_type=eq.icu&select=total_beds,available_beds`);
  }
  const r = Array.isArray(rows) ? rows[0] : null;
  return r ? { free: r.available_beds, total: r.total_beds, taken: r.occupied_beds ? [...r.occupied_beds].sort((a, b) => a - b) : null } : null;
}

const holdsSince = (since) =>
  rest(`reservations?select=id,hospital_id,status,request_id,requested_at&requested_at=gte.${since}&order=requested_at.asc`);

// ── Browser ─────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: HEADLESS,
  defaultViewport: null,
  slowMo: SLOW,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1200,950'
  ]
});

// Tabs a click opens (Telegram, maps): note the address, close them
const ourTargets = new Set();
browser.on('targetcreated', async (target) => {
  if (target.type() !== 'page' || !target.opener()) return;
  await sleep(1500);
  report.newTabs.push(target.url());
  const p = await target.page().catch(() => null);
  await p?.close().catch(() => {});
});

const WINDOWS = {
  dispatcher: { left: 0, top: 0, width: 1100, height: 1000 },
  coordinator: { left: 700, top: 0, width: 1100, height: 1000 },
  nurse: { left: 1440, top: 20, width: 470, height: 980 },
  admin: { left: 100, top: 0, width: 1300, height: 1000 }
};

const IGNORE_CONSOLE = [/Failed to load resource/i, /Download the React DevTools/i, /\[Fast Refresh\]/i, /\[HMR\]/i];
const IGNORE_URL = [/favicon/i, /_next\/webpack-hmr/i, /__nextjs/i];
const shortUrl = (u) => u.replace(BASE, '').replace(env.NEXT_PUBLIC_SUPABASE_URL ?? '##', '[supabase]').slice(0, 140);

async function openRole(role, email, phone = false) {
  const context = await browser.createBrowserContext();
  await context.overridePermissions(BASE, ['notifications', 'geolocation', 'clipboard-read', 'clipboard-sanitized-write']).catch(() => {});
  const page = await context.newPage();
  ourTargets.add(page);
  try {
    const session = await page.createCDPSession();
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', { windowId, bounds: WINDOWS[role] });
  } catch {
    // window placement is only cosmetic
  }
  if (phone) await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.setGeolocation({ latitude: 19.2047, longitude: 72.8624 }).catch(() => {});

  const ctx = { role, page, errors: [], requests: 0, step: 'sign in', pageName: '' };
  page.on('pageerror', (e) => ctx.errors.push({ step: ctx.step, kind: 'page error', text: String(e.message).slice(0, 300) }));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!IGNORE_CONSOLE.some((r) => r.test(t))) ctx.errors.push({ step: ctx.step, kind: 'console error', text: t.slice(0, 300) });
  });
  page.on('request', () => ctx.requests++);
  page.on('response', (r) => {
    const s = r.status();
    if (s >= 400 && !IGNORE_URL.some((x) => x.test(r.url()))) {
      ctx.errors.push({ step: ctx.step, kind: `HTTP ${s}`, text: `${r.request().method()} ${shortUrl(r.url())}` });
    }
  });
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? '';
    if (!/ERR_ABORTED/.test(f) && !IGNORE_URL.some((x) => x.test(r.url()))) {
      ctx.errors.push({ step: ctx.step, kind: 'request failed', text: `${shortUrl(r.url())} ${f}` });
    }
  });
  page.on('dialog', async (d) => {
    warn(`${role} › ${ctx.step}`, `browser pop-up: "${d.message().slice(0, 120)}"`);
    await d.dismiss().catch(() => {});
  });

  console.log(`\n▶ Signing in: ${role} (${email})`);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 180000 });
  await page.type('#login-email', email);
  await page.type('#login-password', env.DEMO_USER_PASSWORD);
  await Promise.all([page.waitForNavigation({ timeout: 180000 }), page.click('button[type="submit"]')]);
  await settle(page, 20000);
  const path = new URL(page.url()).pathname;
  if (path.startsWith('/login')) await bug(page, `${role} sign in`, 'still on the login page after signing in', email);
  else console.log(`  signed in → ${path}`);
  return ctx;
}

async function settle(page, max = 4000) {
  await page.waitForNetworkIdle({ idleTime: 700, timeout: max }).catch(() => {});
}

async function goto(ctx, path) {
  ctx.step = `open ${path}`;
  await ctx.page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 180000 }).catch(() => {});
  await settle(ctx.page, 15000);
  await openAllDetails(ctx.page);
}

const openAllDetails = (page) =>
  page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true))).catch(() => {});

// ── In-page helpers (self-contained: they run inside Chrome) ─────────────────
function collect(scopeSel, wantKey) {
  const scope = scopeSel ? document.querySelector(scopeSel) : document;
  if (!scope) return wantKey ? null : [];
  const els = [...scope.querySelectorAll('button, a[href], summary, [role="button"], input[type="checkbox"], input[type="radio"], select')];
  const seen = new Map();
  const out = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0) || st.visibility === 'hidden' || st.display === 'none') continue;
    let label = el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('value') || el.getAttribute('name') || '';
    if (el.tagName === 'INPUT' && !el.getAttribute('aria-label')) {
      const lab = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
      if (lab) label = lab.innerText;
    }
    label = label.replace(/\s+/g, ' ').trim().slice(0, 80) || el.tagName.toLowerCase();
    const tag = el.tagName.toLowerCase() + (el.tagName === 'INPUT' ? `:${el.type}` : '');
    const base = `${tag}|${label.replace(/\d+/g, '#')}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const key = `${base}|${n}`;
    if (wantKey) {
      if (key === wantKey) return el;
      continue;
    }
    out.push({
      key,
      tag,
      label,
      href: el.getAttribute('href'),
      disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      inDialog: !!el.closest('[role="dialog"], [aria-modal="true"], .fixed.inset-0'),
      toggle:
        el.hasAttribute('aria-pressed') ||
        el.hasAttribute('aria-expanded') ||
        el.tagName === 'SUMMARY' ||
        (el.tagName === 'INPUT' && el.type === 'checkbox'),
      radio: el.tagName === 'INPUT' && el.type === 'radio',
      select: el.tagName === 'SELECT'
    });
  }
  return wantKey ? null : out;
}

function signature() {
  // Digits are left out so clocks and countdowns don't count as "something happened"
  const text = document.body.innerText.replace(/\d+/g, '#').replace(/\s+/g, ' ');
  const cls = [...document.querySelectorAll('button')]
    .map((b) => b.className + (b.getAttribute('aria-pressed') ?? '') + (b.getAttribute('aria-expanded') ?? '') + (b.disabled ? 'd' : ''))
    .join('|');
  const det = [...document.querySelectorAll('details')].map((d) => (d.open ? 1 : 0)).join('');
  const inputs = [...document.querySelectorAll('input, select, textarea')]
    .map((i) => (i.type === 'checkbox' || i.type === 'radio' ? i.checked : i.value))
    .join('|');
  const s = text + cls + det + inputs + location.href;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function countDialogs() {
  return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .fixed.inset-0')].filter((d) => {
    const r = d.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(d).display !== 'none';
  }).length;
}

function markTopDialog() {
  document.querySelectorAll('[data-bt-dialog]').forEach((d) => d.removeAttribute('data-bt-dialog'));
  const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .fixed.inset-0')].filter((d) => {
    const r = d.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const top = dialogs[dialogs.length - 1];
  if (top) top.setAttribute('data-bt-dialog', '1');
  return !!top;
}

function clickCloseInTopDialog() {
  const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .fixed.inset-0')].filter((d) => {
    const r = d.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const d = dialogs[dialogs.length - 1];
  if (!d) return false;
  const btn = [...d.querySelectorAll('button')].find((b) => {
    const t = (b.getAttribute('aria-label') || b.innerText || '').trim();
    return /^(close|cancel|done|dismiss|got it|ok|×|✕|back|not now)$/i.test(t) || /close|dismiss/i.test(b.getAttribute('aria-label') || '');
  });
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

// ── Clicking ────────────────────────────────────────────────────────────────
const SKIP = [
  [/sign ?out|signing out/i, 'signs out'],
  [/reset demo/i, 'admin step at the end'],
  [/run demo|demo running/i, 'admin step at the end'],
  [/^hold bed|hold all|^hold \d|beds? now$/i, 'tested in the hold flow'],
  [/accept & secure|reject & pass|confirm rejection|cancel hold|tap again|bed lost|^admit\b/i, 'tested in the hold flow'],
  [/send a test|test ambulance|simulate/i, 'creates a real hold'],
  [/^Bed \d+:/i, 'tested in the beds check'],
  [/one (less|more) free|(add|remove) a seat/i, 'tested in the beds check'],
  [/record|microphone|speak now|hold to talk|start voice|stop recording|🎤|\bmic\b/i, 'needs a real voice']
];
// Inside a dialog these change shared data for real
const DIALOG_SKIP = [[/^(add|save|submit|confirm|hold|create)\b/i, 'changes shared data']];

function skipReason(item, inDialog = false) {
  for (const [re, why] of [...SKIP, ...(inDialog ? DIALOG_SKIP : [])]) if (re.test(item.label)) return why;
  if (item.tag === 'a' && item.href && !item.href.startsWith('/') && !item.href.startsWith('#')) return 'leaves the app';
  return null;
}

function checkLink(ctx, item) {
  const h = item.href ?? '';
  const where = `${ctx.role} › ${ctx.pageName} › ${item.label}`;
  if (h.startsWith('tel:') && !/\d{6,}/.test(h.replace(/\D/g, ''))) warn(where, `phone link has no number: ${h}`);
  if (/^https?:/.test(h)) {
    try {
      new URL(h);
    } catch {
      warn(where, `broken link: ${h}`);
    }
  }
  if (/undefined|null|NaN/.test(h)) warn(where, `link contains undefined/NaN: ${h}`);
}

async function findHandle(page, key, scopeSel = null) {
  const handle = await page.evaluateHandle(collect, scopeSel, key);
  return handle.asElement();
}

async function observe(ctx, act) {
  const page = ctx.page;
  const before = {
    url: page.url(),
    sig: await page.evaluate(signature),
    req: ctx.requests,
    err: ctx.errors.length,
    dialogs: await page.evaluate(countDialogs)
  };
  await act();
  await sleep(700);
  await settle(page, 3000);
  const after = {
    url: page.url(),
    sig: await page.evaluate(signature).catch(() => 0),
    req: ctx.requests,
    dialogs: await page.evaluate(countDialogs).catch(() => 0)
  };
  const errors = ctx.errors.slice(before.err);
  const navigated = after.url !== before.url;
  const effect = navigated || after.sig !== before.sig || after.req > before.req || after.dialogs !== before.dialogs;
  return {
    result: errors.length ? 'error' : effect ? 'ok' : 'no visible effect',
    errors,
    navigated,
    openedDialog: after.dialogs > before.dialogs,
    dialogsBefore: before.dialogs,
    startUrl: before.url
  };
}

async function clickHandle(page, el) {
  try {
    await el.click({ delay: 20 });
  } catch {
    await page.evaluate((e) => e.click(), el).catch(() => {});
  }
}

async function restore(ctx, r) {
  const page = ctx.page;
  if (page.url() !== r.startUrl) {
    await page.goto(r.startUrl, { waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});
    await settle(page, 8000);
    await openAllDetails(page);
    return;
  }
  for (let i = 0; i < 4 && (await page.evaluate(countDialogs)) > r.dialogsBefore; i++) {
    await page.keyboard.press('Escape');
    await sleep(350);
    if ((await page.evaluate(countDialogs)) > r.dialogsBefore) await page.evaluate(clickCloseInTopDialog);
    await sleep(400);
  }
  if ((await page.evaluate(countDialogs)) > r.dialogsBefore) {
    warn(`${ctx.role} › ${ctx.step}`, 'pop-up could not be closed with Esc or a Close/Cancel button');
    await page.goto(r.startUrl, { waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});
    await settle(page, 8000);
    await openAllDetails(page);
  }
}

async function testItem(ctx, item, pageReport, scopeSel = null, depth = 0) {
  const page = ctx.page;
  const where = `${ctx.role} › ${ctx.pageName} › ${item.label}`;
  ctx.step = `${ctx.pageName} › ${item.label}`;
  const el = await findHandle(page, item.key, scopeSel);
  if (!el) {
    pageReport.results.push({ label: item.label, result: 'gone before click' });
    return null;
  }
  process.stdout.write(`  · ${item.label.slice(0, 70)}`);

  let r;
  if (item.select) {
    const { values, current } = await el.evaluate((s) => ({ values: [...s.options].map((o) => o.value), current: s.value }));
    const other = values.find((v) => v !== current);
    if (other === undefined) {
      process.stdout.write('  (one option)\n');
      return null;
    }
    r = await observe(ctx, () => el.select(other));
    const again = await findHandle(page, item.key, scopeSel);
    if (again) await again.select(current).catch(() => {});
  } else if (item.radio) {
    const checkedKey = await page.evaluate((key) => {
      const all = [...document.querySelectorAll('input[type="radio"]')];
      return all.find((x) => x.checked)?.id ?? null;
    }, item.key);
    r = await observe(ctx, () => clickHandle(page, el));
    if (checkedKey) await page.evaluate((id) => document.getElementById(id)?.click(), checkedKey).catch(() => {});
  } else {
    r = await observe(ctx, () => clickHandle(page, el));
  }
  process.stdout.write(`  → ${r.result}${r.navigated ? ` (went to ${new URL(page.url()).pathname})` : ''}${r.openedDialog ? ' (opened a pop-up)' : ''}\n`);
  pageReport.clicked++;
  pageReport.results.push({ label: item.label, result: r.result, errors: r.errors });
  if (r.result === 'error') {
    const detail = r.errors.map((e) => `${e.kind}: ${e.text}`).join(' | ');
    await bug(page, where, 'error after clicking', detail);
  } else if (r.result === 'no visible effect') {
    warn(where, 'nothing visible happened (no change, no request)');
  }

  // A pop-up opened: test its own buttons, then close it
  if (r.openedDialog && depth === 0 && (await page.evaluate(markTopDialog))) {
    const inner = (await page.evaluate(collect, '[data-bt-dialog="1"]', null)).filter(
      (x) => !/^(close|cancel|done|dismiss|×|✕|back|not now)$/i.test(x.label)
    );
    for (const x of inner) {
      const why = skipReason(x, true);
      if (why) {
        pageReport.skipped.push(`${item.label} › ${x.label} (${why})`);
        continue;
      }
      if (x.disabled) {
        pageReport.disabled.push(`${item.label} › ${x.label}`);
        continue;
      }
      // Stop if the pop-up closed meanwhile
      if (!(await page.$('[data-bt-dialog="1"]').catch(() => null))) break;
      try {
        await testItem(ctx, { ...x, label: `${item.label} › ${x.label}`, key: x.key }, pageReport, '[data-bt-dialog="1"]', 1);
      } catch (err) {
        warn(`${where} › ${x.label}`, `could not test (${String(err.message).split('\n')[0]})`);
        break;
      }
    }
  }

  // Toggles go back to how they were
  if (item.toggle && !r.navigated) {
    const again = await findHandle(page, item.key, scopeSel);
    if (again) {
      await clickHandle(page, again);
      await sleep(400);
    }
  }
  if (depth === 0) await restore(ctx, r);
  return r;
}

async function sweep(ctx, path, name) {
  ctx.pageName = name;
  console.log(`\n▶ ${ctx.role}: every button on ${name} (${path})`);
  await goto(ctx, path);
  const pageReport = { role: ctx.role, page: name, clicked: 0, skipped: [], disabled: [], links: 0, results: [] };
  const errorsAtLoad = ctx.errors.splice(0);
  if (errorsAtLoad.length) {
    await bug(ctx.page, `${ctx.role} › ${name}`, 'errors while the page loaded', errorsAtLoad.map((e) => `${e.kind}: ${e.text}`).join(' | '));
  }
  const items = await ctx.page.evaluate(collect, null, null);
  for (const item of items) {
    if (item.inDialog) continue;
    const why = skipReason(item);
    if (why === 'leaves the app') {
      pageReport.links++;
      checkLink(ctx, item);
      continue;
    }
    if (why) {
      pageReport.skipped.push(`${item.label} (${why})`);
      continue;
    }
    if (item.disabled) {
      pageReport.disabled.push(item.label);
      continue;
    }
    try {
      await testItem(ctx, item, pageReport);
    } catch (err) {
      // The page went away under the click (e.g. a button that opens Telegram in this tab):
      // note it, come back and carry on with the next button
      process.stdout.write('\n');
      warn(`${ctx.role} › ${name} › ${item.label}`, `could not test (${String(err.message).split('\n')[0]})`);
      await sleep(1500);
      await goto(ctx, path);
    }
    // A late navigation (after the click's wait) leaves this page: come back
    if (!ctx.page.url().startsWith(`${BASE}${path === '/' ? '/' : path}`)) {
      report.newTabs.push(`${ctx.role} › ${item.label} went to ${ctx.page.url()}`);
      await goto(ctx, path);
    }
  }
  pageReport.skipped = [...new Set(pageReport.skipped)];
  report.pages.push(pageReport);
  console.log(`  ${name}: ${pageReport.clicked} clicked, ${pageReport.skipped.length} skipped, ${pageReport.disabled.length} disabled, ${pageReport.links} outside links checked`);
}

// ── Flow helpers ────────────────────────────────────────────────────────────
async function clickText(page, text, { exact = false, timeout = 15000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const handle = await page.evaluateHandle(
      (t, ex) =>
        [...document.querySelectorAll('button, a, label, summary')].find((b) => {
          const s = (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !b.disabled && (ex ? s === t : s.includes(t));
        }) ?? null,
      text,
      exact
    );
    const el = handle.asElement();
    if (el) {
      await clickHandle(page, el);
      await sleep(500);
      return true;
    }
    await sleep(500);
  }
  return false;
}

async function clickSel(page, selector, timeout = 15000) {
  const el = await page.waitForSelector(selector, { visible: true, timeout }).catch(() => null);
  if (!el) return false;
  await clickHandle(page, el);
  await sleep(500);
  return true;
}

const waitText = (page, text, timeout = 60000) =>
  page
    .waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text)
    .then(() => true)
    .catch(() => false);

const readScreenBeds = (page) =>
  page
    .evaluate(() => {
      const root = [...document.querySelectorAll('[role="region"][aria-label]')].find((r) =>
        r.getAttribute('aria-label').startsWith('ICU Beds inventory:')
      );
      if (!root) return null;
      const m = root.getAttribute('aria-label').match(/(\d+) available of (\d+)/);
      const taken = [...root.querySelectorAll('button[aria-label^="Bed "]')]
        .filter((b) => /: Occupied/.test(b.getAttribute('aria-label')))
        .map((b) => Number(b.textContent.trim()))
        .sort((a, b) => a - b);
      return { free: Number(m[1]), total: Number(m[2]), taken };
    })
    .catch(() => null);

const readDispatcherFree = (page) =>
  page
    .evaluate(() => {
      const card = [...document.querySelectorAll('article')].find((a) => a.innerText.includes('Aditi Hospital'));
      if (!card) return null;
      const label = [...card.querySelectorAll('span')].find((s) => s.textContent.trim() === 'ICU free');
      const n = Number(label?.previousElementSibling?.textContent.trim());
      return Number.isFinite(n) ? n : null;
    })
    .catch(() => null);

const fmt = (s) =>
  Object.entries(s)
    .map(([k, v]) => `${k}: ${v === null ? '–' : typeof v === 'number' ? `${v} free` : `${v.free}/${v.total} free${v.taken ? ` taken [${v.taken.join(',')}]` : ''}`}`)
    .join(' · ');

function agree(s) {
  const screens = [s.nurse, s.coordinator, s.database].filter(Boolean);
  if (screens.length < 3) return false;
  const [a] = screens;
  if (!screens.every((x) => x.free === a.free && x.total === a.total)) return false;
  if (s.dispatcher !== null && s.dispatcher !== undefined && s.dispatcher !== a.free) return false;
  if (s.nurse.taken.join() !== s.coordinator.taken.join()) return false;
  if (s.database.taken && s.database.taken.join() !== s.nurse.taken.join()) return false;
  return s.nurse.taken.length === s.nurse.total - s.nurse.free;
}

async function compareBeds(roles, step, expect = () => true) {
  let snap;
  for (let i = 0; i < 15; i++) {
    snap = {
      nurse: await readScreenBeds(roles.nurse.page),
      coordinator: await readScreenBeds(roles.coordinator.page),
      dispatcher: await readDispatcherFree(roles.dispatcher.page),
      database: await readDbBeds()
    };
    if (agree(snap) && expect(snap)) break;
    await sleep(1000);
  }
  const ok = agree(snap) && expect(snap);
  flowStep('beds', step, ok, ok ? '' : fmt(snap));
  if (!ok) await bug(roles.nurse.page, 'Bed numbers / counts (Aditi ICU)', `screens disagree: ${step}`, fmt(snap));
  return snap;
}

// ── Run ─────────────────────────────────────────────────────────────────────
const roles = {};
try {
  roles.dispatcher = await openRole('dispatcher', 'dispatcher@bedlink.test');
  roles.coordinator = await openRole('coordinator', 'coordinator.aditi@bedlink.test');
  roles.nurse = await openRole('nurse', 'nurse.aditi@bedlink.test', true);

  if (ONLY.has('sweep')) {
    if (SWEEP.has('dispatcher')) await sweep(roles.dispatcher, '/', 'Dispatch');
    if (SWEEP.has('coordinator')) await sweep(roles.coordinator, '/hospital', 'Hospital (coordinator)');
    if (SWEEP.has('nurse')) await sweep(roles.nurse, '/hospital', 'Hospital (nurse)');
    // Each role only reaches its own screens (the Audit Trail is admin only)
    for (const [role, path] of [
      ['dispatcher', '/history'],
      ['dispatcher', '/hospital'],
      ['coordinator', '/'],
      ['coordinator', '/history'],
      ['nurse', '/'],
      ['nurse', '/history']
    ]) {
      await goto(roles[role], path);
      const landed = new URL(roles[role].page.url()).pathname;
      const ok = landed !== path;
      flowStep('access', `${role} opening ${path} is sent back to their own screen`, ok, landed);
      if (!ok) await bug(roles[role].page, `${role} › ${path}`, `${role} can open ${path}`);
    }
  }

  // Fresh screens for the flows
  await goto(roles.dispatcher, '/');
  await goto(roles.coordinator, '/hospital');
  await goto(roles.nurse, '/hospital');
  for (const r of Object.values(roles)) r.errors.splice(0);

  let start = null;
  if (ONLY.has('beds')) {
    console.log('\n▶ Beds: same counts and bed numbers on every screen (Aditi ICU)');
    const n = roles.nurse.page;
    const c = roles.coordinator.page;
    start = await compareBeds(roles, 'at start');
    if (!numbersInDb) warn('Database', 'bed numbers are not stored yet: run supabase/migrations/20261003000600_bed_numbers.sql');

    const s0 = start.nurse;
    if (s0) {
      // A green bed that is not the next one in order (a "specific" bed)
      const green = Array.from({ length: s0.total }, (_, i) => i + 1).filter((b) => !s0.taken.includes(b));
      const pick = green[green.length - 1];
      if (pick) {
        roles.nurse.step = `beds › tap bed ${pick}`;
        await clickSel(n, `button[aria-label^="Bed ${pick}: Available"]`);
        await compareBeds(roles, `nurse taps bed ${pick} (taken)`, (s) => s.coordinator?.taken.includes(pick) && s.nurse.free === s0.free - 1);
        await clickSel(n, `button[aria-label^="Bed ${pick}: Occupied"]`);
        await compareBeds(roles, `nurse taps bed ${pick} again (free)`, (s) => !s.coordinator?.taken.includes(pick) && s.nurse.free === s0.free);
      }
      roles.nurse.step = 'beds › -1 / +1';
      if (await clickSel(n, 'button[aria-label="One less free ICU Beds bed"]')) {
        await compareBeds(roles, 'nurse -1', (s) => s.nurse.free === s0.free - 1);
        await clickSel(n, 'button[aria-label="One more free ICU Beds bed"]');
        await compareBeds(roles, 'nurse +1', (s) => s.nurse.free === s0.free);
      } else flowStep('beds', 'nurse -1 / +1 buttons', false, 'not found');
      roles.coordinator.step = 'beds › add / remove a bed';
      if (await clickSel(c, 'button[aria-label="Add a seat to ICU Beds"]')) {
        await compareBeds(roles, 'coordinator adds a bed', (s) => s.nurse.total === s0.total + 1 && s.nurse.free === s0.free + 1);
        await clickSel(c, 'button[aria-label="Remove a seat from ICU Beds"]');
        await compareBeds(roles, 'coordinator removes a bed', (s) => s.nurse.total === s0.total && s.nurse.free === s0.free);
      } else flowStep('beds', 'coordinator add / remove bed buttons', false, 'not found');
    }
    for (const r of Object.values(roles)) {
      const errs = r.errors.splice(0);
      if (errs.length) await bug(r.page, `${r.role} › beds check`, 'errors', errs.map((e) => `${e.kind}: ${e.text}`).join(' | '));
    }
  }

  if (ONLY.has('hold')) {
    console.log('\n▶ Hold flow: hold → accept → arrive → admit');
    const d = roles.dispatcher;
    const c = roles.coordinator;
    const since = new Date(Date.now() - 30000).toISOString();
    const before = await readDbBeds();
    d.step = 'hold flow › hold Aditi';
    const held = await clickSel(d.page, 'button[aria-label^="Hold bed at Aditi"]', 60000);
    flowStep('hold', 'dispatcher taps "Hold bed" at Aditi', held);
    if (held) {
      const arrived = await waitText(c.page, 'ACCEPT & SECURE BED', 60000);
      flowStep('hold', 'coordinator gets the request within 60 s', arrived);
      const nurseHeard = await waitText(roles.nurse.page, 'Incoming ambulance request', 20000);
      flowStep('hold', 'nurse gets the heads-up', nurseHeard);
      if (arrived) {
        c.step = 'hold flow › reject then cancel';
        await clickText(c.page, 'REJECT & PASS TO NEXT');
        const reasons = await waitText(c.page, 'Select Rejection Reason', 8000);
        flowStep('hold', 'Reject opens the reasons', reasons);
        if (reasons) {
          await clickSel(c.page, 'input[name="rejectionReason"]', 5000);
          await clickText(c.page, 'Cancel', { exact: true });
          const still = await waitText(c.page, 'ACCEPT & SECURE BED', 5000);
          flowStep('hold', 'Cancel closes the reasons and keeps the request', still);
        }
        c.step = 'hold flow › accept';
        await clickText(c.page, 'ACCEPT & SECURE BED');
        const secured = await waitText(c.page, 'BED SECURED', 10000);
        flowStep('hold', 'Accept shows "Bed secured"', secured);
        await sleep(3000);
        const rows = await holdsSince(since);
        const mine = Array.isArray(rows) ? rows.filter((h) => h.hospital_id === ADITI).pop() : null;
        flowStep('hold', 'database: hold is accepted', mine?.status === 'accepted', mine?.status ?? 'no hold found');

        // Dispatcher's buttons while a bed is held (messages, vitals, directions...)
        await sweep(d, '/', 'Dispatch (bed held)');

        // Coordinator: arrival card
        c.step = 'hold flow › arrival';
        await goto(c, '/hospital');
        const lostArmed = (await clickText(c.page, 'Bed lost on arrival', { timeout: 8000 })) && (await waitText(c.page, 'Tap again: bed lost', 4000));
        flowStep('hold', '"Bed lost" asks for a second tap (not tapped)', lostArmed);
        await c.page.keyboard.press('Escape');
        await sleep(4000);
        const admitted = await clickText(c.page, 'Admit', { exact: true, timeout: 10000 });
        const modal = admitted && (await waitText(c.page, 'Successfully Admitted', 10000));
        flowStep('hold', 'Admit shows the admitted pop-up', !!modal);
        if (modal) {
          const pr = { role: 'coordinator', page: 'Admitted pop-up', clicked: 0, skipped: [], disabled: [], links: 0, results: [] };
          if (await c.page.evaluate(markTopDialog)) {
            for (const x of await c.page.evaluate(collect, '[data-bt-dialog="1"]', null)) {
              if (!(await c.page.$('[data-bt-dialog="1"]'))) break;
              if (!skipReason(x, true) && !x.disabled) await testItem(c, x, pr, '[data-bt-dialog="1"]', 1);
            }
          }
          report.pages.push(pr);
          await c.page.keyboard.press('Escape');
          await c.page.evaluate(clickCloseInTopDialog);
        }
        await sleep(3000);
        const rows2 = await holdsSince(since);
        const done = Array.isArray(rows2) ? rows2.find((h) => h.id === mine?.id) : null;
        flowStep('hold', 'database: hold is completed after Admit', done?.status === 'completed', done?.status ?? '-');
        // The patient leaves: the nurse frees the bed, so the count is back where it started
        await goto(roles.nurse, '/hospital');
        await clickSel(roles.nurse.page, 'button[aria-label="One more free ICU Beds bed"]');
        if (before) await compareBeds(roles, 'after the patient leaves (nurse +1)', (s) => s.nurse.free === before.free);
      }
    }
    for (const r of Object.values(roles)) {
      const errs = r.errors.splice(0);
      if (errs.length) await bug(r.page, `${r.role} › hold flow`, 'errors', errs.map((e) => `${e.kind}: ${e.text}`).join(' | '));
    }
  }

  if (ONLY.has('reject')) {
    console.log('\n▶ Reject flow: reject → next hospital automatically → cancel');
    const d = roles.dispatcher;
    const c = roles.coordinator;
    await goto(d, '/');
    await goto(c, '/hospital');
    const since = new Date(Date.now() - 30000).toISOString();
    const before = await readDbBeds();
    d.step = 'reject flow › hold Aditi';
    const held = await clickSel(d.page, 'button[aria-label^="Hold bed at Aditi"]', 60000);
    flowStep('reject', 'dispatcher holds Aditi', held);
    if (held && (await waitText(c.page, 'REJECT & PASS TO NEXT', 60000))) {
      c.step = 'reject flow › reject';
      await clickText(c.page, 'REJECT & PASS TO NEXT');
      await waitText(c.page, 'Select Rejection Reason', 8000);
      await clickSel(c.page, 'input[name="rejectionReason"]', 5000);
      await clickText(c.page, 'Confirm Rejection & Fallback');
      let next = null;
      let aditi = null;
      for (let i = 0; i < 20 && !next; i++) {
        await sleep(1000);
        const rows = await holdsSince(since);
        if (!Array.isArray(rows)) continue;
        aditi = rows.filter((h) => h.hospital_id === ADITI).pop();
        next = rows.find((h) => h.hospital_id !== ADITI && h.request_id === aditi?.request_id && h.status === 'pending');
      }
      flowStep('reject', 'database: Aditi rejected', aditi?.status === 'rejected', aditi?.status ?? '-');
      flowStep('reject', 'next hospital is held automatically', !!next, next ? '' : 'no new hold within 20 s');
      const shows = await waitText(d.page, 'Cancel hold', 10000);
      flowStep('reject', 'dispatcher shows the new hold', shows);
      if (next) {
        d.step = 'reject flow › cancel';
        await clickText(d.page, 'Cancel hold', { exact: true });
        await clickText(d.page, 'Tap again to cancel', { exact: true });
        await sleep(4000);
        const after = await rest(`reservations?select=status&id=eq.${next.id}`);
        flowStep('reject', 'cancel frees the next hospital', after?.[0]?.status === 'cancelled', after?.[0]?.status ?? '-');
      }
      if (before) await compareBeds(roles, 'Aditi count back after the reject', (s) => s.nurse.free === before.free);
    } else flowStep('reject', 'coordinator gets the request', false);
    for (const r of Object.values(roles)) {
      const errs = r.errors.splice(0);
      if (errs.length) await bug(r.page, `${r.role} › reject flow`, 'errors', errs.map((e) => `${e.kind}: ${e.text}`).join(' | '));
    }
  }

  if (ONLY.has('admin')) {
    roles.admin = await openRole('admin', 'admin@bedlink.test');
    const a = roles.admin;
    if (ONLY.has('sweep') && SWEEP.has('admin')) {
      await sweep(a, '/', 'Dispatch (admin)');
      await sweep(a, '/hospital', 'Hospital (admin)');
      await sweep(a, '/history', 'Audit Trail (admin)');
    }
    console.log('\n▶ Admin: Run demo, then Reset Demo Data');
    await goto(a, '/');
    a.step = 'admin › run demo';
    const started = await clickText(a.page, 'Run demo');
    flowStep('admin', '"Run demo" starts', started);
    if (started) {
      const finished = await waitText(a.page, 'Demo finished', 120000);
      flowStep('admin', 'demo plays to the end', finished, finished ? '' : await a.page.evaluate(() => document.body.innerText.match(/Demo (stopped|\d\/5)[^\n]*/)?.[0] ?? 'no end message'));
    }
    a.step = 'admin › reset';
    const reset = await clickText(a.page, 'Reset Demo Data');
    await sleep(8000);
    const open = await rest('reservations?select=id&status=in.(pending,accepted,shadow)');
    flowStep('admin', 'Reset Demo Data leaves no open holds', reset && Array.isArray(open) && open.length === 0, Array.isArray(open) ? `${open.length} open` : 'no answer');
    const errs = a.errors.splice(0);
    if (errs.length) await bug(a.page, 'admin › demo / reset', 'errors', errs.map((e) => `${e.kind}: ${e.text}`).join(' | '));
  }
} catch (err) {
  await bug(null, 'test run', 'the test itself stopped', String(err?.stack ?? err).slice(0, 500));
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, 'report.md'), toMarkdown(report));
  console.log(`\n══ ${report.bugs.length} bug(s), ${report.warnings.length} warning(s), ${report.flows.filter((f) => !f.ok).length} failed flow step(s)`);
  console.log(`Report: ${join(OUT, 'report.md')}`);
  if (!argv.includes('--keep-open')) await browser.close();
}

function toMarkdown(r) {
  const lines = [`# BedLink button test`, '', `${r.startedAt} → ${r.finishedAt} on ${r.base}`, ''];
  lines.push(`## Bugs (${r.bugs.length})`, '');
  for (const b of r.bugs) lines.push(`- **${b.where}**: ${b.what}${b.detail ? `\n  - ${b.detail}` : ''}${b.screenshot ? `\n  - screenshot: ${b.screenshot}` : ''}`);
  lines.push('', `## Flows`, '');
  for (const f of r.flows) lines.push(`- ${f.ok ? '✓' : '✗'} [${f.flow}] ${f.step}${f.detail && !f.ok ? `: ${f.detail}` : ''}`);
  lines.push('', `## Worth a look (${r.warnings.length})`, '');
  for (const w of r.warnings) lines.push(`- ${w.where}: ${w.what}`);
  lines.push('', '## Pages', '');
  for (const p of r.pages) {
    lines.push(`### ${p.role} › ${p.page}: ${p.clicked} clicked, ${p.skipped.length} skipped, ${p.disabled.length} disabled, ${p.links} outside links`);
    for (const x of p.results) lines.push(`- ${x.result === 'ok' ? '✓' : x.result === 'error' ? '✗' : '·'} ${x.label}: ${x.result}`);
    if (p.skipped.length) lines.push(`- skipped: ${p.skipped.join('; ')}`);
    if (p.disabled.length) lines.push(`- disabled: ${p.disabled.join('; ')}`);
    lines.push('');
  }
  if (r.newTabs.length) lines.push('## Tabs opened by clicks', '', ...r.newTabs.map((u) => `- ${u}`));
  return lines.join('\n');
}
