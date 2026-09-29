import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../services/receipts/test/database.ts';
import sharp from 'sharp';
import { buildApp } from '../services/receipts/src/app.ts';
import { processOne } from '../services/receipts/src/worker.ts';
import type { DB } from '../services/receipts/src/db.ts';
import type { Extraction } from '@bowl/shared';

// Full UI → real API → embedded Postgres → worker → analytics. Only vision and object storage are injected.
const { pg, db } = await createTestDatabase();
const files = new Map<string, Buffer>();
const storage = {
  async signedUrl(k: string) {
    return `data:image/jpeg;base64,${files.get(k)!.toString('base64')}`;
  },
  async put(k: string, b: Buffer) {
    files.set(k, b);
  },
  async get(k: string) {
    return files.get(k)!;
  },
};
const app = buildApp(
  db,
  storage,
  async (token) =>
    token === `test-token-${userA.id}`
      ? userA.id
      : token === `test-token-${userB.id}`
        ? userB.id
        : null,
  ['http://localhost:8081'],
);
const extraction: Extraction = {
  merchant: 'Berkeley Bowl',
  store_location: 'SYNTHETIC TEST',
  purchased_at: '2026-09-12',
  currency: 'USD',
  subtotal_cents: 4080,
  tax_cents: 0,
  discounts_cents: 0,
  fees_cents: 0,
  total_cents: 4080,
  line_items: [
    {
      merchant_item_code: '00123',
      raw_description: 'TEST APPLES',
      normalized_description: 'Synthetic apples',
      category: 'produce',
      quantity: '4',
      unit: 'lb',
      unit_price_cents: 1020,
      extended_price_cents: 4080,
      line_discount_cents: 0,
      raw_line: 'TEST APPLES 4 lb @ 10.20',
    },
  ],
};
const root = resolve('dist'),
  screens = resolve('test-results/groceries');
await mkdir(screens, { recursive: true });
const image = await sharp(
  Buffer.from(
    '<svg width="500" height="800"><rect width="100%" height="100%" fill="#f9f6e9"/><text x="45" y="90" font-size="28">SYNTHETIC TEST RECEIPT</text><text x="45" y="150" font-size="24">Berkeley Bowl</text><text x="45" y="210" font-size="20">2026-09-12</text><text x="45" y="300" font-size="22">TEST APPLES 4 lb @ 10.20</text><text x="45" y="380" font-size="28">TOTAL $40.80</text></svg>',
  ),
)
  .png()
  .toBuffer();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE_PATH,
  args: process.env.BROWSER_EXECUTABLE_PATH
    ? [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--no-zygote',
        '--single-process',
      ]
    : [],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
