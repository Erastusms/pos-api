import { prisma } from '../../infrastructure/database/prisma.client'
import { parsePagination } from '../../shared/utils/pagination'
import type { ListDiscountQuery } from './discount.schema'

// ─── Shared select ────────────────────────────────────────────────────────────

const discountSelect = {
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
  _count: { select: { carts: true } },
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiscountRow = {
  id: string
  outletId: string
  name: string
  code: string | null
  description: string | null
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  scope: 'PER_ITEM' | 'PER_BILL'
  value: unknown // Prisma Decimal
  minPurchase: unknown | null
  maxDiscount: unknown | null
  isActive: boolean
  startAt: Date | null
  endAt: Date | null
  createdAt: Date
  updatedAt: Date
  products: { productId: string; product: { id: string; name: string; sku: string } }[]
  _count: { carts: number }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const discountRepository = {
  async findMany(outletId: string, query: ListDiscountQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const isActive =
      query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined

    const now = new Date()

    const where = {
      outletId,
      deletedAt: null,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.scope ? { scope: query.scope } : {}),
      ...(!query.includeExpired
        ? {
            OR: [{ endAt: null }, { endAt: { gte: now } }],
          }
        : {}),
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
      prisma.discount.findMany({
        where,
        select: discountSelect,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      prisma.discount.count({ where }),
    ])

    return { data: data as DiscountRow[], page, limit, total }
  },

  findById(id: string): Promise<DiscountRow | null> {
    return prisma.discount.findFirst({
      where: { id, deletedAt: null },
      select: discountSelect,
    }) as Promise<DiscountRow | null>
  },

  findByCode(code: string, outletId: string): Promise<DiscountRow | null> {
    return prisma.discount.findFirst({
      where: { code, outletId, deletedAt: null },
      select: discountSelect,
    }) as Promise<DiscountRow | null>
  },

  async create(data: {
    outletId: string
    name: string
    code?: string
    description?: string
    type: 'PERCENTAGE' | 'FIXED_AMOUNT'
    scope: 'PER_ITEM' | 'PER_BILL'
    value: number
    minPurchase?: number
    maxDiscount?: number
    isActive: boolean
    startAt?: string
    endAt?: string
    productIds: string[]
  }): Promise<DiscountRow> {
    const { productIds, startAt, endAt, ...rest } = data
    return prisma.discount.create({
      data: {
        ...rest,
        ...(startAt ? { startAt: new Date(startAt) } : {}),
        ...(endAt ? { endAt: new Date(endAt) } : {}),
        products: productIds.length
          ? { create: productIds.map((pid) => ({ productId: pid })) }
          : undefined,
      },
      select: discountSelect,
    }) as Promise<DiscountRow>
  },

  async update(
    id: string,
    data: {
      name?: string
      code?: string | null
      description?: string | null
      type?: 'PERCENTAGE' | 'FIXED_AMOUNT'
      scope?: 'PER_ITEM' | 'PER_BILL'
      value?: number
      minPurchase?: number | null
      maxDiscount?: number | null
      isActive?: boolean
      startAt?: string | null
      endAt?: string | null
      productIds?: string[]
    },
  ): Promise<DiscountRow> {
    const { productIds, startAt, endAt, ...rest } = data

    /**
     * Prisma $transaction callback menerima tipe internal
     * Omit<PrismaClient, '$connect' | '$disconnect' | ...>, bukan typeof prisma.
     * Gunakan `any` agar tidak ada TS2352 / TS2769 error.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await prisma.$transaction(async (tx: any) => {
      // Jika productIds diberikan — replace seluruh daftar produk (delete + recreate)
      if (productIds !== undefined) {
        await tx.discountProduct.deleteMany({ where: { discountId: id } })
      }

      return tx.discount.update({
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
        select: discountSelect,
      })
    })

    return result as DiscountRow
  },

  softDelete(id: string): Promise<DiscountRow> {
    return prisma.discount.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedAt: new Date() },
      select: discountSelect,
    }) as Promise<DiscountRow>
  },
}
