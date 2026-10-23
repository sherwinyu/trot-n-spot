-- Receipt data is deliberately outside the exposed public/Data API schema.
-- API requests use this non-login role plus a verified Supabase user ID.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'receipts_api') THEN
    CREATE ROLE receipts_api NOLOGIN NOINHERIT;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'receipts_api' AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolinherit)) THEN
    RAISE EXCEPTION 'receipts_api must be a non-login, non-inheriting role without RLS bypass';
  END IF;
END $$;
GRANT receipts_api TO postgres;
CREATE SCHEMA groceries;
REVOKE ALL ON SCHEMA groceries FROM PUBLIC;
GRANT USAGE ON SCHEMA groceries TO authenticated, receipts_api;
GRANT USAGE ON SCHEMA auth TO receipts_api;
GRANT EXECUTE ON FUNCTION auth.uid() TO receipts_api;
CREATE TABLE groceries.receipts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE TABLE groceries.receipt_line_items (
  id uuid PRIMARY KEY, receipt_id uuid NOT NULL REFERENCES groceries.receipts(id) ON DELETE CASCADE,
  line_index integer NOT NULL, merchant_item_code text, raw_description text NOT NULL,
  normalized_description text, category text, quantity numeric(16,6), unit text,
  unit_price_cents integer, extended_price_cents integer, line_discount_cents integer, raw_line text,
  UNIQUE(receipt_id,line_index)
);
CREATE TABLE groceries.jobs (
  receipt_id uuid PRIMARY KEY REFERENCES groceries.receipts(id) ON DELETE CASCADE,
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
  last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE groceries.extraction_attempts (
  id uuid PRIMARY KEY, receipt_id uuid NOT NULL REFERENCES groceries.receipts(id) ON DELETE CASCADE,
  source text NOT NULL, raw_extraction jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receipt_history_idx ON groceries.receipts (user_id, purchased_at DESC, created_at DESC);
CREATE INDEX receipt_status_idx ON groceries.receipts(user_id,status);
CREATE INDEX item_code_idx ON groceries.receipt_line_items(merchant_item_code);
CREATE INDEX ready_jobs_idx ON groceries.jobs(available_at,lease_until);

CREATE INDEX attempts_receipt_idx ON groceries.extraction_attempts(receipt_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA groceries TO receipts_api;
GRANT SELECT ON groceries.receipts, groceries.receipt_line_items, groceries.extraction_attempts TO authenticated;
ALTER TABLE groceries.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_receipts ON groceries.receipts TO authenticated, receipts_api
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
ALTER TABLE groceries.receipt_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_receipt_line_items ON groceries.receipt_line_items TO authenticated, receipts_api
  USING (EXISTS (SELECT 1 FROM groceries.receipts r WHERE r.id = receipt_id AND r.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM groceries.receipts r WHERE r.id = receipt_id AND r.user_id = (SELECT auth.uid())));
ALTER TABLE groceries.extraction_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_extraction_attempts ON groceries.extraction_attempts TO authenticated, receipts_api
  USING (EXISTS (SELECT 1 FROM groceries.receipts r WHERE r.id = receipt_id AND r.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM groceries.receipts r WHERE r.id = receipt_id AND r.user_id = (SELECT auth.uid())));
ALTER TABLE groceries.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_jobs ON groceries.jobs TO authenticated, receipts_api
  USING (EXISTS (SELECT 1 FROM groceries.receipts r WHERE r.id = receipt_id AND r.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM groceries.receipts r WHERE r.id = receipt_id AND r.user_id = (SELECT auth.uid())));

-- Original bytes are uploaded by the trusted API, never overwritten by clients.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('grocery-receipts','grocery-receipts',false,26214400,
  ARRAY['image/jpeg','image/png','image/webp','image/heic']);
CREATE POLICY grocery_originals_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'grocery-receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
