import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthMeResponseDto } from './dto/auth-me-response.dto';
import { AuthSessionResponseDto } from './dto/auth-session-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto, LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Registro email/password (USER o BAR)',
    description:
      'USER: envía birthDate (AAAA-MM-DD) solo para verificar ≥18 años; no se persiste. ' +
      'BAR: envía adultConfirmed=true (declaración del responsable adulto). ' +
      'ADMIN/SUPER_ADMIN no se permiten. Se guarda ageVerifiedAt, nunca la fecha de nacimiento.',
  })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  register(@Body() dto: RegisterDto): Promise<AuthSessionResponseDto> {
    return this.auth.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  login(@Body() dto: LoginDto): Promise<AuthSessionResponseDto> {
    return this.auth.login(dto.email, dto.password, dto.intent);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Renovar access token (rotación + reuse detection)' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthSessionResponseDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cerrar sesión actual (revoca refresh token)' })
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cerrar sesión en todos los dispositivos' })
  logoutAll(@CurrentUser() user: JwtPayload) {
    return this.auth.logoutAll(user.sub);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cambiar contraseña (revoca todas las sesiones y emite tokens nuevos)',
  })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado actual (sesión + perfil)' })
  @ApiOkResponse({ type: AuthMeResponseDto })
  me(@CurrentUser() user: JwtPayload): Promise<AuthMeResponseDto> {
    return this.auth.getMe(user);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Solicitar recuperación de contraseña' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Restablecer contraseña con token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verificar email con token' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({ summary: 'Reenviar email de verificación' })
  resend(@CurrentUser() user: { sub: string }) {
    return this.auth.resendVerification(user.sub);
  }
}
