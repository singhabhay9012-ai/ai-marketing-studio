import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Global,
  HttpCode,
  Inject,
  Module,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import { Public } from '../common/decorators';
import { LocalStorageProvider } from './local.storage';
import { S3StorageProvider } from './s3.storage';
import { STORAGE, StorageProvider } from './storage.provider';

/** Serves signed URLs for the local driver only (S3 serves its own). */
@ApiExcludeController()
@Controller('storage/local')
export class LocalStorageController {
  constructor(@Inject(STORAGE) private readonly storage: StorageProvider) {}

  private local() {
    if (!(this.storage instanceof LocalStorageProvider)) throw new NotFoundException();
    return this.storage;
  }

  @Public()
  @Put(':token')
  @HttpCode(200)
  async upload(@Param('token') token: string, @Req() req: Request) {
    const local = this.local();
    const grant = local.verify(token);
    if (!grant || grant.op !== 'put') throw new ForbiddenException('Invalid or expired upload URL');
    const contentType = (req.headers['content-type'] ?? '').split(';')[0];
    if (grant.ct && contentType !== grant.ct) throw new BadRequestException('Content-Type does not match the signed upload');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new BadRequestException('Empty upload');
    if (grant.max && body.length > grant.max) throw new BadRequestException('File exceeds the signed size limit');
    await local.put(grant.k, body);
    return { ok: true };
  }

  @Public()
  @Get(':token')
  async download(@Param('token') token: string, @Res() res: Response) {
    const local = this.local();
    const grant = local.verify(token);
    if (!grant || grant.op !== 'get') throw new ForbiddenException('Invalid or expired download URL');
    const info = await local.head(grant.k);
    if (!info) throw new NotFoundException();
    if (grant.fn) res.attachment(grant.fn);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // The signed URL is itself the capability, so it may be embedded by the web app's origin
    // (mirrors how S3/R2 presigned URLs behave).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const ext = grant.k.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', zip: 'application/zip', pdf: 'application/pdf' };
    res.type(types[ext ?? ''] ?? 'application/octet-stream');
    res.send(await local.read(grant.k));
  }
}

@Global()
@Module({
  controllers: [LocalStorageController],
  providers: [
    {
      provide: STORAGE,
      useFactory: (): StorageProvider => {
        const e = env();
        if (e.STORAGE_DRIVER === 's3') {
          return new S3StorageProvider(e.STORAGE_BUCKET, {
            endpoint: e.STORAGE_ENDPOINT,
            region: e.STORAGE_REGION,
            accessKeyId: e.STORAGE_ACCESS_KEY,
            secretAccessKey: e.STORAGE_SECRET_KEY,
          });
        }
        return new LocalStorageProvider(e.STORAGE_LOCAL_DIR, `${e.API_URL}/api/v1/storage/local`, e.STORAGE_SIGNING_SECRET);
      },
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
