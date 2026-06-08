import { registerAs } from '@nestjs/config';
import {
  isLocalhostHost,
  parseMinioPublicBase,
  resolvePublicObjectBase,
} from '../modules/uploads/utils/minio-url.util';

export default registerAs('minio', () => {
  const publicUrl = process.env.MINIO_PUBLIC_URL ?? 'http://localhost:9000/drinkquest';
  const parsed = parseMinioPublicBase(publicUrl);
  const endpoint = process.env.MINIO_ENDPOINT ?? parsed.hostname;
  const port = process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT, 10) : parsed.port;
  const useSsl =
    process.env.MINIO_USE_SSL === 'true' ||
    (process.env.MINIO_USE_SSL !== 'false' && parsed.useSsl);

  const bucket = process.env.MINIO_BUCKET ?? 'drinkquest';

  return {
    endpoint,
    port,
    useSsl,
    /** Cloudflare R2 usa 'auto'; AWS S3 puede usar us-east-1 u otra región. */
    region: process.env.MINIO_REGION ?? 'auto',
    accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin_secret',
    bucket,
    publicUrl,
    publicObjectBase: resolvePublicObjectBase(publicUrl, bucket),
    clientHostname: parsed.hostname,
    storageMisconfiguredForClients:
      process.env.NODE_ENV === 'production' && isLocalhostHost(parsed.hostname),
  };
});
