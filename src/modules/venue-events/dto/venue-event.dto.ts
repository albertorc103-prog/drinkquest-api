import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateVenueEventDto {
  @ApiProperty({ example: 'Noche de jazz en la terraza' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'URL pública de imagen del evento' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, { message: 'imageUrl debe ser una URL http(s) válida' })
  imageUrl?: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;
}

export class UpdateVenueEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, { message: 'imageUrl debe ser una URL http(s) válida' })
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class ActivateVenueEventDto {
  @ApiProperty({
    description: 'Debe ser true: el bar acepta las políticas de publicidad antes de publicar',
  })
  @IsBoolean()
  policiesAccepted!: boolean;
}

export class AdminRemoveVenueEventDto {
  @ApiProperty({ example: 'Incentiva consumo excesivo de alcohol' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
