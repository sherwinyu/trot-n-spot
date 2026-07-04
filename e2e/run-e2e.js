// End-to-end test: drives the real app UI (Expo web build) in Chromium
// against the mock Supabase server (backed by real Postgres with RLS).
//
// Flow under test:
//   1. Sherwin signs in, sees seeded quests
//   2. Sherwin starts a walk, creates a quest with photo + description
//   3. Creator sees the location line on his own quest
//   4. Nadia signs in, sees the new quest, does NOT see location
//   5. Nadia completes the quest with a photo
//   6. Both sides see it in History with time-to-find
//
// Prereqs: Postgres on $PGPORT with quest_test reset (run scripts/db-test.sh
// or the reset below), mock server + expo web started by this script.
//
// Usage: node e2e/run-e2e.js

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.E2E_SHOTS_DIR || path.join(__dirname, 'screenshots');
const APP_URL = 'http://127.0.0.1:8081';
const MOCK_URL = 'http://127.0.0.1:54321';
const PG = {
  PGHOST: process.env.PGHOST || '127.0.0.1',
  PGPORT: process.env.PGPORT || '54322',
  PGUSER: process.env.PGUSER || 'postgres',
};

// 1x1 transparent PNG — plenty for the picker + manipulator pipeline.
const TEST_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let failures = 0;
function check(name, ok, extra = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${mark}] ${name}${extra ? ` — ${extra}` : ''}`);
}

async function waitForHttp(url, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timed out waiting for ${label} at ${url}`);
}

function resetDb() {
  console.log('== resetting quest_test database');
  const env = { ...process.env, ...PG };
  execSync(`psql -d postgres -q -c "drop database if exists quest_test;" -c "create database quest_test;"`, { env });
  const files = [
    'supabase/tests/supabase-shim.sql',
    ...fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort().map((f) => `supabase/migrations/${f}`),
    'supabase/seed.sql',
  ];
  for (const f of files) {
    execSync(`psql -d quest_test -v ON_ERROR_STOP=1 -q -f "${f}"`, { cwd: ROOT, env });
  }
}

async function newUserPage(browser, dialogs) {
  const context = await browser.newContext({
    geolocation: { latitude: 38.9072, longitude: -77.0369 },
    permissions: ['geolocation'],
    viewport: { width: 420, height: 860 },
  });
  const page = await context.newPage();
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    await d.accept();
  });
  return { context, page };
}

async function signIn(page, email) {
  await page.goto(APP_URL, { timeout: 240000 });
  const emailInput = page.getByPlaceholder('Email');
  await emailInput.waitFor({ timeout: 240000 }); // first Metro bundle is slow
  await emailInput.fill(email);
  await page.getByPlaceholder('Password').fill('testpass123');
  await page.getByText('Sign In / Sign Up').click();
  await page.getByText('Quests for You').waitFor({ timeout: 60000 });
}

