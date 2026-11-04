import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ObjectInfo, SignedRequest, StorageProvider } from './storage.provider';

/** Works with AWS S3, Cloudflare R2 and MinIO (set STORAGE_ENDPOINT for R2/MinIO). */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    opts: { endpoint?: string; region: string; accessKeyId?: string; secretAccessKey?: string },
  ) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: Boolean(opts.endpoint),
      credentials:
        opts.accessKeyId && opts.secretAccessKey
          ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
          : undefined,
    });
  }

  async createUploadUrl(key: string, opts: { contentType: string; maxBytes: number; expiresInSec?: number }): Promise<SignedRequest> {
    const expiresIn = opts.expiresInSec ?? 900;
    // Size is re-checked with HEAD on confirm; presigned PUT cannot enforce max size.
    const url = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts.contentType }), { expiresIn });
    return { url, method: 'PUT', headers: { 'Content-Type': opts.contentType }, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  async createDownloadUrl(key: string, opts?: { expiresInSec?: number; fileName?: string }): Promise<SignedRequest> {
    const expiresIn = opts?.expiresInSec ?? 900;
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: opts?.fileName ? `attachment; filename="${opts.fileName.replace(/"/g, '')}"` : undefined,
      }),
      { expiresIn },
    );
    return { url, method: 'GET', headers: {}, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType };
    } catch (e) {
      if ((e as { name?: string }).name === 'NotFound') return null;
      throw e;
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
