import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminRejectRooftopDto {
  @ApiPropertyOptional({ example: 'No se pudo verificar terraza o jardín en el perfil.' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason?: string;
}

export class AdminRejectRooftopPackageDto {
  @ApiProperty({ example: 'La imagen no muestra el paquete claramente.' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
