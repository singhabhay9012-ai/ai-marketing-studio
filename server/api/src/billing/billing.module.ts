import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { getCreditSummary } from '@amp/database';
import { PrismaService } from '../prisma/prisma.service';
import { RequireRole, Tenant, TenantContext } from '../common/decorators';
import { parsePagination } from '../common/util';

/**
 * Billing foundation. Razorpay checkout and verified webhooks (POST
 * /billing/checkout, /billing/webhooks/:provider) land in Sprint 7 behind a
 * PaymentProvider interface; the ledger and entitlements below are in place.
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async plan(t: TenantContext) {
    const sub = await this.prisma.subscription.findFirst({
      where: { organizationId: t.organizationId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      orderBy: { startsAt: 'desc' },
    });
    const plan = sub
      ? await this.prisma.plan.findFirst({ where: { code: sub.planCode, effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: 'desc' } })
      : null;
    return { subscription: sub, plan };
  }

  async usage(t: TenantContext, q: { page?: string; pageSize?: string }) {
    const { page, pageSize, skip, take } = parsePagination(q);
    const [credits, transactions, total, products, members, brands] = await Promise.all([
      getCreditSummary(this.prisma, t.organizationId),
      this.prisma.creditTransaction.findMany({ where: { organizationId: t.organizationId }, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.creditTransaction.count({ where: { organizationId: t.organizationId } }),
      this.prisma.product.count({ where: { organizationId: t.organizationId, status: { not: 'ARCHIVED' } } }),
      this.prisma.membership.count({ where: { organizationId: t.organizationId } }),
      this.prisma.brand.count({ where: { organizationId: t.organizationId, deletedAt: null } }),
    ]);
    return { credits, counts: { products, members, brands }, transactions: { items: transactions, total, page, pageSize } };
  }
}

@ApiTags('billing')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plan')
  @RequireRole('VIEWER')
  plan(@Tenant() t: TenantContext) {
    return this.billing.plan(t);
  }

  @Get('usage')
  @RequireRole('VIEWER')
  usage(@Tenant() t: TenantContext, @Query() q: Record<string, string>) {
    return this.billing.usage(t, q);
  }
}

@Module({ controllers: [BillingController], providers: [BillingService] })
export class BillingModule {}
