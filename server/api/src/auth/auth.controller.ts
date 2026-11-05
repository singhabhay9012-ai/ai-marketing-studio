import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { emailSchema, loginSchema, passwordSchema, registerSchema } from '@amp/validation';
import type { AuthTokens } from '@amp/shared-types';
import { env } from '../config/env';
import { AppRequest, AuthUser, CurrentUser, Public } from '../common/decorators';
import { ApiZodBody, ZodBody } from '../common/zod';
import { AuthService } from './auth.service';

const REFRESH_COOKIE = 'amp_refresh';
const refreshSchema = z.object({ refreshToken: z.string().min(20).optional() });
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({ token: z.string().min(20), password: passwordSchema });
const tokenSchema = z.object({ token: z.string().min(20) });

// Strict limits on credential endpoints (per IP, per minute).
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiZodBody(registerSchema)
  async register(@ZodBody(registerSchema) body: z.infer<typeof registerSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    return this.withCookie(res, await this.auth.register(body, client(req)));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  async login(@ZodBody(loginSchema) body: z.infer<typeof loginSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    return this.withCookie(res, await this.auth.login(body, client(req)));
  }

  /** Accepts the refresh token from the httpOnly cookie (web) or the body (mobile/API clients). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiZodBody(refreshSchema)
  async refresh(@ZodBody(refreshSchema) body: z.infer<typeof refreshSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const token = body.refreshToken ?? refreshCookie(req);
    if (!token) {
      res.status(401);
      return { statusCode: 401, message: 'Missing refresh token' };
    }
    return this.withCookie(res, await this.auth.refresh(token, client(req)));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiZodBody(refreshSchema)
  async logout(@ZodBody(refreshSchema) body: z.infer<typeof refreshSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(body.refreshToken ?? refreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  @ApiZodBody(forgotSchema)
  async forgot(@ZodBody(forgotSchema) body: z.infer<typeof forgotSchema>) {
    await this.auth.forgotPassword(body.email);
    return { message: 'If an account exists for this email, a reset link has been sent.' };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  @HttpCode(204)
  @ApiZodBody(resetSchema)
  async reset(@ZodBody(resetSchema) body: z.infer<typeof resetSchema>) {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  @ApiZodBody(tokenSchema)
  async verify(@ZodBody(tokenSchema) body: z.infer<typeof tokenSchema>) {
    await this.auth.verifyEmail(body.token);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  private withCookie(res: Response, tokens: AuthTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...cookieOptions(),
      maxAge: env().JWT_REFRESH_TTL_DAYS * 86400 * 1000,
    });
    return tokens;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    // Strict: the cookie is never sent on cross-site requests, so the refresh
    // endpoint is not CSRF-able. Web and API must share a registrable domain.
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
  };
}

function refreshCookie(req: AppRequest): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

function client(req: AppRequest) {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}
