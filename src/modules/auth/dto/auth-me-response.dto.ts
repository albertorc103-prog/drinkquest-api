import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccountType } from '../permissions/account-type.enum';
import { AuthPermission } from '../permissions/auth-permission.enum';
import { AuthProfileDto } from './auth-profile.dto';

export class AuthMeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ enum: AuthPermission, isArray: true })
  permissions!: AuthPermission[];

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty({ enum: AccountType })
  accountType!: AccountType;

  @ApiProperty({ type: AuthProfileDto })
  profile!: AuthProfileDto;

  @ApiPropertyOptional({ description: 'Presente en cuentas BAR con local vinculado' })
  barId?: string;
}
