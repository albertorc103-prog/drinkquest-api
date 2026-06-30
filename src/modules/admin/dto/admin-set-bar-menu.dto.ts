import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsUUID, ValidateNested } from 'class-validator';

export class AdminSetBarMenuItemDto {
  @IsUUID()
  drinkId!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;
}

export class AdminSetBarMenuDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminSetBarMenuItemDto)
  items!: AdminSetBarMenuItemDto[];
}