await page.addInitScript(() => {
  Object.defineProperty(AbortSignal, 'timeout', {
    value: undefined,
    configurable: true,
  });
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('http://localhost:8081/**', async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  const path = resolve(
    root,
    '.' + (pathname === '/' ? '/index.html' : pathname),
  );
  if (!path.startsWith(root + '/')) return route.abort();
  const body = await readFile(path).catch(() =>
    readFile(resolve(root, 'index.html')),
  );
  const contentType =
    (
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.png': 'image/png',
      } as Record<string, string>
    )[extname(path)] ??
    (extname(path) ? 'application/octet-stream' : 'text/html');
  await route.fulfill({ body, contentType });
});
let rejectNextUpload = true;
await page.route('http://localhost:3001/**', async (route) => {
  const req = route.request(),
    url = new URL(req.url());
  if (
    req.method() === 'POST' &&
    url.pathname === '/receipts' &&
    rejectNextUpload
  ) {
    rejectNextUpload = false;
    await route.abort('connectionfailed');
    return;
  }
  const result = await app.inject({
    method: req.method() as any,
    url: url.pathname + url.search,
    headers: req.headers(),
    payload: req.postDataBuffer() ?? undefined,
  });
  const headers = Object.fromEntries(
    Object.entries(result.headers)
      .filter(
        ([key]) =>
          !['content-length', 'transfer-encoding', 'connection'].includes(key),
      )
      .map(([k, v]) => [k, String(v)]),
  );
  await route.fulfill({
    status: result.statusCode,
    headers,
    body: result.rawPayload,
  });
  if (req.method() === 'POST' && url.pathname === '/receipts')
    await processOne(db, storage, async () => ({
      data: extraction,
      raw: { synthetic: true, extraction },
    }));
});
const userA = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'receipts-a@test.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const userB = {
  ...userA,
  id: '22222222-2222-4222-8222-222222222222',
  email: 'receipts-b@test.invalid',
};
let currentUser = userA;
const sessionFor = (user: any) => ({
  access_token: `test-token-${user.id}`,
  refresh_token: 'test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'bearer',
  user,
});
await page.addInitScript(
  ({ session }) => {
    if (!localStorage.getItem('sb-localhost-auth-token'))
      localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session));
  },
  { session: sessionFor(userA) },
);
await page.route('http://localhost:54321/**', async (route) => {
  const url = new URL(route.request().url());
  let body: unknown = [];
  if (url.pathname.endsWith('/user')) body = currentUser;
  else if (url.pathname.endsWith('/profiles'))
    body = {
      id: currentUser.id,
      display_name: 'Receipt tester',
      avatar_url: null,
    };
  else if (url.pathname.endsWith('/packs'))
    body = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Test pack',
        created_at: '2026-01-01',
        pack_members: [],
        pack_invites: [],
      },
    ];
  else if (url.pathname.endsWith('/journeys')) body = null;
  await route.fulfill({
    json: body,
    headers: { 'access-control-allow-origin': '*' },
  });
});
try {
  await page.goto('http://localhost:8081');
  await page.getByRole('tab', { name: /Groceries/ }).click();
  await page.getByText('Start with one receipt.').waitFor();
  assert.equal(await page.getByLabel('Server address', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Connection settings' }).count(), 0);
  await page.screenshot({ path: resolve(screens, 'explore.png') });
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await page.screenshot({ path: resolve(screens, 'scan.png') });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import image files' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'synthetic-receipt.png',
    mimeType: 'image/png',
    buffer: image,
  });
  await page.getByRole('button', { name: 'Save receipt', exact: true }).click();
  await page
    .getByText('synthetic-receipt.png · failed', { exact: true })
    .waitFor();
  await page.reload();
  await page.getByRole('tab', { name: /Groceries/ }).click();
  await page.getByRole('button', { name: 'Receipts', exact: true }).click();
  await page
    .getByText('synthetic-receipt.png · failed', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Retry failed uploads' }).click();
  await page.getByText('Ready', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('$40.80', { exact: true }).click();
  await page.getByText('Synthetic apples', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(screens, 'receipt.png') });
  await page.getByRole('button', { name: 'Edit receipt', exact: true }).click();
  await page.getByLabel('total', { exact: true }).fill('40.81');
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await page.getByText('$40.81', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByText('$40.81', { exact: true }).first().waitFor();
  await page
    .getByRole('button', { name: 'View Synthetic apples price history' })
    .click();
  await page.getByText('Price observations', { exact: true }).waitFor();
  assert.equal((await db.query('SELECT * FROM receipts')).rows.length, 1);
  assert.equal(
    (await db.query('SELECT total_cents FROM receipts')).rows[0].total_cents,
    4081,
  );
  await page.getByRole('tab', { name: /Quests/ }).click();
  await page.getByRole('tab', { name: /History/ }).click();
  await page.getByRole('tab', { name: /Groceries/ }).click();
  await page.getByText('Price observations', { exact: true }).waitFor();
  currentUser = userB;
  await page.evaluate(
    (session) =>
      localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
    sessionFor(userB),
  );
  await page.reload();
  await page.getByRole('tab', { name: /Groceries/ }).click();
  await page.getByText('Start with one receipt.').waitFor();
  assert.equal(
    await page.getByLabel('App access token', { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByLabel('Server address', { exact: true }).count(), 0);
  await page.screenshot({ path: resolve(screens, 'account-isolation.png') });
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(
    resolve(screens, 'ui-check.txt'),
    'PASS: automatic connection without server setup, account isolation, image import, failed upload survives reload, retry, persistent upload queue, real API, worker, history, source image, manual correction, analytics, product history. Chromium 390×844. Vision response and object storage injected; embedded Postgres. No page errors.\n',
  );
  console.log('Trot n Spot groceries smoke test passed; screenshots saved.');
} finally {
  await browser.close();
  await app.close();
  await pg.close();
}
