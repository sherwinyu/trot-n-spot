import type { DB } from './db.ts';
const eligible = `r.status IN ('processed','needs_review') AND r.currency='USD'`;
// Unit is part of identity to prevent comparing $/each with $/lb. Codes remain candidate identities.
const key = `jsonb_build_array(coalesce(r.merchant,''),CASE WHEN l.merchant_item_code IS NOT NULL THEN 'code' ELSE 'description' END,coalesce(l.merchant_item_code,lower(trim(l.raw_description))),coalesce(l.unit,''))::text`;
const pounds = `CASE WHEN l.category='produce' THEN CASE l.unit WHEN 'lb' THEN l.quantity WHEN 'oz' THEN l.quantity/16 WHEN 'kg' THEN l.quantity*2.20462262185 WHEN 'g' THEN l.quantity*0.00220462262185 ELSE 0 END ELSE 0 END`;
const num = (v: any) => Number(v ?? 0);
export async function stats(
  db: DB,
  period: 'week' | 'month' | 'year' = 'month',
) {
  const {
    rows: [summary],
  } =
    await db.query(`SELECT coalesce(sum(total_cents),0)::text AS spend_cents,count(*)::int AS visits,
    count(*) FILTER(WHERE status='needs_review')::int AS review_included,
    count(*) FILTER(WHERE purchased_at IS NULL)::int AS undated_receipts
    FROM receipts r WHERE ${eligible}`);
  const {
    rows: [items],
  } =
    await db.query(`SELECT count(*)::int AS line_items,coalesce(sum(${pounds}),0)::text AS produce_pounds
    FROM receipt_line_items l JOIN receipts r ON r.id=l.receipt_id WHERE ${eligible}`);
  const {
    rows: [excluded],
  } = await db.query(
    `SELECT count(*)::int AS excluded_currency FROM receipts r WHERE r.status IN ('processed','needs_review') AND (r.currency IS NULL OR r.currency<>'USD')`,
  );
  const { rows: months } = await db.query(
    `SELECT to_char(date_trunc($1,purchased_at),'YYYY-MM-DD') AS period,sum(total_cents)::text AS spend_cents,count(*)::int AS visits
    FROM receipts r WHERE ${eligible} AND purchased_at IS NOT NULL GROUP BY 1 ORDER BY 1`,
    [period],
  );
  const { rows: products } =
    await db.query(`SELECT ${key} AS key,coalesce(r.merchant,'Unknown store') AS merchant,l.merchant_item_code AS code,
    min(coalesce(l.normalized_description,l.raw_description)) AS name,l.unit,count(DISTINCT r.id)::int AS visits,
    coalesce(sum(l.extended_price_cents),0)::text AS spend_cents,coalesce(sum(${pounds}),0)::text AS pounds,
    array_agg(DISTINCT l.raw_description) AS aliases
    FROM receipt_line_items l JOIN receipts r ON r.id=l.receipt_id WHERE ${eligible}
    GROUP BY 1,2,3,l.unit ORDER BY visits DESC,sum(l.extended_price_cents) DESC NULLS LAST LIMIT 100`);
  return {
    ...summary,
    ...items,
    ...excluded,
    spend_cents: num(summary.spend_cents),
    average_basket_cents: summary.visits
      ? Math.round(num(summary.spend_cents) / summary.visits)
      : 0,
    produce_pounds: num(items.produce_pounds),
    months: months.map((m) => ({ ...m, spend_cents: num(m.spend_cents) })),
    products: products.map((p) => ({
      ...p,
      spend_cents: num(p.spend_cents),
      pounds: num(p.pounds),
    })),
  };
}
export async function observations(db: DB, productKey: string) {
  const { rows } = await db.query(
    `SELECT r.id AS receipt_id,to_char(r.purchased_at,'YYYY-MM-DD') AS purchased_at,
    l.unit_price_cents,l.extended_price_cents,l.quantity,l.unit,l.raw_description
    FROM receipt_line_items l JOIN receipts r ON r.id=l.receipt_id
    WHERE ${eligible} AND ${key}=$1 ORDER BY r.purchased_at NULLS LAST,r.created_at,l.line_index`,
    [productKey],
  );
  return rows;
}
