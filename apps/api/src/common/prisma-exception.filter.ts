import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@amp/database';
import type { Response } from 'express';

/** Maps well-known Prisma errors to HTTP responses without leaking internals. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(err: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        return res
          .status(HttpStatus.CONFLICT)
          .json({ statusCode: 409, message: `A record with this ${target} already exists` });
      }
      case 'P2025':
        return res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Record not found' });
      case 'P2003':
        return res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: 'Related record not found' });
      default:
        this.logger.error(`${err.code}: ${err.message}`);
        return res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ statusCode: 500, message: 'Internal server error' });
    }
  }
}
