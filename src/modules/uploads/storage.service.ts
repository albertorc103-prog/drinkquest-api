import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { buildPublicObjectUrl, resolvePublicObjectBase } from './utils/minio-url.util';

function buildS3Endpoint(useSsl: boolean, host: string, port: number): string {
  const protocol = useSsl ? 'https' : 'http';
  const defaultPort = useSsl ? 443 : 80;
  if (port === defaultPort) return `${protocol}://${host}`;
  return `${protocol}://${host}:${port}`;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly storageMisconfiguredForClients: boolean;

  constructor(config: ConfigService) {
    const useSsl = config.get<boolean>('minio.useSsl');
    const endpoint = config.get<string>('minio.endpoint');
    const port = config.get<number>('minio.port');
    const region = config.get<string>('minio.region', 'auto');
    this.bucket = config.get<string>('minio.bucket', 'drinkquest');
    this.publicUrl = config.get<string>('minio.publicUrl', '').replace(/\/$/, '');
    this.storageMisconfiguredForClients =
      config.get<boolean>('minio.storageMisconfiguredForClients') === true;

    this.client = new S3Client({
      region,
      endpoint: buildS3Endpoint(useSsl === true, endpoint ?? 'localhost', port ?? 9000),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>('minio.accessKey', ''),
        secretAccessKey: config.get<string>('minio.secretKey', ''),
      },
    });
  }

  private assertStorageReady(): void {
    if (this.storageMisconfiguredForClients) {
      throw new ServiceUnavailableException(
        'Almacenamiento de imágenes no configurado en el servidor. En Render define MINIO_ENDPOINT, MINIO_PUBLIC_URL (HTTPS), MINIO_USE_SSL=true y credenciales S3/R2.',
      );
    }
  }

  private cacheControlForFolder(folder: string): string {
    switch (folder) {
      case 'avatars':
        return 'public, max-age=86400';
      case 'feed':
      case 'chat':
      case 'promotions':
        return 'public, max-age=604800, immutable';
      case 'drinks':
        return 'public, max-age=31536000, immutable';
      default:
        return 'public, max-age=86400';
    }
  }

  private buildObjectKey(
    folder: string,
    contentType: string,
    ownerUserId?: string,
    extension?: string,
  ): string {
    const ext = extension ?? this.extensionFromContentType(contentType);
    const safeFolder = folder.replace(/[^a-z0-9_-]/gi, '');
    if (!safeFolder || safeFolder.includes('..')) {
      throw new ServiceUnavailableException('Carpeta de almacenamiento inválida.');
    }
    const owner = (ownerUserId ?? 'anon').replace(/[^a-zA-Z0-9-]/g, '');
    return `${safeFolder}/${owner}/${randomUUID()}.${ext}`;
  }

  private extensionFromContentType(contentType: string): string {
    const mime = contentType.toLowerCase();
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('wav')) return 'wav';
    if (
      mime.includes('mpeg') ||
      mime.includes('mp4') ||
      mime.includes('m4a') ||
      mime.includes('aac') ||
      mime.includes('x-m4a')
    ) {
      return 'm4a';
    }
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    return 'bin';
  }

  async uploadObject(
    folder: string,
    body: Buffer,
    contentType: string,
    ownerUserId?: string,
  ): Promise<{ key: string; publicUrl: string }> {
    this.assertStorageReady();
    const key = this.buildObjectKey(folder, contentType, ownerUserId);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: this.cacheControlForFolder(folder),
        }),
      );
    } catch (err) {
      throw new ServiceUnavailableException(
        'No se pudo guardar la imagen en el almacenamiento. Verifica MINIO_* en el servidor.',
        { cause: err instanceof Error ? err : undefined },
      );
    }
    const publicObjectUrl = buildPublicObjectUrl(this.publicUrl, this.bucket, key);
    return { key, publicUrl: publicObjectUrl };
  }

  /** Extrae la object key de una URL pública propia; null si no pertenece a este storage. */
  tryExtractObjectKey(urlOrKey: string | null | undefined): string | null {
    if (!urlOrKey?.trim()) return null;
    const raw = urlOrKey.trim();
    if (!/^https?:\/\//i.test(raw)) {
      if (/^(avatars|feed|chat|promotions|drinks)\//.test(raw)) return raw.replace(/^\//, '');
      return null;
    }
    try {
      const base = resolvePublicObjectBase(this.publicUrl, this.bucket).replace(/\/$/, '');
      if (!raw.startsWith(`${base}/`)) return null;
      const key = raw.slice(base.length + 1).split('?')[0];
      if (!key || key.includes('..')) return null;
      return key;
    } catch {
      return null;
    }
  }

  /** Best-effort: no lanza si el storage falla (la DB ya habrá limpiado referencias). */
  async deleteObjectsBestEffort(
    keys: Iterable<string>,
  ): Promise<{ deleted: number; failed: number }> {
    const unique = [...new Set([...keys].map((k) => k.trim()).filter(Boolean))];
    if (unique.length === 0) return { deleted: 0, failed: 0 };
    if (this.storageMisconfiguredForClients) {
      this.logger.warn(
        JSON.stringify({ event: 'storage_delete_skipped_misconfigured', count: unique.length }),
      );
      return { deleted: 0, failed: unique.length };
    }
    let deleted = 0;
    let failed = 0;
    for (const key of unique) {
      try {
        await this.client.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
          }),
        );
        deleted += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(
          JSON.stringify({
            event: 'storage_delete_failed',
            folder: key.split('/')[0] ?? 'unknown',
            message: err instanceof Error ? err.message : 'unknown',
          }),
        );
      }
    }
    return { deleted, failed };
  }
}
