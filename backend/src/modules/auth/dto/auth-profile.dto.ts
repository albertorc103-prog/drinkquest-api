import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileVisibility } from '@prisma/client';

/** Perfil seguro para sesión autenticada (sin passwordHash ni tokens). */
export class AuthProfileDto {
  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional()
  bio?: string | null;

  @ApiPropertyOptional()
  avatarUrl?: string | null;

  @ApiProperty({ enum: ProfileVisibility })
  profileVisibility!: ProfileVisibility;

  @ApiProperty()
  totalXp!: number;

  @ApiProperty()
  level!: number;

  @ApiProperty()
  emailVerified!: boolean;
}
