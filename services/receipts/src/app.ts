import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { extractionSchema, statuses } from '@bowl/shared';
import type { DB } from './db.ts';
import type { Storage } from './storage.ts';
import { detail, persist, receiptColumns } from './receipts.ts';
import { stats, observations } from './analytics.ts';

class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
const uuid = z.string().uuid();
const params = z.object({ id: uuid });
export function buildApp(
  db: DB,
  storage: Storage,
  token: string,
  origins: string[] = [],
) {
  if (token.length < 24)
    throw new Error('APP_TOKEN must contain at least 24 characters.');
  const app = Fastify({
    logger: { redact: ['req.headers.authorization'] },
    bodyLimit: 2 * 1024 * 1024,
  });
  app.register(cors, { origin: origins });
  app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS' || req.url === '/health') return;
    const supplied = createHash('sha256')
      .update(req.headers.authorization ?? '')
      .digest();
    const expected = createHash('sha256').update(`Bearer ${token}`).digest();
    if (!timingSafeEqual(supplied, expected))
      return reply.code(401).send({ error: 'Invalid app access token' });
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: 'Invalid input', details: error.issues });
    const known = error as { statusCode?: number; message?: string };
    const status =
      typeof known.statusCode === 'number' ? known.statusCode : 500;
    if (status >= 500) req.log.error(error);
    reply.code(status).send({
      error:
        status >= 500
          ? 'Server error. Your saved receipts are safe; try again.'
          : known.message,
    });
  });
  app.get('/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });
  app.get('/receipts', async (req) => {
    const query = z
      .object({
        status: z.enum(statuses).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(40),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const { rows } = await db.query(
      `SELECT ${receiptColumns} FROM receipts r WHERE ($1::text IS NULL OR status=$1)
      ORDER BY r.purchased_at DESC NULLS FIRST,r.created_at DESC,r.id DESC LIMIT $2 OFFSET $3`,
      [query.status ?? null, query.limit + 1, query.offset],
    );
    const { rows: counts } = await db.query(
      'SELECT status,count(*)::int AS count FROM receipts GROUP BY status',
    );
    return {
      receipts: rows
        .slice(0, query.limit)
        .map(
          ({ image_key, image_sha256, image_mime, raw_extraction, ...r }) => r,
        ),
      has_more: rows.length > query.limit,
      counts: Object.fromEntries(counts.map((r) => [r.status, r.count])),
    };
  });
  app.post('/receipts', async (req, reply) => {
    const id = uuid.parse(req.headers['idempotency-key']);
    const file = await req.file();
    if (!file) throw new HttpError(400, 'Attach one receipt image.');
    const buffer = await file.toBuffer();
    if (file.file.truncated)
      throw new HttpError(413, 'Receipt image exceeds 25 MB.');
    let format: string | undefined;
    try {
      format = (
        await sharp(buffer, { limitInputPixels: 80_000_000 }).metadata()
      ).format;
    } catch {
      throw new HttpError(
        415,
        'This image cannot be read. Please use a JPEG, PNG, WebP, or supported HEIC photo.',
      );
    }
    const mime = (
      {
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        heif: 'image/heic',
      } as Record<string, string>
    )[format ?? ''];
    if (!mime)
      throw new HttpError(
        415,
        'Unsupported receipt image format. Use JPEG, PNG, WebP, or HEIC.',
      );
    const hash = createHash('sha256').update(buffer).digest('hex');
    const key = `${id}-${hash}`;
    // Content-addressed key means concurrent retries can never overwrite another original.
    await storage.put(key, buffer, mime);
    await db.transaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO receipts(id,image_key,image_mime,image_sha256) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id`,
        [id, key, mime, hash],
      );
      if (rows.length)
        await tx.query('INSERT INTO jobs(receipt_id) VALUES($1)', [id]);
      else {
        const {
          rows: [existing],
        } = await tx.query('SELECT image_sha256 FROM receipts WHERE id=$1', [
          id,
        ]);
        if (existing.image_sha256 !== hash)
          throw new HttpError(
            409,
            'This upload ID belongs to a different image.',
          );
      }
    });
    return reply.code(202).send({ id, status: (await detail(db, id))!.status });
  });
  app.get('/receipts/:id', async (req) => {
    const { id } = params.parse(req.params);
    const receipt = await detail(db, id);
    if (!receipt) throw new HttpError(404, 'Receipt not found');
    return receipt;
  });
  app.get('/receipts/:id/image', async (req, reply) => {
    const { id } = params.parse(req.params);
    const {
      rows: [receipt],
    } = await db.query(
      'SELECT image_key,image_mime FROM receipts WHERE id=$1',
      [id],
    );
    if (!receipt) throw new HttpError(404, 'Receipt not found');
    const image = await storage.get(receipt.image_key);
    const preview = z
      .object({ preview: z.enum(['1']).optional() })
      .parse(req.query).preview;
    reply
      .header('Cache-Control', 'private, max-age=3600')
      .header('X-Content-Type-Options', 'nosniff');
    return preview
      ? reply
          .type('image/jpeg')
          .send(
            await sharp(image)
              .rotate()
              .resize({ width: 1600, withoutEnlargement: true })
              .jpeg({ quality: 85 })
              .toBuffer(),
          )
      : reply.type(receipt.image_mime).send(image);
  });
  app.patch('/receipts/:id', async (req) => {
    const { id } = params.parse(req.params);
    const { revision, data } = z
      .object({
        revision: z.number().int().nonnegative(),
        data: extractionSchema,
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const {
        rows: [receipt],
      } = await tx.query('SELECT * FROM receipts WHERE id=$1 FOR UPDATE', [id]);
      if (!receipt) throw new HttpError(404, 'Receipt not found');
      if (receipt.revision !== revision)
        throw new HttpError(
          409,
          'This receipt changed. Reload before editing.',
        );
      await tx.query('DELETE FROM jobs WHERE receipt_id=$1', [id]);
      await persist(tx, id, data, 'manual', data);
    });
    return detail(db, id);
  });
  app.post('/receipts/:id/reprocess', async (req, reply) => {
    const { id } = params.parse(req.params);
    const { revision } = z
      .object({ revision: z.number().int().nonnegative() })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const {
        rows: [receipt],
      } = await tx.query('SELECT * FROM receipts WHERE id=$1 FOR UPDATE', [id]);
      if (!receipt) throw new HttpError(404, 'Receipt not found');
      if (receipt.revision !== revision)
        throw new HttpError(
          409,
          'This receipt changed. Reload before reprocessing.',
        );
      await tx.query(
        `INSERT INTO jobs(receipt_id) VALUES($1) ON CONFLICT(receipt_id) DO UPDATE SET attempt_count=0,lease_until=NULL,lease_token=NULL,available_at=now(),last_error=NULL`,
        [id],
      );
      await tx.query(
        "UPDATE receipts SET status='pending',last_error=NULL,revision=revision+1,updated_at=now() WHERE id=$1",
        [id],
      );
    });
    return reply.code(202).send({ id, status: 'pending' });
  });
  app.get('/stats', async (req) => {
    const { period } = z
      .object({ period: z.enum(['week', 'month', 'year']).default('month') })
      .parse(req.query);
    return stats(db, period);
  });
  app.get('/products/history', async (req) => {
    const { key } = z
      .object({ key: z.string().min(1).max(3000) })
      .parse(req.query);
    return { observations: await observations(db, key) };
  });
  return app;
}
