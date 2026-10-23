import { createClient } from '@supabase/supabase-js';
export type Authenticate = (accessToken: string) => Promise<string | null>;
export function supabaseAuth(url: string, key: string): Authenticate {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (token) => {
    // getUser validates with this project's Auth server; never trust decoded claims.
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  };
}
