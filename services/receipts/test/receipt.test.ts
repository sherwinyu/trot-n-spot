import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import sharp from 'sharp';
import {
  extractionSchema,
  parseMoney,
  reconcile,
  type Extraction,
} from '@bowl/shared';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../src/app.ts';
import { processOne } from '../src/worker.ts';
import type { DB } from '../src/db.ts';
import type { Storage } from '../src/storage.ts';

export const fixture: Extraction = {
  merchant: 'Berkeley Bowl',
  store_location: 'Synthetic test fixture',
  purchased_at: '2026-09-12',
  currency: 'USD',
  subtotal_cents: 4000,
  tax_cents: 180,
  discounts_cents: 100,
  fees_cents: 0,
  total_cents: 4080,
  line_items: [
    {
      merchant_item_code: '00123',
      raw_description: 'ORG APPLES',
      normalized_description: 'Organic apples',
      category: 'produce',
      quantity: '2.500000',
      unit: 'lb',
      unit_price_cents: 400,
      extended_price_cents: 1000,
      line_discount_cents: 0,
      raw_line: '00123 ORG APPLES 2.50lb @ 4.00',
    },
    {
      merchant_item_code: '00999',
      raw_description: 'OLIVE OIL',
      normalized_description: 'Olive oil',
      category: 'other',
      quantity: '1',
      unit: 'each',
      unit_price_cents: 3200,
      extended_price_cents: 3000,
      line_discount_cents: 200,
      raw_line: null,
    },
  ],
};
const token = 'testing-only-access-token-123456789';
async function setup() {
  const pg = new PGlite();
  await pg.exec(
    await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'),
  );
  const wrap = (client: any): DB => ({
    query: (sql, params) => client.query(sql, params),
    transaction: (fn) => client.transaction((tx: any) => fn(wrap(tx))),
  });
  const db = wrap(pg),
    files = new Map<string, Buffer>();
  const storage: Storage = {
    async put(key, data) {
      files.set(key, data);
    },
    async get(key) {
      const data = files.get(key);
      if (!data) throw new Error('Missing');
      return data;
    },
  };
  const app = buildApp(db, storage, token);
  const headers = { authorization: `Bearer ${token}` };
  const image = await sharp({
    create: { width: 40, height: 80, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  async function upload(id = randomUUID()) {
    const boundary = 'test-boundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return {
      id,
      result: await app.inject({
        method: 'POST',
        url: '/receipts',
        headers: {
          ...headers,
          'idempotency-key': id,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      }),
    };
  }
  return {
    pg,
    db,
    storage,
    files,
    app,
    headers,
    image,
    upload,
    close: async () => {
      await app.close();
      await pg.close();
    },
  };
}
test('exact money and net-line discount reconciliation', () => {
  assert.equal(parseMoney('40.80'), 4080);
  assert.equal(parseMoney('-0.01'), -1);
  assert.equal(parseMoney(''), null);
  assert.throws(() => parseMoney('4.001'));
  assert.throws(() => parseMoney('1e2'));
  assert.deepEqual(reconcile(fixture), {
    delta: 0,
    reason: null,
    status: 'processed',
  });
  assert.equal(
    reconcile({ ...fixture, total_cents: 4078 }).status,
    'processed',
  );
  assert.equal(
    reconcile({ ...fixture, total_cents: 4077 }).status,
    'needs_review',
  );
  assert.equal(reconcile({ ...fixture, total_cents: null }).delta, null);
  assert.equal(
    reconcile({ ...fixture, line_items: [] }).status,
    'needs_review',
  );
  assert.equal(
    reconcile({
      ...fixture,
      line_items: [{ ...fixture.line_items[0], extended_price_cents: null }],
    }).status,
    'needs_review',
  );
  assert.equal(
    extractionSchema.parse(fixture).line_items[0].merchant_item_code,
    '00123',
  );
});
test('upload → durable pending → async extraction → detail, analytics, retry, manual edit', async () => {
  const t = await setup();
  try {
    assert.equal((await t.app.inject('/receipts')).statusCode, 401);
    const { id, result } = await t.upload();
    assert.equal(result.statusCode, 202, result.body);
    assert.equal((await t.upload(id)).result.statusCode, 202);
    assert.equal((await t.db.query('SELECT * FROM receipts')).rows.length, 1);
    assert.equal(t.files.size, 1);
    assert.deepEqual([...t.files.values()][0], t.image);
    assert.equal((await t.db.query('SELECT * FROM jobs')).rows.length, 1);
    const extract = async () => ({
      data: fixture,
      raw: { model: 'test-only', output: fixture },
    });
    assert.equal(await processOne(t.db, t.storage, extract), true);
    assert.equal(await processOne(t.db, t.storage, extract), false);
    let receipt = (
      await t.app.inject({ url: `/receipts/${id}`, headers: t.headers })
    ).json();
    assert.equal(receipt.status, 'processed');
    assert.equal(receipt.line_items.length, 2);
    assert.equal(receipt.raw_extraction.model, 'test-only');
    let statsRes = await t.app.inject({ url: '/stats', headers: t.headers });
    assert.equal(statsRes.statusCode, 200, statsRes.body);
    const stats = statsRes.json();
    assert.equal(stats.spend_cents, 4080);
    assert.equal(stats.visits, 1);
    assert.equal(stats.produce_pounds, 2.5);
    assert.equal(stats.line_items, 2);
    assert.equal(stats.months[0].period, '2026-09-01');
    const apples = stats.products.find((p: any) => p.code === '00123');
    const observations = (
      await t.app.inject({
        url: `/products/history?key=${encodeURIComponent(apples.key)}`,
        headers: t.headers,
      })
    ).json();
    assert.equal(observations.observations[0].unit_price_cents, 400);
    assert.equal(
      (
        await t.app.inject({ url: `/receipts/${id}/image`, headers: t.headers })
      ).rawPayload.equals(t.image),
      true,
    );
    const patch = {
      revision: receipt.revision,
      data: { ...fixture, total_cents: 9999 },
    };
    let edited = await t.app.inject({
      method: 'PATCH',
      url: `/receipts/${id}`,
      headers: t.headers,
      payload: patch,
    });
    assert.equal(edited.statusCode, 200, edited.body);
    receipt = edited.json();
    assert.equal(receipt.status, 'needs_review');
    assert.equal(receipt.attempts.length, 2);
    assert.equal(receipt.raw_extraction.model, 'test-only');
    assert.equal(
      (
        await t.app.inject({
          method: 'PATCH',
          url: `/receipts/${id}`,
          headers: t.headers,
          payload: patch,
        })
      ).statusCode,
      409,
    );
    statsRes = await t.app.inject({ url: '/stats', headers: t.headers });
    assert.equal(statsRes.json().review_included, 1);
    assert.equal(
      (
        await t.app.inject({
          method: 'POST',
          url: `/receipts/${id}/reprocess`,
          headers: t.headers,
          payload: { revision: receipt.revision },
        })
      ).statusCode,
      202,
    );
    await processOne(t.db, t.storage, extract);
    receipt = (
      await t.app.inject({ url: `/receipts/${id}`, headers: t.headers })
    ).json();
    assert.equal(receipt.line_items.length, 2);
    assert.equal(receipt.attempts.length, 3);
    assert.equal(receipt.status, 'processed');
    assert.equal(
      (
        await t.app.inject({
          url: '/receipts?status=failed',
          headers: t.headers,
        })
      ).json().receipts.length,
      0,
    );
    assert.equal(
      (await t.app.inject({ url: '/receipts?limit=-1', headers: t.headers }))
        .statusCode,
      400,
    );
  } finally {
    await t.close();
  }
});
test('failures retry three times without blocking another receipt', async () => {
  const t = await setup();
  try {
    const a = await t.upload(),
      b = await t.upload();
    let calls = 0;
    const fail = async () => {
      calls++;
      throw new Error('Transient fixture failure');
    };
    await processOne(t.db, t.storage, fail);
    await processOne(t.db, t.storage, async () => ({
      data: fixture,
      raw: fixture,
    }));
    assert.equal(
      (await t.db.query('SELECT status FROM receipts WHERE id=$1', [b.id]))
        .rows[0].status,
      'processed',
    );
    for (let i = 0; i < 2; i++) {
      await t.db.query(
        "UPDATE jobs SET available_at=now()-interval '1 second'",
      );
      await processOne(t.db, t.storage, fail);
    }
    assert.equal(calls, 3);
    assert.equal(
      (await t.db.query('SELECT status FROM receipts WHERE id=$1', [a.id]))
        .rows[0].status,
      'failed',
    );
    assert.equal((await t.db.query('SELECT * FROM jobs')).rows.length, 0);
  } finally {
    await t.close();
  }
});
test('manual correction fences a late worker and preserves the correction', async () => {
  const t = await setup();
  try {
    const { id } = await t.upload();
    let release!: () => void, claimed!: () => void;
    const started = new Promise<void>((resolve) => {
      claimed = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = processOne(t.db, t.storage, async () => {
      claimed();
      await barrier;
      return { data: fixture, raw: fixture };
    });
    await started;
    const patch = await t.app.inject({
      method: 'PATCH',
      url: `/receipts/${id}`,
      headers: t.headers,
      payload: {
        revision: 0,
        data: { ...fixture, merchant: 'Manually corrected' },
      },
    });
    assert.equal(patch.statusCode, 200, patch.body);
    release();
    await work;
    assert.equal(
      (await t.db.query('SELECT merchant FROM receipts WHERE id=$1', [id]))
        .rows[0].merchant,
      'Manually corrected',
    );
  } finally {
    await t.close();
  }
});
test('expired worker lease can be reclaimed; stale result is discarded', async () => {
  const t = await setup();
  try {
    const { id } = await t.upload();
    let release!: () => void, claimed!: () => void;
    const started = new Promise<void>((r) => {
      claimed = r;
    });
    const barrier = new Promise<void>((r) => {
      release = r;
    });
    const old = processOne(t.db, t.storage, async () => {
      claimed();
      await barrier;
      return { data: { ...fixture, merchant: 'Stale' }, raw: fixture };
    });
    await started;
    await t.db.query(
      "UPDATE jobs SET lease_until=now()-interval '1 second' WHERE receipt_id=$1",
      [id],
    );
    await processOne(t.db, t.storage, async () => ({
      data: fixture,
      raw: fixture,
    }));
    release();
    await old;
    assert.equal(
      (await t.db.query('SELECT merchant FROM receipts WHERE id=$1', [id]))
        .rows[0].merchant,
      'Berkeley Bowl',
    );
  } finally {
    await t.close();
  }
});
test('analytics exclude unknown currency, convert produce units, and separate incompatible units', async () => {
  const t = await setup();
  try {
    for (const unit of ['lb', 'kg', 'oz', 'g', 'each'] as const) {
      await t.upload();
      await processOne(t.db, t.storage, async () => ({
        data: {
          ...fixture,
          line_items: [{ ...fixture.line_items[0], quantity: '1', unit }],
          total_cents: 1000,
          tax_cents: 0,
          discounts_cents: 0,
        },
        raw: fixture,
      }));
    }
    await t.upload();
    await processOne(t.db, t.storage, async () => ({
      data: { ...fixture, currency: null },
      raw: fixture,
    }));
    const r = await t.app.inject({
      url: '/stats?period=year',
      headers: t.headers,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().products.length, 5);
    assert.equal(r.json().excluded_currency, 1);
    assert.equal(r.json().visits, 5);
    assert.ok(
      Math.abs(
        r.json().produce_pounds -
          (1 + 2.20462262185 + 1 / 16 + 0.00220462262185),
      ) < 1e-7,
    );
  } finally {
    await t.close();
  }
});
