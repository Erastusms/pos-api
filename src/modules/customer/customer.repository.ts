import { prisma } from '../../infrastructure/database/prisma.client'
import { parsePagination } from '../../shared/utils/pagination'
import type {
  ListCustomerQuery,
  CreateCustomerInput,
  UpdateCustomerInput,
  ListLoyaltyTxQuery,
} from './customer.schema'

// ─── Shared select shapes ─────────────────────────────────────────────────────

const customerSelect = {
  id: true,
  outletId: true,
  name: true,
  email: true,
  phone: true,
  birthDate: true,
  address: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const

const loyaltyTxSelect = {
  id: true,
  customerId: true,
  outletId: true,
  orderId: true,
  type: true,
  points: true,
  pointsBefore: true,
  pointsAfter: true,
  rupiah: true,
  description: true,
  expiresAt: true,
  createdAt: true,
} as const

const loyaltyProgramSelect = {
  id: true,
  outletId: true,
  name: true,
  description: true,
  isActive: true,
  pointsPerRupiah: true,
  minimumSpend: true,
  pointValue: true,
  minimumRedeemPoints: true,
  pointExpiryDays: true,
  createdAt: true,
  updatedAt: true,
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

export type CustomerRow = {
  id: string
  outletId: string
  name: string
  email: string | null
  phone: string | null
  birthDate: Date | null
  address: string | null
  notes: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type LoyaltyTxRow = {
  id: string
  customerId: string
  outletId: string
  orderId: string | null
  type: 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST' | 'REFUND'
  points: number
  pointsBefore: number
  pointsAfter: number
  rupiah: unknown // Prisma Decimal
  description: string | null
  expiresAt: Date | null
  createdAt: Date
}

export type LoyaltyProgramRow = {
  id: string
  outletId: string
  name: string
  description: string | null
  isActive: boolean
  pointsPerRupiah: unknown // Prisma Decimal
  minimumSpend: unknown
  pointValue: unknown
  minimumRedeemPoints: number
  pointExpiryDays: number
  createdAt: Date
  updatedAt: Date
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const customerRepository = {
  // ── Customer CRUD ──────────────────────────────────────────────────────────

  async findMany(outletId: string, query: ListCustomerQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const isActive =
      query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined

    const where = {
      outletId,
      deletedAt: null,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [data, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        select: customerSelect,
        skip,
        take,
        orderBy: { name: 'asc' },
      }),
      prisma.customer.count({ where }),
    ])

    return { data: data as CustomerRow[], total, page, limit }
  },

  findById(id: string): Promise<CustomerRow | null> {
    return prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: customerSelect,
    }) as Promise<CustomerRow | null>
  },

  findByPhone(phone: string, outletId: string): Promise<CustomerRow | null> {
    return prisma.customer.findFirst({
      where: { phone, outletId, deletedAt: null },
      select: customerSelect,
    }) as Promise<CustomerRow | null>
  },

  findByEmail(email: string, outletId: string): Promise<CustomerRow | null> {
    return prisma.customer.findFirst({
      where: { email, outletId, deletedAt: null },
      select: customerSelect,
    }) as Promise<CustomerRow | null>
  },

  create(data: CreateCustomerInput & { outletId: string }): Promise<CustomerRow> {
    return prisma.customer.create({
      data: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
      },
      select: customerSelect,
    }) as Promise<CustomerRow>
  },

  update(id: string, data: UpdateCustomerInput): Promise<CustomerRow> {
    return prisma.customer.update({
      where: { id },
      data: {
        ...data,
        ...(data.birthDate !== undefined
          ? { birthDate: data.birthDate ? new Date(data.birthDate) : null }
          : {}),
        updatedAt: new Date(),
      },
      select: customerSelect,
    }) as Promise<CustomerRow>
  },

  softDelete(id: string): Promise<CustomerRow> {
    return prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedAt: new Date() },
      select: customerSelect,
    }) as Promise<CustomerRow>
  },

  // ── Riwayat transaksi customer ─────────────────────────────────────────────

  async findOrderHistory(
    customerId: string,
    opts: { skip: number; take: number; status?: string },
  ) {
    const where = {
      customerId,
      ...(opts.status ? { status: opts.status as never } : {}),
    }

    const [data, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          paidAt: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
        skip: opts.skip,
        take: opts.take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ])

    return { data, total }
  },

  // ── Loyalty — poin balance ─────────────────────────────────────────────────

  /**
   * Hitung saldo poin aktif customer (sudah mempertimbangkan expiry).
   * Query langsung ke DB tanpa cache untuk akurasi real-time.
   */
  async getPointBalance(customerId: string): Promise<number> {
    const result = await prisma.loyaltyTransaction.aggregate({
      where: { customerId },
      _sum: { points: true },
    })
    return Math.max(0, result._sum.points ?? 0)
  },

  /**
   * Statistik poin (total earn, redeem, expire).
   */
  async getPointSummary(customerId: string) {
    const [earnResult, redeemResult, expireResult] = await prisma.$transaction([
      prisma.loyaltyTransaction.aggregate({
        where: { customerId, type: 'EARN' },
        _sum: { points: true },
      }),
      prisma.loyaltyTransaction.aggregate({
        where: { customerId, type: { in: ['REDEEM'] } },
        _sum: { points: true },
      }),
      prisma.loyaltyTransaction.aggregate({
        where: { customerId, type: 'EXPIRE' },
        _sum: { points: true },
      }),
    ])

    return {
      totalEarned: earnResult._sum.points ?? 0,
      totalRedeemed: Math.abs(redeemResult._sum.points ?? 0),
      totalExpired: Math.abs(expireResult._sum.points ?? 0),
    }
  },

  // ── Loyalty — transaksi poin ───────────────────────────────────────────────

  async findLoyaltyTransactions(customerId: string, query: ListLoyaltyTxQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const where = {
      customerId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    }

    const [data, total] = await prisma.$transaction([
      prisma.loyaltyTransaction.findMany({
        where,
        select: loyaltyTxSelect,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.loyaltyTransaction.count({ where }),
    ])

    return { data: data as LoyaltyTxRow[], total, page, limit }
  },

  /**
   * Catat transaksi poin.
   * Dipanggil di dalam withTransaction() dari service.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createLoyaltyTransaction(
    data: {
      customerId: string
      outletId: string
      orderId?: string
      type: 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST' | 'REFUND'
      points: number
      pointsBefore: number
      pointsAfter: number
      rupiah?: number
      description?: string
      expiresAt?: Date
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    },
    tx?: any,
  ): Promise<LoyaltyTxRow> {
    const client = tx ?? prisma
    return client.loyaltyTransaction.create({
      data,
      select: loyaltyTxSelect,
    }) as Promise<LoyaltyTxRow>
  },

  // ── Loyalty Program ────────────────────────────────────────────────────────

  findLoyaltyProgram(outletId: string): Promise<LoyaltyProgramRow | null> {
    return prisma.loyaltyProgram.findUnique({
      where: { outletId },
      select: loyaltyProgramSelect,
    }) as Promise<LoyaltyProgramRow | null>
  },

  upsertLoyaltyProgram(
    outletId: string,
    data: {
      name?: string
      description?: string
      isActive?: boolean
      pointsPerRupiah?: number
      minimumSpend?: number
      pointValue?: number
      minimumRedeemPoints?: number
      pointExpiryDays?: number
    },
  ): Promise<LoyaltyProgramRow> {
    return prisma.loyaltyProgram.upsert({
      where: { outletId },
      create: {
        outletId,
        name: data.name ?? 'Program Loyalitas',
        description: data.description,
        isActive: data.isActive ?? true,
        pointsPerRupiah: data.pointsPerRupiah ?? 1,
        minimumSpend: data.minimumSpend ?? 10000,
        pointValue: data.pointValue ?? 100,
        minimumRedeemPoints: data.minimumRedeemPoints ?? 100,
        pointExpiryDays: data.pointExpiryDays ?? 365,
      },
      update: { ...data, updatedAt: new Date() },
      select: loyaltyProgramSelect,
    }) as Promise<LoyaltyProgramRow>
  },
}
