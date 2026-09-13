import { z } from 'zod';

export const money = z.number().int().min(-100_000_000).max(100_000_000);
const decimal = z
  .string()
  .regex(/^-?\d{1,8}(\.\d{1,6})?$/)
  .nullable();
export const lineSchema = z.object({
  merchant_item_code: z.string().max(100).nullable(),
  raw_description: z.string().max(1000),
  normalized_description: z.string().max(1000).nullable(),
  category: z.enum(['produce', 'other']).nullable(),
  quantity: decimal,
  unit: z.enum(['each', 'lb', 'oz', 'kg', 'g']).nullable(),
  unit_price_cents: money.nullable(),
  extended_price_cents: money.nullable(),
  line_discount_cents: money.nullable(),
  raw_line: z.string().max(3000).nullable(),
});
export const extractionSchema = z.object({
  merchant: z.string().max(200).nullable(),
  store_location: z.string().max(500).nullable(),
  purchased_at: z.iso.date().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  subtotal_cents: money.nullable(),
  tax_cents: money.nullable(),
  discounts_cents: money.nullable(),
  fees_cents: money.nullable(),
  total_cents: money.nullable(),
  line_items: z.array(lineSchema).max(500),
});
export type Extraction = z.infer<typeof extractionSchema>;
export type LineItem = z.infer<typeof lineSchema>;
export const statuses = [
  'pending',
  'processing',
  'processed',
  'needs_review',
  'failed',
] as const;
export type Status = (typeof statuses)[number];
export type Receipt = Omit<Extraction, 'line_items'> & {
  id: string;
  status: Status;
  item_count: number;
  created_at: string;
  updated_at: string;
  revision: number;
  reconciliation_delta_cents: number | null;
  reconciliation_reason: string | null;
  last_error: string | null;
};
export type ReceiptDetail = Receipt & {
  line_items: (LineItem & { id?: string; line_index?: number })[];
  raw_extraction: unknown;
  attempts: { created_at: string; source: string; raw_extraction: unknown }[];
};
export type Product = {
  key: string;
  merchant: string;
  code: string | null;
  name: string;
  unit: string | null;
  visits: number;
  spend_cents: number;
  pounds: number;
  aliases: string[];
};
export type Observation = {
  receipt_id: string;
  purchased_at: string | null;
  unit_price_cents: number | null;
  extended_price_cents: number | null;
  quantity: string | null;
  unit: string | null;
  raw_description: string;
};
export type Stats = {
  spend_cents: number;
  visits: number;
  average_basket_cents: number;
  line_items: number;
  produce_pounds: number;
  review_included: number;
  excluded_currency: number;
  undated_receipts: number;
  months: { period: string; spend_cents: number; visits: number }[];
  products: Product[];
};

/** Printed extended prices are NET of line discounts. Receipt discounts are additional. */
export function reconcile(receipt: Extraction): {
  delta: number | null;
  reason: string | null;
  status: 'processed' | 'needs_review';
} {
  if (
    receipt.total_cents === null ||
    receipt.line_items.length === 0 ||
    receipt.line_items.some((l) => l.extended_price_cents === null)
  ) {
    return {
      delta: null,
      reason: 'Missing total or line amounts',
      status: 'needs_review',
    };
  }
  const lineSum = receipt.line_items.reduce(
    (s, l) => s + l.extended_price_cents!,
    0,
  );
  const expected =
    lineSum +
    (receipt.tax_cents ?? 0) +
    (receipt.fees_cents ?? 0) -
    (receipt.discounts_cents ?? 0);
  const delta = expected - receipt.total_cents;
  return {
    delta,
    reason:
      Math.abs(delta) <= 2
        ? null
        : 'Items + tax + fees − receipt discounts differ from total',
    status: Math.abs(delta) <= 2 ? 'processed' : 'needs_review',
  };
}
export function dollars(
  cents: number | null | undefined,
  currency = 'USD',
): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    cents / 100,
  );
}
/** Input conversion is exact; never parse a dollar string with parseFloat. */
export function parseMoney(value: string): number | null {
  if (!value.trim()) return null;
  const match = /^(-?)(\d{1,6})(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!match)
    throw new Error('Use a dollar amount with at most two decimal places.');
  return (
    (match[1] ? -1 : 1) *
    (Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0')))
  );
}
export function editMoney(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}
