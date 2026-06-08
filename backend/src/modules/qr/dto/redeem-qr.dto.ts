import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsUUID } from 'class-validator';

export class RedeemQrDto {
  @ApiProperty()
  @IsUUID()
  sessionId!: string;

  @ApiProperty()
  @IsUUID()
  businessId!: string;

  @ApiProperty()
  @IsUUID()
  drinkId!: string;

  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty()
  @IsNumber()
  timestamp!: number;

  @ApiProperty()
  @IsNumber()
  expiresAt!: number;
}
