import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class CreateQrDto {
  @ApiPropertyOptional({ description: 'UUID remoto (app sincronizada)' })
  @ValidateIf((o) => !o.legacyDrinkId && !o.specialDrinkId)
  @IsUUID()
  drinkId?: string;

  @ApiPropertyOptional({ description: 'ID catálogo Room/Android (1-100)' })
  @ValidateIf((o) => !o.drinkId && !o.specialDrinkId)
  @IsInt()
  legacyDrinkId?: number;

  @ApiPropertyOptional({
    description: 'UUID de bebida especializada aprobada del bar (plan Intermedio/Legend)',
  })
  @ValidateIf((o) => !o.drinkId && !o.legacyDrinkId)
  @IsUUID()
  specialDrinkId?: string;
}
