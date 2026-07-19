import { IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsOptional()
  @IsString()
  platform?: string;
}

export class UnregisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
