import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { Prisma, ProductStatus } from '@amp/database';
import { bulkProductRowSchema, type ProductInput } from '@amp/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/core.module';
import type { TenantContext } from '../common/decorators';
import { parsePagination, randomToken, slugify } from '../common/util';
import { BrandsService } from '../brands/brands.module';
import { sniffImageType, STORAGE, type StorageProvider } from '../storage/storage.provider';

const MAX_IMAGES_PER_PRODUCT = 12;
const MAX_IMPORT_ROWS = 1000;

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly brands: BrandsService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async list(t: TenantContext, q: { page?: string; pageSize?: string; search?: string; brandId?: string; status?: string }) {
    const { page, pageSize, skip, take } = parsePagination(q);
    const status = q.status && q.status in ProductStatus ? (q.status as ProductStatus) : undefined;
    const where: Prisma.ProductWhereInput = {
      organizationId: t.organizationId,
      ...(q.brandId ? { brandId: q.brandId } : {}),
      ...(status ? { status } : { status: { not: 'ARCHIVED' } }),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { sku: { contains: q.search, mode: 'insensitive' } },
              { category: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          brand: { select: { id: true, name: true } },
          images: { where: { status: 'UPLOADED' }, orderBy: { position: 'asc' }, take: 1 },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(t: TenantContext, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: t.organizationId },
      include: {
        brand: { select: { id: true, name: true } },
        images: { where: { status: 'UPLOADED' }, orderBy: { position: 'asc' } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(t: TenantContext, input: ProductInput) {
    await this.brands.get(t, input.brandId); // brand must belong to this org
    const slug = await this.uniqueSlug(t.organizationId, input.name);
    const product = await this.prisma.product.create({
      data: { ...input, attributes: input.attributes as Prisma.InputJsonValue, slug, organizationId: t.organizationId },
    });
    await this.audit.log({ action: 'product.create', organizationId: t.organizationId, userId: t.userId, entityType: 'Product', entityId: product.id });
    return product;
  }

  async update(t: TenantContext, id: string, input: Partial<ProductInput> & { status?: ProductStatus }) {
    const existing = await this.get(t, id);
    if (input.brandId) await this.brands.get(t, input.brandId);
    const price = input.price ?? (existing.price ? Number(existing.price) : undefined);
    const sale = input.salePrice ?? (existing.salePrice ? Number(existing.salePrice) : undefined);
    if (price !== undefined && sale !== undefined && sale > price) {
      throw new BadRequestException({ message: 'Validation failed', errors: [{ path: 'salePrice', message: 'Sale price cannot exceed price' }] });
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: { ...input, attributes: input.attributes as Prisma.InputJsonValue | undefined },
    });
    await this.audit.log({ action: 'product.update', organizationId: t.organizationId, userId: t.userId, entityType: 'Product', entityId: id });
    return product;
  }

  /** Soft-archive keeps history (campaigns, assets) intact. */
  async archive(t: TenantContext, id: string) {
    await this.get(t, id);
    await this.prisma.product.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await this.audit.log({ action: 'product.archive', organizationId: t.organizationId, userId: t.userId, entityType: 'Product', entityId: id });
  }

  // ── Images: request signed upload → client PUTs → confirm ──

  async requestImageUpload(t: TenantContext, productId: string, input: { fileName: string; mimeType: string; fileSize: number }) {
    await this.get(t, productId);
    const count = await this.prisma.productImage.count({ where: { productId, status: { not: 'REJECTED' } } });
    if (count >= MAX_IMAGES_PER_PRODUCT) throw new BadRequestException(`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images`);

    // Server-generated key: org-prefixed and unguessable; user filename never touches the path.
    const storageKey = `orgs/${t.organizationId}/products/${productId}/${randomUUID()}.${EXT[input.mimeType]}`;
    const image = await this.prisma.productImage.create({
      data: {
        organizationId: t.organizationId,
        productId,
        storageKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        position: count,
        status: 'PENDING',
      },
    });
    const upload = await this.storage.createUploadUrl(storageKey, { contentType: input.mimeType, maxBytes: input.fileSize });
    return { imageId: image.id, upload };
  }

  async confirmImageUpload(t: TenantContext, productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId, organizationId: t.organizationId } });
    if (!image) throw new NotFoundException('Image not found');
    if (image.status === 'UPLOADED') return image;

    const info = await this.storage.head(image.storageKey);
    if (!info) throw new BadRequestException('Upload not found — upload the file before confirming');

    const reject = async (reason: string) => {
      await this.prisma.productImage.update({ where: { id: imageId }, data: { status: 'REJECTED' } });
      await this.storage.delete(image.storageKey).catch(() => undefined);
      throw new BadRequestException(reason);
    };
    if (info.size > image.fileSize) await reject('Uploaded file is larger than declared');
    const sniffed = sniffImageType(await this.storage.readHead(image.storageKey, 16));
    if (sniffed !== image.mimeType) await reject('File content does not match the declared image type');

    return this.prisma.productImage.update({ where: { id: imageId }, data: { status: 'UPLOADED', fileSize: info.size } });
  }

  async imageDownloadUrl(t: TenantContext, productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId, organizationId: t.organizationId, status: 'UPLOADED' },
    });
    if (!image) throw new NotFoundException('Image not found');
    return this.storage.createDownloadUrl(image.storageKey, { expiresInSec: 600 });
  }

  async deleteImage(t: TenantContext, productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId, organizationId: t.organizationId } });
    if (!image) throw new NotFoundException('Image not found');
    await this.prisma.productImage.delete({ where: { id: imageId } });
    await this.storage.delete(image.storageKey).catch(() => undefined);
  }

  // ── Bulk import (MVP: synchronous validate + import with per-row report) ──

  async importCsv(t: TenantContext, brandId: string, fileName: string, csv: string) {
    await this.brands.get(t, brandId);

    let records: Record<string, string>[];
    try {
      records = parse(csv, { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true });
    } catch (e) {
      throw new BadRequestException(`Could not parse CSV: ${(e as Error).message}`);
    }
    if (records.length === 0) throw new BadRequestException('The file has no data rows');
    if (records.length > MAX_IMPORT_ROWS) throw new BadRequestException(`At most ${MAX_IMPORT_ROWS} rows per import`);

    const batch = await this.prisma.bulkImportBatch.create({
      data: { organizationId: t.organizationId, brandId, createdById: t.userId, fileName, status: 'VALIDATING', totalRows: records.length },
    });

    // Detect duplicate SKUs within the file and against existing products.
    const skus = records.map((r) => r.sku?.trim()).filter(Boolean) as string[];
    const existingSkus = new Set(
      (await this.prisma.product.findMany({ where: { organizationId: t.organizationId, sku: { in: skus } }, select: { sku: true } })).map((p) => p.sku),
    );
    const seen = new Set<string>();

    const rows: Array<{ rowNumber: number; raw: Record<string, string>; errors: Array<{ field: string; message: string }>; data?: ReturnType<typeof bulkProductRowSchema.parse> }> = [];
    records.forEach((raw, i) => {
      const rowNumber = i + 2; // +1 header, +1 for 1-based rows as users see them in a spreadsheet
      const parsed = bulkProductRowSchema.safeParse(raw);
      const errors = parsed.success ? [] : parsed.error.issues.map((iss) => ({ field: iss.path.join('.') || 'row', message: iss.message }));
      const sku = raw.sku?.trim();
      if (sku) {
        if (seen.has(sku)) errors.push({ field: 'sku', message: `Duplicate SKU "${sku}" in this file` });
        else if (existingSkus.has(sku)) errors.push({ field: 'sku', message: `SKU "${sku}" already exists` });
        seen.add(sku);
      }
      rows.push({ rowNumber, raw, errors, data: parsed.success && errors.length === 0 ? parsed.data : undefined });
    });

    let imported = 0;
    for (const row of rows) {
      let productId: string | undefined;
      let status: 'INVALID' | 'IMPORTED' | 'FAILED' = 'INVALID';
      if (row.data) {
        try {
          const { image_url: _img, ...data } = row.data;
          const product = await this.prisma.product.create({
            data: { ...data, brandId, organizationId: t.organizationId, slug: await this.uniqueSlug(t.organizationId, data.name) },
          });
          productId = product.id;
          status = 'IMPORTED';
          imported++;
        } catch (e) {
          status = 'FAILED';
          row.errors.push({ field: 'row', message: e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? 'Duplicate product' : 'Could not save row' });
        }
      }
      await this.prisma.bulkImportRow.create({
        data: { batchId: batch.id, rowNumber: row.rowNumber, rawData: row.raw, status, errors: row.errors, productId },
      });
    }

    const invalid = rows.length - imported;
    const result = await this.prisma.bulkImportBatch.update({
      where: { id: batch.id },
      data: { status: 'COMPLETED', validRows: rows.filter((r) => r.data).length, invalidRows: invalid, importedRows: imported },
    });
    await this.audit.log({ action: 'product.bulk_import', organizationId: t.organizationId, userId: t.userId, entityType: 'BulkImportBatch', entityId: batch.id, metadata: { total: rows.length, imported } });

    return {
      batch: result,
      failedRows: rows.filter((r) => r.errors.length > 0).map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })),
    };
  }

  async getImport(t: TenantContext, batchId: string) {
    const batch = await this.prisma.bulkImportBatch.findFirst({
      where: { id: batchId, organizationId: t.organizationId },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('Import not found');
    return batch;
  }

  private async uniqueSlug(organizationId: string, name: string) {
    const base = slugify(name);
    if (!(await this.prisma.product.findUnique({ where: { organizationId_slug: { organizationId, slug: base } } }))) return base;
    return `${base}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
  }
}
