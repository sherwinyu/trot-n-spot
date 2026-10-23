import { randomUUID } from 'node:crypto';
import { extractionSchema } from '@bowl/shared';
import type { DB } from './db.ts';
import type { Storage } from './storage.ts';
import type { Extractor } from './extraction.ts';
import { persist } from './receipts.ts';

export async function processOne(
  db: DB,
  storage: Storage,
  extract: Extractor,
): Promise<boolean> {
  // Consistent receipt→job lock order with editing and reprocessing. Token fences late workers.
  const claim = await db.transaction(async (tx) => {
    const {
      rows: [receipt],
    } =
      await tx.query(`SELECT r.* FROM receipts r JOIN jobs j ON j.receipt_id=r.id
      WHERE j.available_at<=now() AND (j.lease_until IS NULL OR j.lease_until<now())
      ORDER BY j.available_at FOR UPDATE OF r SKIP LOCKED LIMIT 1`);
    if (!receipt) return null;
    const token = randomUUID();
    const {
      rows: [job],
    } = await tx.query(
      `UPDATE jobs SET lease_token=$2,lease_until=now()+interval '5 minutes',attempt_count=attempt_count+1 WHERE receipt_id=$1 RETURNING *`,
      [receipt.id, token],
    );
    await tx.query(
      "UPDATE receipts SET status='processing',updated_at=now() WHERE id=$1",
      [receipt.id],
    );
    return { ...receipt, token, attempt: job.attempt_count };
  });
  if (!claim) return false;
  try {
    const output = await extract(
      await storage.get(claim.image_key),
      claim.image_mime,
    );
    const data = extractionSchema.parse(output.data);
    await db.transaction(async (tx) => {
      await tx.query('SELECT id FROM receipts WHERE id=$1 FOR UPDATE', [
        claim.id,
      ]);
      const {
        rows: [job],
      } = await tx.query(
        'SELECT * FROM jobs WHERE receipt_id=$1 AND lease_token=$2',
        [claim.id, claim.token],
      );
      if (!job) return; // A manual correction/retry or another worker superseded this result.
      await persist(tx, claim.id, data, 'model', output.raw);
      await tx.query(
        'DELETE FROM jobs WHERE receipt_id=$1 AND lease_token=$2',
        [claim.id, claim.token],
      );
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : 'Extraction failed';
    await db.transaction(async (tx) => {
      await tx.query('SELECT id FROM receipts WHERE id=$1 FOR UPDATE', [
        claim.id,
      ]);
      const {
        rows: [job],
      } = await tx.query(
        'SELECT * FROM jobs WHERE receipt_id=$1 AND lease_token=$2',
        [claim.id, claim.token],
      );
      if (!job) return;
      if (claim.attempt >= 3) {
        await tx.query('DELETE FROM jobs WHERE receipt_id=$1', [claim.id]);
        await tx.query(
          "UPDATE receipts SET status='failed',last_error=$2,updated_at=now() WHERE id=$1",
          [claim.id, message],
        );
      } else {
        await tx.query(
          `UPDATE jobs SET lease_token=NULL,lease_until=NULL,available_at=now()+($2 * interval '1 second'),last_error=$3 WHERE receipt_id=$1`,
          [claim.id, 15 * 2 ** (claim.attempt - 1), message],
        );
        await tx.query(
          "UPDATE receipts SET status='pending',last_error=$2,updated_at=now() WHERE id=$1",
          [claim.id, message],
        );
      }
    });
  }
  return true;
}
