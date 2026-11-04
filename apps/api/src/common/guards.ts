import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { roleAtLeast, type OrgRole } from '@amp/shared-types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AppRequest, IS_PUBLIC, MIN_ROLE } from './decorators';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Global: every route needs a valid access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing access token');

    let payload: { sub: string; email: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7), { secret: env().JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (payload.typ !== 'access') throw new UnauthorizedException('Invalid token type');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status === 'SUSPENDED') throw new UnauthorizedException('Account unavailable');

    req.user = { id: user.id, email: user.email };
    return true;
  }
}

/**
 * Global tenant guard. For routes decorated with @RequireRole(), resolves the
 * organisation from the :organizationId route param or x-organization-id header,
 * verifies membership in the database (never trusting the client) and enforces
 * the minimum role. The resolved context is attached as req.tenant.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const minRole = this.reflector.getAllAndOverride<OrgRole | undefined>(MIN_ROLE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!minRole) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new UnauthorizedException();

    const fromParam = req.params?.organizationId as string | undefined;
    const rawHeader = req.headers['x-organization-id'];
    const fromHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (fromParam && fromHeader && fromParam !== fromHeader) {
      throw new BadRequestException('Organisation in URL and header do not match');
    }
    const organizationId = fromParam ?? fromHeader;
    if (!organizationId) throw new BadRequestException('x-organization-id header is required');
    if (!UUID_RE.test(organizationId)) throw new BadRequestException('Invalid organisation id');

    const membership = await this.prisma.membership.findFirst({
      where: { userId: req.user.id, organizationId, organization: { deletedAt: null } },
      select: { role: true },
    });
    // 404-style message: don't reveal whether the org exists to non-members.
    if (!membership) throw new ForbiddenException('No access to this organisation');
    if (!roleAtLeast(membership.role, minRole)) {
      throw new ForbiddenException(`Requires ${minRole} role or higher`);
    }

    req.tenant = { organizationId, userId: req.user.id, role: membership.role };
    return true;
  }
}
