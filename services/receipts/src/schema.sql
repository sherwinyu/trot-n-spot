CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY,
  image_key text NOT NULL,
  image_mime text NOT NULL,
  image_sha256 text NOT NULL,
  merchant text, store_location text, purchased_at date, currency text,
  subtotal_cents integer, tax_cents integer, discounts_cents integer, fees_cents integer, total_cents integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','needs_review','failed')),
  reconciliation_delta_cents integer, reconciliation_reason text,
  raw_extraction jsonb, revision integer NOT NULL DEFAULT 0,
  last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS receipt_line_items (
  id uuid PRIMARY KEY, receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  line_index integer NOT NULL, merchant_item_code text, raw_description text NOT NULL,
  normalized_description text, category text, quantity numeric(16,6), unit text,
  unit_price_cents integer, extended_price_cents integer, line_discount_cents integer, raw_line text,
  UNIQUE(receipt_id,line_index)
);
CREATE TABLE IF NOT EXISTS jobs (
  receipt_id uuid PRIMARY KEY REFERENCES receipts(id) ON DELETE CASCADE,
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
  last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS extraction_attempts (
  id uuid PRIMARY KEY, receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  source text NOT NULL, raw_extraction jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipt_history_idx ON receipts (purchased_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS receipt_status_idx ON receipts(status);
CREATE INDEX IF NOT EXISTS item_code_idx ON receipt_line_items(merchant_item_code);
CREATE INDEX IF NOT EXISTS ready_jobs_idx ON jobs(available_at,lease_until);
