import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@amp/database';
import { ROLE_RANK } from '@amp/shared-types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, MailService } from '../common/core.module';
import type { TenantContext } from '../common/decorators';
import { randomToken, sha256, slugify } from '../common/util';

const INVITE_TTL_MS = 7 * 86400 * 1000;

/** Actor may only grant or manage roles strictly below their own (OWNER may grant ADMIN). */
function canManageRole(actor: OrgRole, target: OrgRole) {
  if (target === 'OWNER') return false;
  if (actor === 'OWNER') return true;
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, organization: { deletedAt: null } },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({ ...m.organization, role: m.role }));
  }

  /**
   * Creates the org, the OWNER membership, a free-plan subscription and the
   * initial credit grant in one transaction.
   */
  async create(userId: string, input: { name: string }) {
    const slug = await this.uniqueSlug(input.name);
    const freePlan = await this.prisma.plan.findFirst({
      where: { code: 'free', isActive: true, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const grant = freePlan?.monthlyCredits ?? 0;

    const org = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: input.name, slug, ownerId: userId } });
      await tx.membership.create({ data: { userId, organizationId: org.id, role: 'OWNER' } });
      await tx.creditAccount.create({ data: { organizationId: org.id, balance: grant } });
      if (freePlan) {
        await tx.subscription.create({
          data: { organizationId: org.id, planCode: freePlan.code, status: 'ACTIVE', provider: 'internal', startsAt: new Date() },
        });
      }
      if (grant > 0) {
        await tx.creditTransaction.create({
          data: {
            organizationId: org.id,
            type: 'CREDIT',
            amount: grant,
            balanceAfter: grant,
            idempotencyKey: `plan-grant:${org.id}:initial`,
            description: `${freePlan!.name} plan credits`,
          },
        });
      }
      return org;
    });

    await this.audit.log({ action: 'organization.create', organizationId: org.id, userId, entityType: 'Organization', entityId: org.id });
    return { ...org, role: 'OWNER' as const };
  }

  async get(t: TenantContext) {
    const org = await this.prisma.organization.findFirstOrThrow({
      where: { id: t.organizationId, deletedAt: null },
      include: { _count: { select: { memberships: true, brands: true, products: true } } },
    });
    return { ...org, role: t.role };
  }

  async update(t: TenantContext, input: { name?: string }) {
    const org = await this.prisma.organization.update({ where: { id: t.organizationId }, data: { name: input.name } });
    await this.audit.log({ action: 'organization.update', organizationId: t.organizationId, userId: t.userId, metadata: input });
    return org;
  }

  async softDelete(t: TenantContext) {
    await this.prisma.organization.update({ where: { id: t.organizationId }, data: { deletedAt: new Date() } });
    await this.audit.log({ action: 'organization.delete', organizationId: t.organizationId, userId: t.userId });
  }

  listMembers(t: TenantContext) {
    return this.prisma.membership.findMany({
      where: { organizationId: t.organizationId },
      select: { userId: true, role: true, createdAt: true, user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async changeRole(t: TenantContext, memberUserId: string, role: OrgRole) {
    const member = await this.findMember(t.organizationId, memberUserId);
    if (memberUserId === t.userId) throw new BadRequestException('You cannot change your own role');
    if (!canManageRole(t.role, member.role) || !canManageRole(t.role, role)) {
      throw new ForbiddenException('You cannot assign or modify this role');
    }
    const updated = await this.prisma.membership.update({ where: { id: member.id }, data: { role } });
    await this.audit.log({
      action: 'membership.role_change',
      organizationId: t.organizationId,
      userId: t.userId,
      entityType: 'Membership',
      entityId: member.id,
      metadata: { from: member.role, to: role },
    });
    return updated;
  }

  async removeMember(t: TenantContext, memberUserId: string) {
    const member = await this.findMember(t.organizationId, memberUserId);
    const leavingSelf = memberUserId === t.userId;
    if (member.role === 'OWNER') throw new BadRequestException('The owner cannot be removed');
    if (!leavingSelf && !canManageRole(t.role, member.role)) throw new ForbiddenException('You cannot remove this member');
    await this.prisma.membership.delete({ where: { id: member.id } });
    await this.audit.log({ action: 'membership.remove', organizationId: t.organizationId, userId: t.userId, metadata: { memberUserId } });
  }

  async invite(t: TenantContext, input: { email: string; role: OrgRole }) {
    if (!canManageRole(t.role, input.role)) throw new ForbiddenException(`You cannot invite a ${input.role}`);

    const alreadyMember = await this.prisma.membership.findFirst({
      where: { organizationId: t.organizationId, user: { email: input.email } },
    });
    if (alreadyMember) throw new BadRequestException('This person is already a member');

    // Re-inviting replaces any pending invitation for the same email.
    await this.prisma.invitation.updateMany({
      where: { organizationId: t.organizationId, email: input.email, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });

    const token = randomToken();
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId: t.organizationId,
        email: input.email,
        role: input.role,
        tokenHash: sha256(token),
        invitedById: t.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      include: { organization: { select: { name: true } } },
    });

    const link = `${env().WEB_URL}/auth/accept-invite?token=${token}`;
    await this.mail.send({
      to: input.email,
      subject: `You've been invited to ${invitation.organization.name}`,
      text: `Join ${invitation.organization.name} as ${input.role}: ${link}`,
      meta: { token, link },
    });
    await this.audit.log({
      action: 'invitation.create',
      organizationId: t.organizationId,
      userId: t.userId,
      entityType: 'Invitation',
      entityId: invitation.id,
      metadata: { email: input.email, role: input.role },
    });

    const { tokenHash: _omit, organization: _o, ...safe } = invitation;
    return safe;
  }

  listInvitations(t: TenantContext) {
    return this.prisma.invitation.findMany({
      where: { organizationId: t.organizationId, status: 'PENDING' },
      select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvitation(t: TenantContext, invitationId: string) {
    const res = await this.prisma.invitation.updateMany({
      where: { id: invitationId, organizationId: t.organizationId, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });
    if (res.count === 0) throw new NotFoundException('Invitation not found');
  }

  async acceptInvitation(user: { id: string; email: string }, token: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash: sha256(token) } });
    if (!invitation || invitation.status !== 'PENDING') throw new BadRequestException('Invitation is invalid or no longer active');
    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('Invitation has expired');
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    await this.prisma.$transaction([
      this.prisma.membership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } },
        update: {},
        create: { userId: user.id, organizationId: invitation.organizationId, role: invitation.role },
      }),
      this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } }),
    ]);
    await this.audit.log({ action: 'invitation.accept', organizationId: invitation.organizationId, userId: user.id });
    return { organizationId: invitation.organizationId, role: invitation.role };
  }

  private async findMember(organizationId: string, userId: string) {
    const member = await this.prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId } } });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  private async uniqueSlug(name: string) {
    const base = slugify(name);
    for (let i = 0; i < 20; i++) {
      const slug = i === 0 ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      if (!(await this.prisma.organization.findUnique({ where: { slug } }))) return slug;
    }
    return `${base}-${Date.now()}`;
  }
}
