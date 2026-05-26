import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StorageService } from './storage.service';

class PresignDto {
  @IsIn(['avatars', 'chat', 'feed', 'drinks'])
  folder!: 'avatars' | 'chat' | 'feed' | 'drinks';

  @IsString()
  contentType!: string;
}

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post('presign')
  presign(@Body() dto: PresignDto) {
    const ext = dto.contentType.includes('png') ? 'png' : 'jpg';
    return this.storage.presignUpload(dto.folder, dto.contentType, ext);
  }
}
