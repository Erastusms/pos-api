import { prisma } from '../../infrastructure/database/prisma.client'
import { parsePagination } from '../../shared/utils/pagination'
import type { ListVoucherQuery, ListRedemptionQuery } from './voucher.schema'

// ─── Shared select shapes ─────────────────────────────────────────────────────

const voucherSelect = {
  id: true,
  outletId: true,
  name: true,
  code: true,
  description: true,
  type: true,
  scope: true,
  value: true,
  minPurchase: true,
  maxDiscount: true,
  usageLimit: true,
  usageLimitPerCustomer: true,
  usageCount: true,
  autoApply: true,
  priority: true,
  customerId: true,
  isActive: true,
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
  products: {
    select: {
      productId: true,
      product: { select: { id: true, name: true, sku: true } },
    },
  },
  _count: { select: { redemptions: true } },
} as const

const redemptionSelect = {
  id: true,
  voucherId: true,
  outletId: true,
  customerId: true,
  orderId: true,
  discountAmount: true,
  redeemedAt: true,
  customer: {
    select: { id: true, name: true, phone: true },
  },
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoucherRow = {
  id: string
  outletId: string
  name: string
  code: string | null
  description: string | null
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  scope: 'PER_BILL' | 'PER_ITEM'
  value: unknown // Prisma Decimal
  minPurchase: unknown | null
  maxDiscount: unknown | null
  usageLimit: number | null
  usageLimitPerCustomer: number | null
  usageCount: number
  autoApply: boolean
  priority: number
  customerId: string | null
  isActive: boolean
  startAt: Date | null
  endAt: Date | null
  createdAt: Date
  updatedAt: Date
  products: { productId: string; product: { id: string; name: string; sku: string } }[]
  _count: { redemptions: number }
}

export type RedemptionRow = {
  id: string
  voucherId: string
  outletId: string
  customerId: string | null
  orderId: string | null
  discountAmount: unknown
  redeemedAt: Date
  customer: { id: string; name: string; phone: string | null } | null
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const voucherRepository = {
  // ── Voucher CRUD ───────────────────────────────────────────────────────────

  async findMany(outletId: string, query: ListVoucherQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const isActive =
      query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined

    const autoApply =
      query.autoApply === 'true' ? true : query.autoApply === 'false' ? false : undefined

    const now = new Date()

    const where = {
      outletId,
      deletedAt: null,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(autoApply !== undefined ? { autoApply } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.scope ? { scope: query.scope } : {}),
      ...(!query.includeExpired ? { OR: [{ endAt: null }, { endAt: { gte: now } }] } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [data, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        select: voucherSelect,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      prisma.voucher.count({ where }),
    ])

    return { data: data as VoucherRow[], page, limit, total }
  },

  findById(id: string): Promise<VoucherRow | null> {
    return prisma.voucher.findFirst({
      where: { id, deletedAt: null },
      select: voucherSelect,
    }) as Promise<VoucherRow | null>
  },

  findByCode(code: string, outletId: string): Promise<VoucherRow | null> {
    return prisma.voucher.findFirst({
      where: { code, outletId, deletedAt: null },
      select: voucherSelect,
    }) as Promise<VoucherRow | null>
  },

  /**
   * Ambil semua voucher autoApply yang aktif dan belum expired, diurutkan priority DESC.
   * Digunakan oleh engine untuk menentukan voucher mana yang diterapkan otomatis.
   */
  findAutoApply(outletId: string): Promise<VoucherRow[]> {
    const now = new Date()
    return prisma.voucher.findMany({
      where: {
        outletId,
        deletedAt: null,
        isActive: true,
        autoApply: true,
        OR: [{ startAt: null }, { startAt: { lte: now } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
      },
      select: voucherSelect,
      orderBy: { priority: 'desc' },
    }) as Promise<VoucherRow[]>
  },

  async create(data: {
    outletId: string
    name: string
    code?: string
    description?: string
    type: 'PERCENTAGE' | 'FIXED_AMOUNT'
    scope: 'PER_BILL' | 'PER_ITEM'
    value: number
    minPurchase?: number
    maxDiscount?: number
    usageLimit?: number
    usageLimitPerCustomer?: number
    autoApply: boolean
    priority: number
    customerId?: string
    isActive: boolean
    startAt?: string
    endAt?: string
    productIds: string[]
  }): Promise<VoucherRow> {
    const { productIds, startAt, endAt, ...rest } = data
    return prisma.voucher.create({
      data: {
        ...rest,
        ...(startAt ? { startAt: new Date(startAt) } : {}),
        ...(endAt ? { endAt: new Date(endAt) } : {}),
        ...(productIds.length
          ? { products: { create: productIds.map((pid) => ({ productId: pid })) } }
          : {}),
      },
      select: voucherSelect,
    }) as Promise<VoucherRow>
  },

  async update(
    id: string,
    data: {
      name?: string
      code?: string | null
      description?: string | null
      type?: 'PERCENTAGE' | 'FIXED_AMOUNT'
      scope?: 'PER_BILL' | 'PER_ITEM'
      value?: number
      minPurchase?: number | null
      maxDiscount?: number | null
      usageLimit?: number | null
      usageLimitPerCustomer?: number | null
      autoApply?: boolean
      priority?: number
      customerId?: string | null
      isActive?: boolean
      startAt?: string | null
      endAt?: string | null
      productIds?: string[]
    },
  ): Promise<VoucherRow> {
    const { productIds, startAt, endAt, ...rest } = data

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return prisma.$transaction(async (tx: any) => {
      if (productIds !== undefined) {
        await tx.voucherProduct.deleteMany({ where: { voucherId: id } })
      }
      return tx.voucher.update({
        where: { id },
        data: {
          ...rest,
          ...(startAt !== undefined ? { startAt: startAt ? new Date(startAt) : null } : {}),
          ...(endAt !== undefined ? { endAt: endAt ? new Date(endAt) : null } : {}),
          updatedAt: new Date(),
          ...(productIds?.length
            ? { products: { create: productIds.map((pid: string) => ({ productId: pid })) } }
            : {}),
        },
        select: voucherSelect,
      })
    }) as Promise<VoucherRow>
  },

  softDelete(id: string): Promise<VoucherRow> {
    return prisma.voucher.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedAt: new Date() },
      select: voucherSelect,
    }) as Promise<VoucherRow>
  },

  // ── Usage tracking ─────────────────────────────────────────────────────────

  /**
   * Increment usageCount secara atomic.
   * Dipanggil di dalam $transaction saat order dibuat.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  incrementUsage(id: string, tx?: any) {
    const client = tx ?? prisma
    return client.voucher.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
      select: { id: true, usageCount: true },
    })
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decrementUsage(id: string, tx?: any) {
    const client = tx ?? prisma
    return client.voucher.update({
      where: { id },
      data: { usageCount: { decrement: 1 } },
      select: { id: true, usageCount: true },
    })
  },

  /** Hitung berapa kali customer tertentu sudah pakai voucher ini */
  countUsageByCustomer(voucherId: string, customerId: string): Promise<number> {
    return prisma.voucherRedemption.count({
      where: { voucherId, customerId },
    })
  },

  // ── Redemption ─────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createRedemption(
    data: {
      voucherId: string
      outletId: string
      customerId?: string
      orderId?: string
      discountAmount: number
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    },
    tx?: any,
  ): Promise<RedemptionRow> {
    const client = tx ?? prisma
    return client.voucherRedemption.create({
      data,
      select: redemptionSelect,
    }) as Promise<RedemptionRow>
  },

  async findRedemptions(voucherId: string, query: ListRedemptionQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const where = {
      voucherId,
      ...(query.startDate || query.endDate
        ? {
            redeemedAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    }

    const [data, total] = await Promise.all([
      prisma.voucherRedemption.findMany({
        where,
        select: redemptionSelect,
        orderBy: { redeemedAt: 'desc' },
        skip,
        take,
      }),
      prisma.voucherRedemption.count({ where }),
    ])

    return { data: data as RedemptionRow[], page, limit, total }
  },

  // ── Product validation ─────────────────────────────────────────────────────

  validateProductIds(productIds: string[], outletId: string): Promise<number> {
    return prisma.product.count({
      where: { id: { in: productIds }, outletId, deletedAt: null, isActive: true },
    })
  },
}
