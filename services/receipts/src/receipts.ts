import { randomUUID } from 'node:crypto';
import { reconcile, type Extraction } from '@bowl/shared';
import type { DB } from './db.ts';

export const receiptColumns = `r.*, to_char(r.purchased_at,'YYYY-MM-DD') AS purchased_at,
  (SELECT count(*)::int FROM receipt_line_items l WHERE l.receipt_id=r.id) AS item_count`;
export async function detail(db: DB, id: string) {
  const {
    rows: [receipt],
  } = await db.query(`SELECT ${receiptColumns} FROM receipts r WHERE id=$1`, [
    id,
  ]);
  if (!receipt) return null;
  const { rows: line_items } = await db.query(
    'SELECT * FROM receipt_line_items WHERE receipt_id=$1 ORDER BY line_index',
    [id],
  );
  const { rows: attempts } = await db.query(
    'SELECT source,raw_extraction,created_at FROM extraction_attempts WHERE receipt_id=$1 ORDER BY created_at DESC',
    [id],
  );
  const { image_key, image_sha256, image_mime, ...safe } = receipt;
  return { ...safe, line_items, attempts };
}
/** Caller must hold the receipt row lock inside a transaction. */
export async function persist(
  db: DB,
  id: string,
  data: Extraction,
  source: 'model' | 'manual',
  raw: unknown,
) {
  const check = reconcile(data);
  await db.query(
    `UPDATE receipts SET merchant=$2,store_location=$3,purchased_at=$4,currency=$5,
    subtotal_cents=$6,tax_cents=$7,discounts_cents=$8,fees_cents=$9,total_cents=$10,status=$11,
    reconciliation_delta_cents=$12,reconciliation_reason=$13,
    raw_extraction=CASE WHEN $14='model' THEN $15::jsonb ELSE raw_extraction END,
    revision=revision+1,last_error=NULL,updated_at=now() WHERE id=$1`,
    [
      id,
      data.merchant,
      data.store_location,
      data.purchased_at,
      data.currency,
      data.subtotal_cents,
      data.tax_cents,
      data.discounts_cents,
      data.fees_cents,
      data.total_cents,
      check.status,
      check.delta,
      check.reason,
      source,
      JSON.stringify(raw),
    ],
  );
  await db.query('DELETE FROM receipt_line_items WHERE receipt_id=$1', [id]);
  for (const [index, line] of data.line_items.entries()) {
    await db.query(
      `INSERT INTO receipt_line_items(id,receipt_id,line_index,merchant_item_code,raw_description,normalized_description,category,quantity,unit,unit_price_cents,extended_price_cents,line_discount_cents,raw_line)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        randomUUID(),
        id,
        index,
        line.merchant_item_code,
        line.raw_description,
        line.normalized_description,
        line.category,
        line.quantity,
        line.unit,
        line.unit_price_cents,
        line.extended_price_cents,
        line.line_discount_cents,
        line.raw_line,
      ],
    );
  }
  await db.query(
    'INSERT INTO extraction_attempts(id,receipt_id,source,raw_extraction) VALUES($1,$2,$3,$4)',
    [randomUUID(), id, source, JSON.stringify(raw)],
  );
}
