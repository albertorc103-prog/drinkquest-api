import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Roles permitidos en registro público (nunca ADMIN / SUPER_ADMIN). */
export const PUBLIC_REGISTER_ROLES = ['USER', 'BAR'] as const;
export type PublicRegisterRole = (typeof PUBLIC_REGISTER_ROLES)[number];

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Alex Explorer' })
  @IsString()
  @MinLength(2)
  displayName!: string;

  @ApiPropertyOptional({
    enum: PUBLIC_REGISTER_ROLES,
    default: 'USER',
    description: 'Solo USER o BAR. ADMIN/SUPER_ADMIN no se permiten en registro público.',
  })
  @IsOptional()
  @IsIn(PUBLIC_REGISTER_ROLES, {
    message: 'El rol de registro solo puede ser USER o BAR.',
  })
  role?: PublicRegisterRole;

  @ApiPropertyOptional({ example: 'La Jarra Cocktail Bar' })
  @IsOptional()
  @IsString()
  businessName?: string;

  /**
   * Obligatorio para role USER.
   * YYYY-MM-DD — solo para comprobar mayoría de edad; NO se persiste.
   */
  @ApiPropertyOptional({
    example: '2000-05-15',
    description:
      'Fecha de nacimiento (AAAA-MM-DD). Solo se usa para verificar ≥18 años y no se almacena.',
  })
  @ValidateIf((o: RegisterDto) => (o.role ?? 'USER') === 'USER')
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'birthDate debe tener formato AAAA-MM-DD',
  })
  birthDate?: string;

  /**
   * Obligatorio para role BAR: declaración explícita de mayoría de edad del responsable.
   * No sustituye DOB de USER; no se acepta isAdult como bypass de birthDate.
   */
  @ApiPropertyOptional({
    example: true,
    description: 'Confirmación de que el responsable del negocio es mayor de 18 años (solo BAR).',
  })
  @ValidateIf((o: RegisterDto) => o.role === 'BAR')
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @Equals(true, {
    message: 'Debes confirmar que eres mayor de 18 años para registrar un negocio.',
  })
  adultConfirmed?: boolean;
}
