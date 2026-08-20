import type { Prisma } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";

/**
 * Interactive transactions on remote/serverless hosts (e.g. Neon) routinely
 * exceed Prisma's 5s default timeout under cold compute + connection churn.
 * All interactive transactions must go through this wrapper.
 */
export const DB_TX_TIMEOUT_MS = 30_000;

export async function runDbTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prismaUnscoped.$transaction(fn, { timeout: DB_TX_TIMEOUT_MS });
}