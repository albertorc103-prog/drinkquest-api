import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({ description: 'Token FCM del dispositivo' })
  @IsString()
  @MinLength(20)
  token!: string;

  @ApiPropertyOptional({ enum: ['android', 'ios'], default: 'android' })
  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}

export class UnregisterDeviceTokenDto {
  @ApiProperty({ description: 'Token FCM a eliminar' })
  @IsString()
  @MinLength(20)
  token!: string;
}
