import { Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@amp/database';
import { brandSchema, type BrandInput } from '@amp/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/core.module';
import { RequireRole, Tenant, TenantContext } from '../common/decorators';
import { ApiZodBody, partial, ZodBody } from '../common/zod';

const brandPatchSchema = partial(brandSchema);

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(t: TenantContext) {
    return this.prisma.brand.findMany({
      where: { organizationId: t.organizationId, deletedAt: null },
      include: { _count: { select: { products: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Tenant-scoped lookup: a brand in another org is indistinguishable from a missing one. */
  async get(t: TenantContext, id: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, organizationId: t.organizationId, deletedAt: null } });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async create(t: TenantContext, input: BrandInput) {
    const brand = await this.prisma.brand.create({
      data: { ...input, guidelines: input.guidelines as Prisma.InputJsonValue, organizationId: t.organizationId },
    });
    await this.audit.log({ action: 'brand.create', organizationId: t.organizationId, userId: t.userId, entityType: 'Brand', entityId: brand.id });
    return brand;
  }

  async update(t: TenantContext, id: string, input: Partial<BrandInput>) {
    await this.get(t, id);
    const brand = await this.prisma.brand.update({
      where: { id },
      data: { ...input, guidelines: input.guidelines as Prisma.InputJsonValue | undefined },
    });
    await this.audit.log({ action: 'brand.update', organizationId: t.organizationId, userId: t.userId, entityType: 'Brand', entityId: id });
    return brand;
  }

  async remove(t: TenantContext, id: string) {
    await this.get(t, id);
    await this.prisma.brand.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ action: 'brand.delete', organizationId: t.organizationId, userId: t.userId, entityType: 'Brand', entityId: id });
  }
}

@ApiTags('brands')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  @RequireRole('VIEWER')
  list(@Tenant() t: TenantContext) {
    return this.brands.list(t);
  }

  @Post()
  @RequireRole('MANAGER')
  @ApiZodBody(brandSchema)
  create(@Tenant() t: TenantContext, @ZodBody(brandSchema) body: BrandInput) {
    return this.brands.create(t, body);
  }

  @Get(':id')
  @RequireRole('VIEWER')
  get(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.brands.get(t, id);
  }

  @Patch(':id')
  @RequireRole('MANAGER')
  @ApiZodBody(brandPatchSchema)
  update(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(brandPatchSchema) body: Partial<BrandInput>) {
    return this.brands.update(t, id, body);
  }

  @Delete(':id')
  @RequireRole('ADMIN')
  @HttpCode(204)
  remove(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.brands.remove(t, id);
  }
}

@Module({ controllers: [BrandsController], providers: [BrandsService], exports: [BrandsService] })
export class BrandsModule {}
