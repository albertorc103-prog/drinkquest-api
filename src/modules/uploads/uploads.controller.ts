import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StorageService } from './storage.service';

const UPLOAD_FOLDERS = ['avatars', 'chat', 'feed', 'drinks', 'promotions'] as const;
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
@SkipThrottle()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly storage: StorageService) {}

  @Post('direct')
  @ApiOperation({
    summary: 'Sube imagen vía API (multipart → R2/S3). Usado por la app móvil.',
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
    @UploadedFile() file: { buffer: Buffer; mimetype?: string } | undefined,
    @Body('folder') folderRaw: string,
  ) {
    const folder = assertUploadFolder(folderRaw);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo requerido (campo file).');
    }
    const rawMime = (file.mimetype ?? '').toLowerCase();
    const isImage = /^image\/(jpeg|jpg|png|webp)$/i.test(rawMime);
    const isAudio =
      folder === 'chat' &&
      (/^audio\/(mp4|m4a|aac|mpeg|ogg|webm|x-m4a|wav)$/i.test(rawMime) ||
        rawMime === 'audio/mp4');
    if (!isImage && !isAudio) {
      throw new BadRequestException(
        folder === 'chat'
          ? 'Solo imágenes (JPEG/PNG/WebP) o audio (M4A/AAC/OGG/WebM) en chat.'
          : 'Solo se permiten imágenes JPEG, PNG o WebP.',
      );
    }
    const contentType = isAudio
      ? rawMime || 'audio/mp4'
      : rawMime.startsWith('image/')
        ? rawMime
        : 'image/jpeg';
    const result = await this.storage.uploadObject(folder, file.buffer, contentType);
    this.logger.log(
      JSON.stringify({
        event: 'upload_direct_saved',
        folder,
        key: result.key,
        publicUrl: result.publicUrl,
        bytes: file.buffer.length,
        contentType,
      }),
    );
    return result;
  }
}
