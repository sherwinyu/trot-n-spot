import { z } from 'zod';
export function config() {
  return z
    .object({
      DATABASE_URL: z.string().min(1),
      APP_TOKEN: z.string().min(24),
      PORT: z.coerce.number().default(3001),
      STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
      STORAGE_DIR: z.string().default('./data/images'),
      S3_BUCKET: z.string().default('receipts'),
      S3_REGION: z.string().default('us-east-1'),
      S3_ENDPOINT: z.string().optional(),
      OPENAI_API_KEY: z.string().optional(),
      OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
      CORS_ORIGINS: z
        .string()
        .default('http://localhost:8081,http://localhost:8082'),
    })
    .parse(process.env);
}
export type Config = ReturnType<typeof config>;
