import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AdminMedalDesignProposalAssignDto {
  @ApiProperty({ description: 'UploadAsset.id (carpeta medals, subido por el admin)' })
  @IsUUID()
  artworkAssetId!: string;
}

export class AdminMedalDesignProposalPositionParam {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  position!: number;
}
