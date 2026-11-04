import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@amp/database';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  /** Best-effort: audit failure must never break the user's request. */
  async log(entry: {
    action: string;
    organizationId?: string | null;
    userId?: string | null;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
  }) {
    try {
      await this.prisma.auditLog.create({ data: entry });
    } catch (e) {
      this.logger.warn(`Failed to write audit log for ${entry.action}: ${(e as Error).message}`);
    }
  }
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Machine-readable link/token, handy for tests and dev tooling. */
  meta?: Record<string, string>;
}

/**
 * Mail provider abstraction. Development/test implementation logs and keeps
 * an in-memory outbox; swap for SES/Postmark/etc. behind the same interface.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  readonly outbox: MailMessage[] = [];

  async send(message: MailMessage) {
    this.outbox.push(message);
    if (this.outbox.length > 200) this.outbox.shift();
    if (process.env.NODE_ENV !== 'test') {
      this.logger.log(`To ${message.to}: ${message.subject}\n${message.text}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService, MailService], exports: [AuditService, MailService] })
export class CoreModule {}
