import { ConflictException, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { AuthTokens, MeResponse } from '@amp/shared-types';
import type { LoginInput, RegisterInput } from '@amp/validation';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, MailService } from '../common/core.module';
import { randomToken, sha256 } from '../common/util';
import { OrganizationsService } from '../organizations/organizations.service';

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 60 * 60 * 1000;
// Pre-computed hash so login timing is similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', BCRYPT_ROUNDS);

interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly orgs: OrganizationsService,
  ) {}

  async register(input: RegisterInput, client: ClientInfo): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash },
    });

    if (input.organizationName) {
      await this.orgs.create(user.id, { name: input.organizationName });
    }

    await this.sendVerification(user.id, user.email);
    await this.audit.log({ action: 'auth.register', userId: user.id, ipAddress: client.ipAddress });
    return this.issueTokens(user.id, user.email, randomUUID(), client);
  }

  async login(input: LoginInput, client: ClientInfo): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      await this.audit.log({ action: 'auth.login_failed', userId: user?.id, ipAddress: client.ipAddress });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('Account suspended');

    await this.audit.log({ action: 'auth.login', userId: user.id, ipAddress: client.ipAddress });
    return this.issueTokens(user.id, user.email, randomUUID(), client);
  }

  /**
   * Rotating refresh tokens. Each use returns a new token and marks the old one
   * rotated. Presenting an already-rotated token means it was stolen or replayed,
   * so the entire token family is revoked.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<AuthTokens> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { id: true, email: true, status: true } } },
    });
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    if (session.rotatedAt || session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        action: 'auth.refresh_reuse_detected',
        userId: session.userId,
        ipAddress: client.ipAddress,
      });
      throw new UnauthorizedException('Refresh token reuse detected; please sign in again');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');
    if (session.user.status === 'SUSPENDED') throw new UnauthorizedException('Account suspended');

    // Conditional update guards against two concurrent refreshes both succeeding.
    const claimed = await this.prisma.session.updateMany({
      where: { id: session.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('Refresh token already used');

    return this.issueTokens(session.user.id, session.user.email, session.familyId, client);
  }

  async logout(refreshToken: string | undefined, userId?: string) {
    if (!refreshToken) return;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!session || (userId && session.userId !== userId)) return;
    await this.prisma.session.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({ action: 'auth.logout', userId: session.userId });
  }

  async logoutAll(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ action: 'auth.logout_all', userId });
  }

  /** Always resolves the same way, so it can't be used to discover accounts. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'SUSPENDED') return;
    const token = randomToken();
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const link = `${env().WEB_URL}/auth/reset-password?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: 'Reset your password',
      text: `Use this link within 1 hour to reset your password:\n${link}\n\nIf you didn't ask for this, ignore this email.`,
      meta: { token, link },
    });
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Compromise response: a password reset signs out every session.
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log({ action: 'auth.password_reset', userId: record.userId });
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Verification link is invalid or has expired');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
      this.prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { organization: { deletedAt: null } },
          include: { organization: { select: { id: true, name: true, slug: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      memberships: user.memberships.map((m) => ({
        organizationId: m.organization.id,
        organizationName: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  private async sendVerification(userId: string, email: string) {
    const token = randomToken();
    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 48 * 3600 * 1000) },
    });
    const link = `${env().WEB_URL}/auth/verify-email?token=${token}`;
    await this.mail.send({ to: email, subject: 'Verify your email', text: link, meta: { token, link } });
  }

  private async issueTokens(userId: string, email: string, familyId: string, client: ClientInfo): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, typ: 'access' },
      { secret: env().JWT_ACCESS_SECRET, expiresIn: env().JWT_ACCESS_TTL as never },
    );
    const refreshToken = randomToken(48);
    await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        userAgent: client.userAgent?.slice(0, 255),
        ipAddress: client.ipAddress,
        expiresAt: new Date(Date.now() + env().JWT_REFRESH_TTL_DAYS * 86400 * 1000),
      },
    });
    const decoded = this.jwt.decode(accessToken) as { exp: number; iat: number };
    return { accessToken, refreshToken, expiresIn: decoded.exp - decoded.iat };
  }
}
