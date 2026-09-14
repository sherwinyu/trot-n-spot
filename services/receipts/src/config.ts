import { z } from 'zod';
export function config() {
  return z
    .object({
      DATABASE_URL: z.string().min(1),
      SUPABASE_URL: z.url(),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
      PORT: z.coerce.number().default(3001),
      OPENAI_API_KEY: z.string().optional(),
      OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
      CORS_ORIGINS: z
        .string()
        .default('http://localhost:8081,http://localhost:8082'),
    })
    .parse(process.env);
}
export type Config = ReturnType<typeof config>;
