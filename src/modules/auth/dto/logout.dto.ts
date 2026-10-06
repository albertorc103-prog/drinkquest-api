import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LogoutDto {
  @ApiProperty({ description: 'Refresh token de la sesión a cerrar' })
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;

  @ApiPropertyOptional({
    description: 'Refresh de la sesión actual (se rota; el resto se revoca).',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  refreshToken?: string;
}
