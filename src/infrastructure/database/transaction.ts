import { prisma } from './prisma.client'

/**
 * Executes a callback inside a Prisma database transaction.
 * All operations inside the callback are atomic — if one fails, all are rolled back.
 *
 * @example
 * const result = await withTransaction(async (tx) => {
 *   const order = await tx.order.create({ data: { ... } })
 *   await tx.inventory.update({ where: { id }, data: { stock: { decrement: 1 } } })
 *   return order
 * })
 */
export async function withTransaction<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (tx: any) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(callback)
}
