import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { buildPublicObjectUrl } from './utils/minio-url.util';

function buildS3Endpoint(useSsl: boolean, host: string, port: number): string {
  const protocol = useSsl ? 'https' : 'http';
  const defaultPort = useSsl ? 443 : 80;
  if (port === defaultPort) return `${protocol}://${host}`;
  return `${protocol}://${host}:${port}`;
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly publicObjectBase: string;
  private readonly storageMisconfiguredForClients: boolean;

  constructor(config: ConfigService) {
    const useSsl = config.get<boolean>('minio.useSsl');
    const endpoint = config.get<string>('minio.endpoint');
    const port = config.get<number>('minio.port');
    const region = config.get<string>('minio.region', 'auto');
    this.bucket = config.get<string>('minio.bucket', 'drinkquest');
    this.publicUrl = config.get<string>('minio.publicUrl', '').replace(/\/$/, '');
    this.publicObjectBase =
      config.get<string>('minio.publicObjectBase') ??
      this.publicUrl;
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

  private buildObjectKey(folder: string, contentType: string, extension?: string): string {
    const ext = extension ?? (contentType.includes('png') ? 'png' : 'jpg');
    return `${folder}/${randomUUID()}.${ext}`;
  }

  async uploadObject(folder: string, body: Buffer, contentType: string): Promise<{ key: string; publicUrl: string }> {
    this.assertStorageReady();
    const key = this.buildObjectKey(folder, contentType);
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

}
