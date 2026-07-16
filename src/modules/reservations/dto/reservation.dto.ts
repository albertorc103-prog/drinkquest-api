import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReservationDto {
  @ApiProperty()
  @IsUUID()
  barId!: string;

  @ApiProperty({ example: 'Ana López' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  guestName!: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  partySize!: number;

  @ApiProperty({ description: 'Fecha/hora ISO de la reserva' })
  @IsDateString()
  reservedFor!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class BarReservationActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  barResponse?: string;
}
