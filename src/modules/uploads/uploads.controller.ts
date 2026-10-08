import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Logger,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from './storage.service';
import { detectUploadContent, UPLOAD_SIZE_LIMITS } from './upload-mime.util';

const UPLOAD_FOLDERS = ['avatars', 'chat', 'feed', 'drinks', 'promotions', 'medals'] as const;
type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

function assertUploadFolder(folder: string): UploadFolder {
  if (!UPLOAD_FOLDERS.includes(folder as UploadFolder)) {
    throw new BadRequestException(
      `folder must be one of the following values: ${UPLOAD_FOLDERS.join(', ')}`,
    );
  }
  return folder as UploadFolder;
}

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('direct')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Sube imagen/audio vía API (multipart → MinIO/R2). Object key generado en servidor.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        folder: { type: 'string', enum: [...UPLOAD_FOLDERS] },
        file: { type: 'string', format: 'binary' },
      },
      required: ['folder', 'file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async direct(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: { buffer: Buffer; mimetype?: string; originalname?: string } | undefined,
    @Body('folder') folderRaw: string,
    @Body('objectKey') objectKeyClient?: string,
    @Body('key') keyClient?: string,
  ) {
    // Cliente no elige object key / path.
    if (objectKeyClient || keyClient) {
      throw new BadRequestException('objectKey no permitido; el servidor genera la clave.');
    }
    const folder = assertUploadFolder(folderRaw);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo requerido (campo file).');
    }
    const maxBytes = UPLOAD_SIZE_LIMITS[folder] ?? 5 * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException(`Archivo excede el límite de ${maxBytes} bytes.`);
    }

    const detected = detectUploadContent(file.buffer, file.mimetype, folder);
    if (!detected.ok) {
      throw new BadRequestException(detected.reason);
    }

    const result = await this.storage.uploadObject(
      folder,
      file.buffer,
      detected.mime,
      user.sub,
    );

    const asset = await this.prisma.uploadAsset.create({
      data: {
        ownerUserId: user.sub,
        folder,
        objectKey: result.key,
        publicUrl: result.publicUrl,
        mimeType: detected.mime,
        sizeBytes: file.buffer.length,
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'upload_direct_saved',
        uploadOwnerHash: user.sub.slice(0, 8),
        folder,
        key: result.key,
        size: file.buffer.length,
        mime: detected.mime,
        status: 'ok',
      }),
    );
    return { id: asset.id, key: result.key, publicUrl: result.publicUrl };
  }

  @Delete(':uploadId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Elimina un upload propio (metadata + objeto MinIO).' })
  async deleteOwned(
    @CurrentUser() user: JwtPayload,
    @Param('uploadId') uploadId: string,
  ) {
    const asset = await this.prisma.uploadAsset.findUnique({
      where: { id: uploadId },
    });
    if (!asset) throw new NotFoundException('Upload no encontrado.');
    if (asset.ownerUserId !== user.sub) {
      throw new ForbiddenException('No puedes eliminar este archivo.');
    }
    await this.prisma.uploadAsset.delete({ where: { id: uploadId } });
    await this.storage.deleteObjectsBestEffort([asset.objectKey]);
    this.logger.log(
      JSON.stringify({
        event: 'upload_deleted',
        uploadId,
        uploadOwnerHash: user.sub.slice(0, 8),
        status: 'ok',
      }),
    );
    return { ok: true };
  }
}
