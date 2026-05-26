import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    const useSsl = config.get<boolean>('minio.useSsl');
    const endpoint = config.get<string>('minio.endpoint');
    const port = config.get<number>('minio.port');
    this.bucket = config.get<string>('minio.bucket', 'drinkquest');
    this.publicUrl = config.get<string>('minio.publicUrl', '');
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: `${useSsl ? 'https' : 'http'}://${endpoint}:${port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>('minio.accessKey', ''),
        secretAccessKey: config.get<string>('minio.secretKey', ''),
      },
    });
  }

  async presignUpload(folder: string, contentType: string, extension = 'jpg') {
    const key = `${folder}/${randomUUID()}.${extension}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 900 });
    const publicUrl = `${this.publicUrl}/${key}`;
    return { key, uploadUrl, publicUrl };
  }
}
