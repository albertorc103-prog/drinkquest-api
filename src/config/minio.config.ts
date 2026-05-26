import { registerAs } from '@nestjs/config';

export default registerAs('minio', () => ({
  endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
  useSsl: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin_secret',
  bucket: process.env.MINIO_BUCKET ?? 'drinkquest',
  publicUrl: process.env.MINIO_PUBLIC_URL ?? 'http://localhost:9000/drinkquest',
}));