async function attachPhoto(page, triggerText) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 20000 }),
    page.getByText(triggerText, { exact: false }).first().click(),
  ]);
  await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: TEST_IMAGE });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  resetDb();

  console.log('== starting mock supabase + expo web');
  // Kill any servers a previous (crashed) run left behind — a stale
  // Metro on 8081 serves a stale bundle and wedges everything.
  try { execSync('pkill -f "e2e/mock-supabase.js"; pkill -f "expo start --web"; pkill -f "cli.js start --web"', { stdio: 'ignore' }); } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  const mock = spawn('node', ['e2e/mock-supabase.js'], {
    cwd: ROOT,
    env: { ...process.env, ...PG, PGDATABASE: 'quest_test' },
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: true,
  });
  const expo = spawn('npx', ['expo', 'start', '--web', '--port', '8081'], {
    cwd: ROOT,
    env: { ...process.env, CI: '1', BROWSER: 'none', EXPO_NO_TELEMETRY: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  expo.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
  expo.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(d));

  // detached:true puts each child in its own process group, so a
  // negative-pid kill takes out grandchildren (npx -> expo -> metro).
  const cleanup = () => {
    for (const child of [mock, expo]) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    }
  };
  process.on('exit', cleanup);

  await waitForHttp(`${MOCK_URL}/rest/v1/profiles`, 20000, 'mock supabase');
  await waitForHttp(APP_URL, 300000, 'expo web');

  // The sandbox pre-installs Chromium outside Playwright's registry;
  // point at it directly rather than downloading a matching build.
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  });

  try {
    // ---------- Sherwin: creator ----------
    console.log('== Sherwin signs in');
    const dialogsA = [];
    const { context: ctxA, page: pageA } = await newUserPage(browser, dialogsA);
    await signIn(pageA, 'test-sherwin@quest.dev');
    check('Sherwin lands on quest feed', true);

    await pageA.getByText('Find this cool mural on Oak Street').waitFor({ timeout: 20000 });
    check('seeded quest visible in "Quests for You"', true);
    await pageA.screenshot({ path: path.join(SHOTS, '01-sherwin-feed.png') });

    console.log('== Sherwin starts a walk');
    await pageA.getByText('Profile').last().click();
    await pageA.getByText('Start Walk').click();
    await pageA.getByText('End Walk').waitFor({ timeout: 10000 });
    check('journey starts, timer visible', true);
    await pageA.screenshot({ path: path.join(SHOTS, '02-sherwin-walk.png') });

    console.log('== Sherwin creates a quest');
    await pageA.getByText('Create', { exact: true }).last().click();
    await attachPhoto(pageA, 'Take a Photo');
    await pageA.getByPlaceholder('Add a hint or description (optional)').fill('E2E: the red mailbox');
    await pageA.getByText('Send Quest').click();
    await pageA.waitForTimeout(2000);
    check('quest-sent confirmation shown', dialogsA.some((m) => m.includes('Quest sent!')), dialogsA.join(' | '));

    await pageA.getByText('Quests', { exact: true }).last().click();
    await pageA.getByText('E2E: the red mailbox').waitFor({ timeout: 20000 });
    check('new quest appears under "Quests by You"', true);
    await pageA.screenshot({ path: path.join(SHOTS, '03-sherwin-created.png') });

    console.log('== Creator sees location on own quest');
    await pageA.getByText('E2E: the red mailbox').click();
    await pageA.getByText('Created').waitFor({ timeout: 20000 });
    const creatorSeesLocation = await pageA
      .getByText('Spotted at 38.9')
      .isVisible()
      .catch(() => false);
    check('creator sees 📍 location line', creatorSeesLocation);
    await pageA.screenshot({ path: path.join(SHOTS, '04-sherwin-detail-location.png') });

    // ---------- Nadia: assignee ----------
    console.log('== Nadia signs in');
    const dialogsB = [];
    const { context: ctxB, page: pageB } = await newUserPage(browser, dialogsB);
    await signIn(pageB, 'test-nadia@quest.dev');
    await pageB.getByText('E2E: the red mailbox').waitFor({ timeout: 20000 });
    check('Nadia sees the new quest in her feed', true);
    await pageB.screenshot({ path: path.join(SHOTS, '05-nadia-feed.png') });

    console.log('== Location privacy for assignee');
    await pageB.getByText('E2E: the red mailbox').click();
    await pageB.getByText('I Found It!').waitFor({ timeout: 20000 });
    const assigneeSeesLocation = await pageB
      .getByText('Spotted at')
      .isVisible()
      .catch(() => false);
    check('assignee does NOT see location', !assigneeSeesLocation);
    await pageB.screenshot({ path: path.join(SHOTS, '06-nadia-detail-no-location.png') });

    console.log('== Nadia completes the quest');
    await attachPhoto(pageB, 'I Found It!');
    await pageB.getByText('Complete Quest').waitFor({ timeout: 20000 });
    check('side-by-side compare shown before confirming', true);
    await pageB.screenshot({ path: path.join(SHOTS, '07-nadia-compare.png') });
    await pageB.getByText('Complete Quest').click();
    await pageB.waitForTimeout(2000);
    check('completion confirmation shown', dialogsB.some((m) => m.includes('Quest Complete!')), dialogsB.join(' | '));

    console.log('== History shows the completed quest');
    await pageB.getByText('History').last().click();
    await pageB.getByText('E2E: the red mailbox').waitFor({ timeout: 20000 });
    const foundIn = await pageB.getByText('Found in').first().isVisible();
    check('completed quest in history with time-to-find', foundIn);
    await pageB.screenshot({ path: path.join(SHOTS, '08-nadia-history.png') });

    // Quest removed from Nadia's active feed (focus refetch is async —
    // poll briefly instead of a single racy check)
    await pageB.getByText('Quests', { exact: true }).last().click();
    // The text also lives on the hidden-but-mounted History tab, which
    // react-navigation hides via aria-hidden (not display:none), so
    // count only occurrences inside the active scene.
    let stillActive = true;
    for (let i = 0; i < 10 && stillActive; i++) {
      await pageB.waitForTimeout(1000);
      stillActive = await pageB.evaluate(() => {
        const matches = [...document.querySelectorAll('div')].filter(
          (el) => el.textContent === 'E2E: the red mailbox'
        );
        return matches.some((el) => !el.closest('[aria-hidden="true"]'));
      });
    }
    check('completed quest removed from active feed', !stillActive);

    // Creator's history after refresh (leave the quest-detail route
    // first — the tab bar isn't part of that screen)
    console.log('== Sherwin sees completion in history');
    await pageA.goBack();
    await pageA.getByText('Quests for You').waitFor({ timeout: 20000 });
    await pageA.getByText('History').last().click();
    await pageA.getByText('E2E: the red mailbox').waitFor({ timeout: 20000 });
    check('creator sees completed quest in history', true);
    await pageA.screenshot({ path: path.join(SHOTS, '09-sherwin-history.png') });

    console.log('== Sherwin ends the walk');
    await pageA.getByText('Profile').last().click();
    await pageA.getByText('End Walk').click();
    await pageA.getByText('Start Walk').waitFor({ timeout: 10000 });
    check('journey ends cleanly', true);

    await ctxA.close();
    await ctxB.close();
  } finally {
    await browser.close();
    cleanup();
  }

  console.log(failures === 0 ? '\nALL E2E TESTS PASSED' : `\n${failures} E2E CHECKS FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E run crashed:', err);
  process.exit(1);
});
