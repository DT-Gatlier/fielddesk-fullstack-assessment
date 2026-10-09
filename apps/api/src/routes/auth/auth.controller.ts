import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { ApiEnvironment } from '../../config/environment';
import {
  SESSION_COOKIE,
  ANONYMOUS_COOKIE,
  cookieOptions,
} from '../../http/cookie-policy';
import { Public, CurrentIdentity } from '../../http/decorators/auth.decorators';
import type { SecurityRequest } from '../../http/interfaces/security-request.interface';
import type { Identity } from '../../modules/auth/interfaces/auth-identity.interface';
import { AuthService } from '../../modules/auth/services/auth.service';
import { AuthResDto } from './dtos/auth-res.dto';
import { CsrfResDto } from './dtos/csrf-res.dto';
import { LoginDto } from './dtos/login.dto';

@ApiTags('Authentication')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  @Public()
  @Get('csrf')
  @ApiOperation({
    summary:
      'Bootstrap anonymous or fetch session CSRF token; refetch after login',
  })
  @ApiResponse({
    status: 200,
    type: CsrfResDto,
  })
  async csrf(
    @Req() request: SecurityRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CsrfResDto> {
    const result = await this.auth.bootstrapCsrf(request.security);
    if (request.security.staleSession) {
      response.clearCookie(SESSION_COOKIE, cookieOptions(this.config));
    }
    if (result.anonymousToken) {
      response.cookie(ANONYMOUS_COOKIE, result.anonymousToken, {
        ...cookieOptions(this.config),
        maxAge: 600000,
      });
    }
    return CsrfResDto.fromData(result.csrfToken);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiHeader({ name: 'Origin', required: true })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @ApiResponse({ status: 200, type: AuthResDto })
  @ApiResponse({
    status: 429,
    description: 'Rate limited; Retry-After indicates seconds',
  })
  async login(
    @Body() input: LoginDto,
    @Req() request: SecurityRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResDto> {
    const result = await this.auth.login(input, request.security);
    response.cookie(SESSION_COOKIE, result.token, {
      ...cookieOptions(this.config),
      expires: result.expiresAt,
    });
    response.clearCookie(ANONYMOUS_COOKIE, cookieOptions(this.config));
    return AuthResDto.fromData(result.identity);
  }

  @Get('me')
  @ApiCookieAuth('session')
  @ApiResponse({ status: 200, type: AuthResDto })
  me(@CurrentIdentity() identity: Identity): AuthResDto {
    return AuthResDto.fromData(identity);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({
    summary:
      'Revoke session; bootstrap anonymous CSRF first if session is stale',
  })
  @ApiResponse({
    status: 204,
    description: 'Cookies cleared; session revoked if active',
  })
  async logout(
    @Req() request: SecurityRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request.security);
    response.clearCookie(SESSION_COOKIE, cookieOptions(this.config));
    response.clearCookie(ANONYMOUS_COOKIE, cookieOptions(this.config));
  }
}
