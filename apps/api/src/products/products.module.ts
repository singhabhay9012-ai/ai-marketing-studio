import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { productSchema, requestUploadSchema, type ProductInput } from '@amp/validation';
import { RequireRole, Tenant, TenantContext } from '../common/decorators';
import { ApiZodBody, partial, ZodBody } from '../common/zod';
import { BrandsModule } from '../brands/brands.module';
import { ProductsService } from './products.service';

const productPatchSchema = partial(productSchema).extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

@ApiTags('products')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequireRole('VIEWER')
  list(@Tenant() t: TenantContext, @Query() q: Record<string, string>) {
    return this.products.list(t, q);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiZodBody(productSchema)
  create(@Tenant() t: TenantContext, @ZodBody(productSchema) body: ProductInput) {
    return this.products.create(t, body);
  }

  /**
   * CSV body (Content-Type: text/csv). Columns: name, sku, category,
   * description, price, currency, features (pipe-separated), image_url.
   */
  @Post('import')
  @RequireRole('EDITOR')
  @ApiConsumes('text/csv')
  importCsv(@Tenant() t: TenantContext, @Query('brandId', ParseUUIDPipe) brandId: string, @Query('fileName') fileName: string | undefined, @Req() req: Request) {
    const body: unknown = req.body;
    const csv = Buffer.isBuffer(body) ? body.toString('utf8') : typeof body === 'string' ? body : '';
    if (!csv.trim()) throw new BadRequestException('Send the CSV as the request body with Content-Type: text/csv');
    return this.products.importCsv(t, brandId, (fileName ?? 'import.csv').slice(0, 255), csv);
  }

  @Get('import/:batchId')
  @RequireRole('VIEWER')
  getImport(@Tenant() t: TenantContext, @Param('batchId', ParseUUIDPipe) id: string) {
    return this.products.getImport(t, id);
  }

  @Get(':id')
  @RequireRole('VIEWER')
  get(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(t, id);
  }

  @Patch(':id')
  @RequireRole('EDITOR')
  @ApiZodBody(productPatchSchema)
  update(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(productPatchSchema) body: Partial<ProductInput>) {
    return this.products.update(t, id, body);
  }

  @Delete(':id')
  @RequireRole('MANAGER')
  @HttpCode(204)
  archive(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.archive(t, id);
  }

  @Post(':id/images')
  @RequireRole('EDITOR')
  @ApiZodBody(requestUploadSchema)
  requestUpload(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(requestUploadSchema) body: z.infer<typeof requestUploadSchema>) {
    return this.products.requestImageUpload(t, id, body);
  }

  @Post(':id/images/:imageId/confirm')
  @RequireRole('EDITOR')
  @HttpCode(200)
  confirm(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.products.confirmImageUpload(t, id, imageId);
  }

  @Get(':id/images/:imageId/url')
  @RequireRole('VIEWER')
  imageUrl(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.products.imageDownloadUrl(t, id, imageId);
  }

  @Delete(':id/images/:imageId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  deleteImage(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.products.deleteImage(t, id, imageId);
  }
}

@Module({ imports: [BrandsModule], controllers: [ProductsController], providers: [ProductsService], exports: [ProductsService] })
export class ProductsModule {}
