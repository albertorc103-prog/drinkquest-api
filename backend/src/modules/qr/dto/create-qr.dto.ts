import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class CreateQrDto {
  @ApiPropertyOptional({ description: 'UUID remoto (app sincronizada)' })
  @ValidateIf((o) => !o.legacyDrinkId)
  @IsUUID()
  drinkId?: string;

  @ApiPropertyOptional({ description: 'ID catálogo Room/Android (1-100)' })
  @ValidateIf((o) => !o.drinkId)
  @IsInt()
  legacyDrinkId?: number;
}
