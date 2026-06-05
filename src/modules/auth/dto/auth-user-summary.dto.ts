import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccountType } from '../permissions/account-type.enum';
import { AuthPermission } from '../permissions/auth-permission.enum';

export class AuthUserSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ enum: AuthPermission, isArray: true })
  permissions!: AuthPermission[];

  @ApiProperty({ enum: AccountType })
  accountType!: AccountType;

  @ApiProperty()
  isAdmin!: boolean;
}
