import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { Config } from './config.ts';
export interface Storage {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}
export function storage(config: Config): Storage {
  if (config.STORAGE_DRIVER === 'local')
    return {
      async put(key, data) {
        await mkdir(config.STORAGE_DIR, { recursive: true });
        await writeFile(join(config.STORAGE_DIR, key), data);
      },
      get: (key) => readFile(join(config.STORAGE_DIR, key)),
    };
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: !!config.S3_ENDPOINT,
  });
  return {
    async put(key, data, mime) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: key,
          Body: data,
          ContentType: mime,
        }),
      );
    },
    async get(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
      );
      if (!result.Body) throw new Error('Image missing');
      return Buffer.from(await result.Body.transformToByteArray());
    },
  };
}
