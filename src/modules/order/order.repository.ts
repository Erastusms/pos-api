import { prisma } from '../../infrastructure/database/prisma.client'
import { parsePagination } from '../../shared/utils/pagination'
import type { ListOrderQuery } from './order.schema'

// ─── Order number generator ───────────────────────────────────────────────────

/**
 * Generate order number dengan format TRX-YYYYMMDD-XXXX.
 * Sequential per outlet per hari — aman dipakai di luar transaction
 * karena uniqueness constraint di DB tetap menjaga konsistensi.
 */
export async function generateOrderNumber(outletId: string): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')

  const count = await prisma.order.count({
    where: {
      outletId,
      createdAt: {
        gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
      },
    },
  })

  const seq = String(count + 1).padStart(4, '0')
  return `TRX-${dateStr}-${seq}`
}

// ─── Shared selects ───────────────────────────────────────────────────────────

const orderItemModifierSelect = {
  id: true,
  modifierId: true,
  name: true,
  price: true,
} as const

const orderItemSelect = {
  id: true,
  orderId: true,
  productId: true,
  variantId: true,
  productName: true,
  productSku: true,
  variantName: true,
  quantity: true,
  unitPrice: true,
  itemDiscountAmount: true,
  lineTotal: true,
  notes: true,
  modifiers: {
    select: orderItemModifierSelect,
    orderBy: { id: 'asc' as const },
  },
} as const

const orderSelect = {
  id: true,
  orderNumber: true,
  outletId: true,
  userId: true,
  cartId: true,
  discountId: true,
  status: true,
  notes: true,
  subtotal: true,
  discountAmount: true,
  discountedSubtotal: true,
  serviceChargeAmount: true,
  taxAmount: true,
  roundingAmount: true,
  total: true,
  discountName: true,
  discountCode: true,
  discountType: true,
  discountScope: true,
  discountValue: true,
  paidAt: true,
  completedAt: true,
  voidedAt: true,
  voidReason: true,
  voidedById: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true } },
  items: {
    select: orderItemSelect,
    orderBy: { id: 'asc' as const },
  },
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderItemModifierRow = {
  id: string
  modifierId: string | null
  name: string
  price: unknown // Prisma Decimal
}

export type OrderItemRow = {
  id: string
  orderId: string
  productId: string | null
  variantId: string | null
  productName: string
  productSku: string
  variantName: string | null
  quantity: unknown // Prisma Decimal
  unitPrice: unknown
  itemDiscountAmount: unknown
  lineTotal: unknown
  notes: string | null
  modifiers: OrderItemModifierRow[]
}

export type OrderRow = {
  id: string
  orderNumber: string
  outletId: string
  userId: string
  cartId: string | null
  discountId: string | null
  status: 'PENDING' | 'PAID' | 'DONE' | 'VOID'
  notes: string | null
  subtotal: unknown
  discountAmount: unknown
  discountedSubtotal: unknown
  serviceChargeAmount: unknown
  taxAmount: unknown
  roundingAmount: unknown
  total: unknown
  discountName: string | null
  discountCode: string | null
  discountType: string | null
  discountScope: string | null
  discountValue: unknown | null
  paidAt: Date | null
  completedAt: Date | null
  voidedAt: Date | null
  voidReason: string | null
  voidedById: string | null
  createdAt: Date
  updatedAt: Date
  user: { id: string; name: string }
  items: OrderItemRow[]
}

// ─── Normalizer — Prisma Decimal → number ─────────────────────────────────────

export function normalizeOrder(row: OrderRow) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    outletId: row.outletId,
    userId: row.userId,
    cartId: row.cartId,
    discountId: row.discountId,
    status: row.status,
    notes: row.notes,
    financial: {
      subtotal: Number(row.subtotal),
      discountAmount: Number(row.discountAmount),
      discountedSubtotal: Number(row.discountedSubtotal),
      serviceChargeAmount: Number(row.serviceChargeAmount),
      taxAmount: Number(row.taxAmount),
      roundingAmount: Number(row.roundingAmount),
      total: Number(row.total),
    },
    discount:
      row.discountName || row.discountId
        ? {
            id: row.discountId,
            name: row.discountName,
            code: row.discountCode,
            type: row.discountType,
            scope: row.discountScope,
            value: row.discountValue !== null ? Number(row.discountValue) : null,
          }
        : null,
    paidAt: row.paidAt,
    completedAt: row.completedAt,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    voidedById: row.voidedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cashier: row.user,
    items: row.items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      productSku: item.productSku,
      variantName: item.variantName,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      itemDiscountAmount: Number(item.itemDiscountAmount),
      lineTotal: Number(item.lineTotal),
      notes: item.notes,
      modifiers: item.modifiers.map((m) => ({
        id: m.id,
        modifierId: m.modifierId,
        name: m.name,
        price: Number(m.price),
      })),
    })),
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const orderRepository = {
  async findMany(outletId: string, query: ListOrderQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const where = {
      outletId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.search
        ? {
            orderNumber: { contains: query.search, mode: 'insensitive' as const },
          }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    }

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: orderSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.order.count({ where }),
    ])

    return { data: data as OrderRow[], page, limit, total }
  },

  findById(id: string): Promise<OrderRow | null> {
    return prisma.order.findUnique({
      where: { id },
      select: orderSelect,
    }) as Promise<OrderRow | null>
  },

  findByCartId(cartId: string): Promise<OrderRow | null> {
    return prisma.order.findUnique({
      where: { cartId },
      select: orderSelect,
    }) as Promise<OrderRow | null>
  },

  /**
   * Buat order lengkap dengan items dan modifiers-nya dalam satu query.
   * Dipanggil dari dalam $transaction di service.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(data: any, tx: any): Promise<OrderRow> {
    return (tx ?? prisma).order.create({
      data,
      select: orderSelect,
    }) as Promise<OrderRow>
  },

  /**
   * Update status order beserta field lifecycle (paidAt, completedAt, dll).
   * Dipanggil dari dalam $transaction di service.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(id: string, data: Record<string, unknown>, tx?: any): Promise<OrderRow> {
    return (tx ?? prisma).order.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
      select: orderSelect,
    }) as Promise<OrderRow>
  },
}
