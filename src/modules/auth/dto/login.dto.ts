import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthLoginIntent } from '../enums/auth-login-intent.enum';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  /**
   * Opcional (app unificada). Si se omite, el servidor autentica y
   * emite tokens con el rol real sin validar intent vs UI.
   * Si se envía (clientes antiguos / Swagger), se mantiene la validación.
   */
  @ApiPropertyOptional({
    enum: AuthLoginIntent,
    description:
      'Opcional. USER/BAR solo para clientes legacy. Sin intent = login unificado por rol real.',
    example: AuthLoginIntent.USER,
  })
  @IsOptional()
  @IsEnum(AuthLoginIntent)
  intent?: AuthLoginIntent;
}
