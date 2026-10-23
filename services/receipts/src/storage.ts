import { createClient } from '@supabase/supabase-js';
import type { Config } from './config.ts';
export interface Storage {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  signedUrl(key: string): Promise<string>;
}
export function storage(config: Config): Storage {
  const client = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const bucket = client.storage.from('grocery-receipts');
  return {
    async put(key, data, mime) {
      // Content-addressed keys + no upsert keep original objects immutable.
      const { error } = await bucket.upload(key, data, {
        contentType: mime,
        upsert: false,
      });
      if (
        error &&
        !['409', '400'].includes(
          String((error as { statusCode?: string }).statusCode),
        )
      )
        throw error;
      if (error) {
        // Storage reports duplicate objects as 400/409. Verify the bytes before accepting a retry.
        const { data: existing, error: readError } = await bucket.download(key);
        if (
          readError ||
          !existing ||
          !Buffer.from(await existing.arrayBuffer()).equals(data)
        )
          throw error;
      }
    },
    async get(key) {
      const { data, error } = await bucket.download(key);
      if (error || !data) throw error ?? new Error('Receipt image missing');
      return Buffer.from(await data.arrayBuffer());
    },
    async signedUrl(key) {
      const { data, error } = await bucket.createSignedUrl(key, 300);
      if (error || !data)
        throw error ?? new Error('Could not open receipt image');
      return data.signedUrl;
    },
  };
}
