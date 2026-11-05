import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ObjectInfo, SignedRequest, StorageProvider } from './storage.provider';

export interface LocalGrant {
  k: string; // key
  op: 'put' | 'get';
  ct?: string; // required content type for put
  max?: number; // max bytes for put
  fn?: string; // download filename
  exp: number; // unix seconds
}

/**
 * Development driver: stores files on disk and issues HMAC-signed URLs served
 * by StorageController, mimicking S3 presigned URLs end-to-end.
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string,
    private readonly secret: string,
  ) {}

  async createUploadUrl(key: string, opts: { contentType: string; maxBytes: number; expiresInSec?: number }): Promise<SignedRequest> {
    const exp = Math.floor(Date.now() / 1000) + (opts.expiresInSec ?? 900);
    const token = this.sign({ k: key, op: 'put', ct: opts.contentType, max: opts.maxBytes, exp });
    return { url: `${this.publicBaseUrl}/${token}`, method: 'PUT', headers: { 'Content-Type': opts.contentType }, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async createDownloadUrl(key: string, opts?: { expiresInSec?: number; fileName?: string }): Promise<SignedRequest> {
    const exp = Math.floor(Date.now() / 1000) + (opts?.expiresInSec ?? 900);
    const token = this.sign({ k: key, op: 'get', fn: opts?.fileName, exp });
    return { url: `${this.publicBaseUrl}/${token}`, method: 'GET', headers: {}, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const stat = await fs.stat(this.resolve(key));
      return { size: stat.size };
    } catch {
      return null;
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer> {
    const fh = await fs.open(this.resolve(key), 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  verify(token: string): LocalGrant | null {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = this.hmac(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const grant = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LocalGrant;
      if (grant.exp < Math.floor(Date.now() / 1000)) return null;
      return grant;
    } catch {
      return null;
    }
  }

  /** Prevents path traversal: the resolved file must stay inside rootDir. */
  private resolve(key: string) {
    const root = path.resolve(this.rootDir);
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid storage key');
    return file;
  }

  private sign(grant: LocalGrant) {
    const body = Buffer.from(JSON.stringify(grant)).toString('base64url');
    return `${body}.${this.hmac(body)}`;
  }

  private hmac(body: string) {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
