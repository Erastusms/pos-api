import { customerRepository, type CustomerRow, type LoyaltyTxRow } from './customer.repository'
import { withTransaction } from '../../infrastructure/database/transaction'
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomerQuery,
  UpsertLoyaltyProgramInput,
  AdjustPointsInput,
  RedeemPointsInput,
  ListLoyaltyTxQuery,
} from './customer.schema'
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors'
import { parsePagination } from '../../shared/utils/pagination'

// ─── Normalizer ───────────────────────────────────────────────────────────────

/** Konversi Prisma Decimal fields ke number + format birthDate */
function normalizeCustomer(row: CustomerRow, loyaltyPoints = 0) {
  return {
    id: row.id,
    outletId: row.outletId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    birthDate: row.birthDate ? row.birthDate.toISOString().slice(0, 10) : null,
    address: row.address,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    loyaltyPoints,
  }
}

function normalizeLoyaltyTx(row: LoyaltyTxRow) {
  return {
    id: row.id,
    customerId: row.customerId,
    outletId: row.outletId,
    orderId: row.orderId,
    type: row.type,
    points: row.points,
    pointsBefore: row.pointsBefore,
    pointsAfter: row.pointsAfter,
    rupiah: row.rupiah !== null ? Number(row.rupiah) : null,
    description: row.description,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLoyaltyProgram(row: any) {
  return {
    id: row.id,
    outletId: row.outletId,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    pointsPerRupiah: Number(row.pointsPerRupiah),
    minimumSpend: Number(row.minimumSpend),
    pointValue: Number(row.pointValue),
    minimumRedeemPoints: row.minimumRedeemPoints,
    pointExpiryDays: row.pointExpiryDays,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const customerService = {
  // ── Customer CRUD ──────────────────────────────────────────────────────────

  async list(outletId: string, query: ListCustomerQuery) {
    const { data, total, page, limit } = await customerRepository.findMany(outletId, query)

    // Ambil saldo poin per customer secara paralel
    const withPoints = await Promise.all(
      data.map(async (c) => {
        const pts = await customerRepository.getPointBalance(c.id)
        return normalizeCustomer(c, pts)
      }),
    )

    return { data: withPoints, page, limit, total }
  },

  async getById(id: string) {
    const customer = await customerRepository.findById(id)
    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')
    const loyaltyPoints = await customerRepository.getPointBalance(id)
    return normalizeCustomer(customer, loyaltyPoints)
  },

  async create(input: CreateCustomerInput, outletId: string) {
    // Validasi duplikat phone
    if (input.phone) {
      const existingPhone = await customerRepository.findByPhone(input.phone, outletId)
      if (existingPhone) {
        throw new ConflictError(
          `Nomor telepon ${input.phone} sudah terdaftar`,
          'CUSTOMER_PHONE_EXISTS',
        )
      }
    }

    // Validasi duplikat email
    if (input.email) {
      const existingEmail = await customerRepository.findByEmail(input.email, outletId)
      if (existingEmail) {
        throw new ConflictError(`Email ${input.email} sudah terdaftar`, 'CUSTOMER_EMAIL_EXISTS')
      }
    }

    const customer = await customerRepository.create({ ...input, outletId })
    return normalizeCustomer(customer, 0)
  },

  async update(id: string, input: UpdateCustomerInput, outletId: string) {
    const customer = await customerRepository.findById(id)
    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')

    // Validasi phone jika berubah
    if (input.phone && input.phone !== customer.phone) {
      const conflict = await customerRepository.findByPhone(input.phone, outletId)
      if (conflict && conflict.id !== id) {
        throw new ConflictError(
          `Nomor telepon ${input.phone} sudah digunakan customer lain`,
          'CUSTOMER_PHONE_EXISTS',
        )
      }
    }

    // Validasi email jika berubah
    if (input.email && input.email !== customer.email) {
      const conflict = await customerRepository.findByEmail(input.email, outletId)
      if (conflict && conflict.id !== id) {
        throw new ConflictError(
          `Email ${input.email} sudah digunakan customer lain`,
          'CUSTOMER_EMAIL_EXISTS',
        )
      }
    }

    const updated = await customerRepository.update(id, input)
    const loyaltyPoints = await customerRepository.getPointBalance(id)
    return normalizeCustomer(updated, loyaltyPoints)
  },

  async delete(id: string) {
    const customer = await customerRepository.findById(id)
    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')
    const deleted = await customerRepository.softDelete(id)
    return normalizeCustomer(deleted, 0)
  },

  // ── Riwayat transaksi ──────────────────────────────────────────────────────

  async getOrderHistory(
    customerId: string,
    query: { page?: string; limit?: string; status?: string },
  ) {
    const customer = await customerRepository.findById(customerId)
    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')

    const { skip, take, page, limit } = parsePagination(query)

    const { data, total } = await customerRepository.findOrderHistory(customerId, {
      skip,
      take,
      status: query.status,
    })

    const normalized = data.map((o) => ({
      id: o.id,
      orderNumber: (o as Record<string, unknown>)['orderNumber'],
      status: (o as Record<string, unknown>)['status'],
      total: Number((o as Record<string, unknown>)['total']),
      subtotal: Number((o as Record<string, unknown>)['subtotal']),
      discountAmount: Number((o as Record<string, unknown>)['discountAmount']),
      taxAmount: Number((o as Record<string, unknown>)['taxAmount']),
      paidAt: (o as Record<string, unknown>)['paidAt'],
      createdAt: (o as Record<string, unknown>)['createdAt'],
      itemCount: ((o as Record<string, unknown>)['_count'] as Record<string, number>)['items'],
    }))

    return {
      customer: normalizeCustomer(customer),
      data: normalized,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    }
  },

  // ── Loyalty ────────────────────────────────────────────────────────────────

  /**
   * Ringkasan poin: saldo + statistik earn/redeem/expire.
   * Sertakan nilai rupiah dari poin berdasarkan program aktif.
   */
  async getPointSummary(customerId: string, outletId: string) {
    const customer = await customerRepository.findById(customerId)
    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')

    const [balance, stats, program] = await Promise.all([
      customerRepository.getPointBalance(customerId),
      customerRepository.getPointSummary(customerId),
      customerRepository.findLoyaltyProgram(outletId),
    ])

    const pointValue = program ? Number(program.pointValue) : 100

    return {
      customerId,
      customerName: customer.name,
      totalPoints: balance,
      totalEarned: stats.totalEarned,
      totalRedeemed: stats.totalRedeemed,
      totalExpired: stats.totalExpired,
      rupiahValue: balance * pointValue,
    }
  },

  /**
   * Daftar riwayat transaksi poin customer.
   */
  async getLoyaltyTransactions(customerId: string, query: ListLoyaltyTxQuery) {
    const customer = await customerRepository.findById(customerId)
    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')

    const { data, total, page, limit } = await customerRepository.findLoyaltyTransactions(
      customerId,
      query,
    )

    return {
      data: data.map(normalizeLoyaltyTx),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    }
  },

  /**
   * Hitung poin yang akan diperoleh dari transaksi sejumlah `amount`.
   * Gunakan ini sebelum checkout untuk preview poin.
   */
  async previewEarnPoints(amount: number, outletId: string) {
    const program = await customerRepository.findLoyaltyProgram(outletId)
    if (!program || !program.isActive) {
      return { eligible: false, points: 0, reason: 'Program loyalitas tidak aktif' }
    }

    const minimumSpend = Number(program.minimumSpend)
    if (amount < minimumSpend) {
      return {
        eligible: false,
        points: 0,
        reason: `Minimum transaksi Rp ${minimumSpend.toLocaleString('id-ID')} belum terpenuhi`,
      }
    }

    const pointsPerRupiah = Number(program.pointsPerRupiah)
    const points = Math.floor(amount * pointsPerRupiah)
    return { eligible: true, points, reason: null }
  },

  /**
   * Tambah poin ke customer setelah transaksi (EARN).
   * Dipanggil dari Order service setelah payment settlement.
   */
  async earnPoints(customerId: string, outletId: string, orderId: string, amount: number) {
    const [customer, program] = await Promise.all([
      customerRepository.findById(customerId),
      customerRepository.findLoyaltyProgram(outletId),
    ])

    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')
    if (!program || !program.isActive) return null

    const minimumSpend = Number(program.minimumSpend)
    if (amount < minimumSpend) return null

    const pointsToEarn = Math.floor(amount * Number(program.pointsPerRupiah))
    if (pointsToEarn <= 0) return null

    const currentBalance = await customerRepository.getPointBalance(customerId)

    // Hitung expiry date
    let expiresAt: Date | undefined
    if (program.pointExpiryDays > 0) {
      expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + program.pointExpiryDays)
    }

    const tx = await customerRepository.createLoyaltyTransaction({
      customerId,
      outletId,
      orderId,
      type: 'EARN',
      points: pointsToEarn,
      pointsBefore: currentBalance,
      pointsAfter: currentBalance + pointsToEarn,
      rupiah: amount,
      description: `Poin dari order #${orderId}`,
      expiresAt,
    })

    return normalizeLoyaltyTx(tx)
  },

  /**
   * Redeem poin untuk mendapatkan nilai rupiah.
   * Return nilai rupiah yang diperoleh dari redeem.
   */
  async redeemPoints(input: RedeemPointsInput, outletId: string) {
    const [customer, program] = await Promise.all([
      customerRepository.findById(input.customerId),
      customerRepository.findLoyaltyProgram(outletId),
    ])

    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')
    if (!customer.isActive) {
      throw new BadRequestError('Customer tidak aktif', 'CUSTOMER_INACTIVE')
    }
    if (!program || !program.isActive) {
      throw new BadRequestError('Program loyalitas tidak aktif', 'LOYALTY_PROGRAM_INACTIVE')
    }

    const minimumRedeemPoints = program.minimumRedeemPoints
    if (input.points < minimumRedeemPoints) {
      throw new BadRequestError(
        `Minimal redeem ${minimumRedeemPoints} poin`,
        'INSUFFICIENT_REDEEM_POINTS',
      )
    }

    const currentBalance = await customerRepository.getPointBalance(input.customerId)
    if (currentBalance < input.points) {
      throw new BadRequestError(
        `Saldo poin tidak mencukupi. Tersedia: ${currentBalance}, diminta: ${input.points}`,
        'INSUFFICIENT_POINTS',
      )
    }

    const rupiahValue = input.points * Number(program.pointValue)

    const tx = await withTransaction(async (prismaClient) => {
      return customerRepository.createLoyaltyTransaction(
        {
          customerId: input.customerId,
          outletId,
          orderId: input.orderId,
          type: 'REDEEM',
          points: -input.points,
          pointsBefore: currentBalance,
          pointsAfter: currentBalance - input.points,
          rupiah: rupiahValue,
          description: `Redeem ${input.points} poin = Rp ${rupiahValue.toLocaleString('id-ID')}`,
        },
        prismaClient,
      )
    })

    return {
      transaction: normalizeLoyaltyTx(tx),
      rupiahValue,
      newBalance: currentBalance - input.points,
    }
  },

  /**
   * Penyesuaian poin manual oleh admin (positif/negatif).
   */
  async adjustPoints(input: AdjustPointsInput, outletId: string) {
    const customer = await customerRepository.findById(input.customerId)
    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')

    const currentBalance = await customerRepository.getPointBalance(input.customerId)
    const newBalance = currentBalance + input.points

    if (newBalance < 0) {
      throw new BadRequestError(
        `Penyesuaian akan membuat saldo negatif. Saldo saat ini: ${currentBalance}`,
        'NEGATIVE_BALANCE',
      )
    }

    const tx = await customerRepository.createLoyaltyTransaction({
      customerId: input.customerId,
      outletId,
      type: 'ADJUST',
      points: input.points,
      pointsBefore: currentBalance,
      pointsAfter: newBalance,
      description:
        input.description ??
        (input.points > 0 ? 'Penambahan poin manual' : 'Pengurangan poin manual'),
    })

    return {
      transaction: normalizeLoyaltyTx(tx),
      newBalance,
    }
  },

  // ── Loyalty Program ────────────────────────────────────────────────────────

  async getLoyaltyProgram(outletId: string) {
    const program = await customerRepository.findLoyaltyProgram(outletId)
    if (!program) {
      // Return default config jika belum disetup
      return {
        outletId,
        name: 'Program Loyalitas',
        description: null,
        isActive: false,
        pointsPerRupiah: 1,
        minimumSpend: 10000,
        pointValue: 100,
        minimumRedeemPoints: 100,
        pointExpiryDays: 365,
        createdAt: null,
        updatedAt: null,
      }
    }
    return normalizeLoyaltyProgram(program)
  },

  async upsertLoyaltyProgram(input: UpsertLoyaltyProgramInput, outletId: string) {
    const program = await customerRepository.upsertLoyaltyProgram(outletId, input)
    return normalizeLoyaltyProgram(program)
  },
}
