import { ApiProperty } from '@nestjs/swagger';
import { AuthUserSummaryDto } from './auth-user-summary.dto';

export class AuthSessionResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: '15m' })
  expiresIn!: string;

  @ApiProperty({ type: AuthUserSummaryDto })
  user!: AuthUserSummaryDto;
}
