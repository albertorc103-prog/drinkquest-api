import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminRejectPromotionDto {
  @ApiProperty({ description: 'Motivo obligatorio de rechazo.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

