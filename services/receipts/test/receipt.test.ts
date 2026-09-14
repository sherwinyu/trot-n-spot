import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, userA, userB } from './database.ts';
import { receiptDb } from '../src/db.ts';
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
  const { pg, raw, db } = await createTestDatabase();
  const files = new Map<string, Buffer>();
  const storage: Storage = {
    async signedUrl(key) {
      return `data:image/jpeg;base64,${files.get(key)!.toString('base64')}`;
    },
    async put(key, data) {
      files.set(key, data);
    },
    async get(key) {
      const data = files.get(key);
      if (!data) throw new Error('Missing');
      return data;
    },
  };
  const app = buildApp(db, storage, async (value) =>
    value === token ? userA : value === 'bob-token' ? userB : null,
  );
  const headers = { authorization: `Bearer ${token}` };
  const image = await sharp({
    create: { width: 40, height: 80, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  async function upload(id = randomUUID(), accessToken = token) {
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
          authorization: `Bearer ${accessToken}`,
          'idempotency-key': id,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      }),
    };
  }
  return {
    pg,
    raw,
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

test('Supabase owners are isolated across API reads, writes, analytics and image URLs', async () => {
  const t = await setup();
  const bobHeaders = { authorization: 'Bearer bob-token' };
  try {
    const { id, result } = await t.upload();
    assert.equal(result.statusCode, 202, result.body);
    await processOne(t.db, t.storage, async () => ({
      data: fixture,
      raw: fixture,
    }));
    assert.ok([...t.files.keys()][0].startsWith(`${userA}/${id}/`));
    for (const path of [
      `/receipts/${id}`,
      `/receipts/${id}/image`,
      `/receipts/${id}/image-url`,
    ]) {
      assert.equal(
        (await t.app.inject({ url: path, headers: bobHeaders })).statusCode,
        404,
        path,
      );
    }
    for (const method of ['PATCH', 'POST'] as const) {
      const response = await t.app.inject({
        method,
        url: `/receipts/${id}${method === 'POST' ? '/reprocess' : ''}`,
        headers: bobHeaders,
        payload: { revision: 1, data: fixture },
      });
      assert.equal(response.statusCode, 404, response.body);
    }
    assert.deepEqual(
      (await t.app.inject({ url: '/receipts', headers: bobHeaders })).json()
        .receipts,
      [],
    );
    assert.equal(
      (await t.app.inject({ url: '/stats', headers: bobHeaders })).json()
        .spend_cents,
      0,
    );
    const stats = (
      await t.app.inject({ url: '/stats', headers: t.headers })
    ).json();
    const history = await t.app.inject({
      url: `/products/history?key=${encodeURIComponent(stats.products[0].key)}`,
      headers: bobHeaders,
    });
    assert.deepEqual(history.json().observations, []);
    assert.equal((await t.upload(id, 'bob-token')).result.statusCode, 409);
    assert.equal(
      (
        await t.app.inject({
          url: '/receipts',
          headers: { authorization: 'Bearer forged' },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await t.app.inject({
          url: `/receipts/${id}/image-url`,
          headers: t.headers,
        })
      ).statusCode,
      200,
    );
    // Alternate users through the same database adapter: SET LOCAL must never leak.
    const bob = receiptDb(t.db, userB),
      alice = receiptDb(t.db, userA);
    assert.equal((await bob.query('SELECT * FROM receipts')).rows.length, 0);
    assert.equal((await alice.query('SELECT * FROM receipts')).rows.length, 1);
    assert.equal(
      (await bob.query('SELECT * FROM receipt_line_items')).rows.length,
      0,
    );
    assert.equal(
      (await bob.query('SELECT * FROM extraction_attempts')).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        alice.query('UPDATE receipts SET user_id=$1 WHERE id=$2', [userB, id]),
      /row-level security/,
    );
    await assert.rejects(
      () => bob.query('INSERT INTO jobs(receipt_id) VALUES($1)', [id]),
      /row-level security/,
    );
    // Database RLS is active, not just API-level filtering.
    assert.equal(
      (
        await t.raw.query(
          "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='groceries' AND rowsecurity",
        )
      ).rows[0].n,
      4,
    );
  } finally {
    await t.close();
  }
});
test('Storage RLS restricts originals to their owner; client roles cannot forge receipt rows', async () => {
  const t = await setup();
  try {
    await t.raw.query(
      "INSERT INTO storage.objects(bucket_id,name) VALUES ('grocery-receipts',$1),('grocery-receipts',$2)",
      [`${userA}/a/photo`, `${userB}/b/photo`],
    );
    for (const user of [userA, userB]) {
      await t.raw.transaction(async (tx) => {
        await tx.query('SET LOCAL ROLE authenticated');
        await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: user }),
        ]);
        const { rows } = await tx.query(
          "SELECT name FROM storage.objects WHERE bucket_id='grocery-receipts'",
        );
        assert.equal(rows.length, 1);
        assert.ok(rows[0].name.startsWith(user));
      });
    }
    await assert.rejects(
      () =>
        t.raw.transaction(async (tx) => {
          await tx.query('SET LOCAL ROLE authenticated');
          await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub: userA }),
          ]);
          await tx.query(
            "INSERT INTO groceries.receipts(id,image_key,image_mime,image_sha256) VALUES(gen_random_uuid(),'forged','image/png','fake')",
          );
        }),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        t.raw.transaction(async (tx) => {
          await tx.query('SET LOCAL ROLE authenticated');
          await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub: userA }),
          ]);
          await tx.query(
            "INSERT INTO storage.objects(bucket_id,name) VALUES('grocery-receipts',$1)",
            [`${userA}/forged/photo`],
          );
        }),
      /row-level security/,
    );
    const {
      rows: [bucket],
    } = await t.raw.query(
      "SELECT * FROM storage.buckets WHERE id='grocery-receipts'",
    );
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 26214400);
  } finally {
    await t.close();
  }
});
