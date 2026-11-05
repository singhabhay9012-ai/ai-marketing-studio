import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Credit accounting (blueprint §12).
 *
 *  available = balance − reserved
 *
 *  reserve(ref, n)  : hold n credits for a job. Fails if available < n. Idempotent on ref.
 *  settle(ref, used): convert the hold into a DEBIT ledger entry for `used` (≤ reserved)
 *                     and release the rest. Idempotent.
 *  release(ref)     : drop the hold without charging (job failed / cancelled). Idempotent.
 *
 * The CreditAccount row is locked FOR UPDATE inside each transaction so
 * concurrent reservations can never overdraw. CreditTransaction is append-only
 * and is the audit source of truth; `reconcile()` rebuilds the cached balance.
 */

export class InsufficientCreditsError extends Error {
  constructor(
    readonly available: number,
    readonly required: number,
  ) {
    super(`Insufficient credits: ${available} available, ${required} required`);
  }
}

type Tx = Prisma.TransactionClient;

async function lockAccount(tx: Tx, organizationId: string) {
  const rows = await tx.$queryRaw<Array<{ balance: number; reserved: number }>>`
    SELECT balance, reserved FROM "CreditAccount" WHERE "organizationId" = ${organizationId}::uuid FOR UPDATE`;
  if (rows.length === 0) {
    await tx.creditAccount.create({ data: { organizationId } });
    return { balance: 0, reserved: 0 };
  }
  return rows[0];
}

export async function reserveCredits(db: PrismaClient, organizationId: string, referenceId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error('amount must be a non-negative integer');
  return db.$transaction(async (tx) => {
    const account = await lockAccount(tx, organizationId);
    const existing = await tx.creditReservation.findUnique({ where: { referenceId } });
    if (existing) {
      if (existing.organizationId !== organizationId) throw new Error('Reservation reference belongs to another organisation');
      return existing;
    }
    const available = account.balance - account.reserved;
    if (available < amount) throw new InsufficientCreditsError(available, amount);
    await tx.creditAccount.update({ where: { organizationId }, data: { reserved: { increment: amount } } });
    return tx.creditReservation.create({ data: { organizationId, referenceId, amount } });
  });
}

export async function settleCredits(db: PrismaClient, referenceId: string, used?: number, description?: string) {
  return db.$transaction(async (tx) => {
    const r = await tx.creditReservation.findUnique({ where: { referenceId } });
    if (!r) throw new Error(`No reservation for ${referenceId}`);
    if (r.status !== 'RESERVED') return r; // already settled or released — idempotent no-op
    const charge = Math.min(used ?? r.amount, r.amount);
    const account = await lockAccount(tx, r.organizationId);
    const balanceAfter = account.balance - charge;

    await tx.creditAccount.update({
      where: { organizationId: r.organizationId },
      data: { reserved: { decrement: r.amount }, balance: balanceAfter },
    });
    if (charge > 0) {
      await tx.creditTransaction.create({
        data: {
          organizationId: r.organizationId,
          type: 'DEBIT',
          amount: -charge,
          balanceAfter,
          referenceId,
          idempotencyKey: `settle:${referenceId}`,
          description,
        },
      });
    }
    return tx.creditReservation.update({ where: { id: r.id }, data: { status: 'SETTLED', settledAmount: charge } });
  });
}

export async function releaseCredits(db: PrismaClient, referenceId: string) {
  return db.$transaction(async (tx) => {
    const r = await tx.creditReservation.findUnique({ where: { referenceId } });
    if (!r || r.status !== 'RESERVED') return r;
    await lockAccount(tx, r.organizationId);
    await tx.creditAccount.update({ where: { organizationId: r.organizationId }, data: { reserved: { decrement: r.amount } } });
    return tx.creditReservation.update({ where: { id: r.id }, data: { status: 'RELEASED', settledAmount: 0 } });
  });
}

/** Adds credits (plan renewal, top-up, refund, adjustment). Idempotent on key. */
export async function grantCredits(
  db: PrismaClient,
  organizationId: string,
  amount: number,
  idempotencyKey: string,
  opts: { type?: 'CREDIT' | 'REFUND' | 'ADJUSTMENT'; description?: string; referenceId?: string } = {},
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const account = await lockAccount(tx, organizationId);
    const balanceAfter = account.balance + amount;
    if (balanceAfter < 0) throw new InsufficientCreditsError(account.balance, -amount);
    await tx.creditAccount.update({ where: { organizationId }, data: { balance: balanceAfter } });
    return tx.creditTransaction.create({
      data: { organizationId, type: opts.type ?? 'CREDIT', amount, balanceAfter, idempotencyKey, description: opts.description, referenceId: opts.referenceId },
    });
  });
}

export async function getCreditSummary(db: PrismaClient, organizationId: string) {
  const account = await db.creditAccount.findUnique({ where: { organizationId } });
  const balance = account?.balance ?? 0;
  const reserved = account?.reserved ?? 0;
  return { balance, reserved, available: balance - reserved };
}

/** Recomputes balance from the ledger and active holds. Returns any drift found. */
export async function reconcileCredits(db: PrismaClient, organizationId: string) {
  return db.$transaction(async (tx) => {
    const account = await lockAccount(tx, organizationId);
    const ledger = await tx.creditTransaction.aggregate({ where: { organizationId }, _sum: { amount: true } });
    const holds = await tx.creditReservation.aggregate({ where: { organizationId, status: 'RESERVED' }, _sum: { amount: true } });
    const balance = ledger._sum.amount ?? 0;
    const reserved = holds._sum.amount ?? 0;
    const drift = { balance: account.balance - balance, reserved: account.reserved - reserved };
    if (drift.balance !== 0 || drift.reserved !== 0) {
      await tx.creditAccount.update({ where: { organizationId }, data: { balance, reserved } });
    }
    return { balance, reserved, drift };
  });
}
