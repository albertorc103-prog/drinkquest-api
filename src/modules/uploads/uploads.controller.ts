import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
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
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
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
      throw new BadRequestException('Archivo de imagen requerido (campo file).');
    }
    const contentType = file.mimetype?.startsWith('image/') ? file.mimetype : 'image/jpeg';
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(contentType)) {
      throw new BadRequestException('Solo se permiten imágenes JPEG, PNG o WebP.');
    }
    return this.storage.uploadObject(folder, file.buffer, contentType);
  }
}
