import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { AuthLoginIntent } from '../enums/auth-login-intent.enum';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    enum: AuthLoginIntent,
    description: 'USER = acceso cliente; BAR = panel de negocio',
    example: AuthLoginIntent.USER,
  })
  @IsEnum(AuthLoginIntent)
  intent!: AuthLoginIntent;
}
