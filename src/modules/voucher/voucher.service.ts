import { prisma } from '../../infrastructure/database/prisma.client'
import { withTransaction } from '../../infrastructure/database/transaction'
import { voucherRepository, type VoucherRow } from './voucher.repository'
import {
  computeVoucherDiscount,
  validateVoucherEligibility,
  pickBestAutoApplyVoucher,
  type VoucherDef,
  type LineItemForVoucher,
} from './voucher.engine'
import type {
  CreateVoucherInput,
  UpdateVoucherInput,
  ListVoucherQuery,
  ValidateVoucherInput,
  AutoApplyQuery,
  ListRedemptionQuery,
} from './voucher.schema'
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors'

// ─── Normalizer ───────────────────────────────────────────────────────────────

export function normalizeVoucher(row: VoucherRow) {
  const now = new Date()
  const isExpired = row.endAt !== null && row.endAt < now
  const isLimitReached = row.usageLimit !== null && row.usageCount >= row.usageLimit
  const remainingUses =
    row.usageLimit !== null ? Math.max(0, row.usageLimit - row.usageCount) : null

  return {
    id: row.id,
    outletId: row.outletId,
    name: row.name,
    code: row.code,
    description: row.description,
    type: row.type,
    scope: row.scope,
    value: Number(row.value),
    minPurchase: row.minPurchase !== null ? Number(row.minPurchase) : null,
    maxDiscount: row.maxDiscount !== null ? Number(row.maxDiscount) : null,
    usageLimit: row.usageLimit,
    usageLimitPerCustomer: row.usageLimitPerCustomer,
    usageCount: row.usageCount,
    autoApply: row.autoApply,
    priority: row.priority,
    customerId: row.customerId,
    isActive: row.isActive,
    startAt: row.startAt,
    endAt: row.endAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    products: row.products,
    _count: row._count,
    // Computed helpers
    isExpired,
    isUsageLimitReached: isLimitReached,
    remainingUses,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRedemption(row: any) {
  return {
    id: row.id,
    voucherId: row.voucherId,
    outletId: row.outletId,
    customerId: row.customerId,
    orderId: row.orderId,
    discountAmount: Number(row.discountAmount),
    redeemedAt: row.redeemedAt,
    customer: row.customer ?? null,
  }
}

/** Konversi VoucherRow → VoucherDef (tipe yang digunakan engine) */
function toVoucherDef(row: VoucherRow): VoucherDef {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    type: row.type,
    scope: row.scope,
    value: Number(row.value),
    minPurchase: row.minPurchase !== null ? Number(row.minPurchase) : null,
    maxDiscount: row.maxDiscount !== null ? Number(row.maxDiscount) : null,
    usageLimit: row.usageLimit,
    usageLimitPerCustomer: row.usageLimitPerCustomer,
    usageCount: row.usageCount,
    autoApply: row.autoApply,
    isActive: row.isActive,
    startAt: row.startAt,
    endAt: row.endAt,
    productIds: row.products.map((p) => p.productId),
  }
}

// ─── Guards ───────────────────────────────────────────────────────────────────

async function ensureCodeUnique(code: string, outletId: string, excludeId?: string) {
  const existing = await voucherRepository.findByCode(code, outletId)
  if (existing && existing.id !== excludeId) {
    throw new ConflictError(
      `Kode voucher "${code}" sudah digunakan di outlet ini`,
      'VOUCHER_CODE_EXISTS',
    )
  }
}

async function validateProductIds(productIds: string[], outletId: string) {
  if (!productIds.length) return
  const found = await voucherRepository.validateProductIds(productIds, outletId)
  if (found !== productIds.length) {
    throw new BadRequestError(
      'Satu atau lebih productId tidak ditemukan atau tidak aktif di outlet ini',
      'PRODUCT_NOT_FOUND',
    )
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const voucherService = {
  // ── Voucher CRUD ───────────────────────────────────────────────────────────

  async list(outletId: string, query: ListVoucherQuery) {
    const { data, page, limit, total } = await voucherRepository.findMany(outletId, query)
    return { data: data.map(normalizeVoucher), page, limit, total }
  },

  async getById(id: string) {
    const voucher = await voucherRepository.findById(id)
    if (!voucher) throw new NotFoundError('Voucher', 'VOUCHER_NOT_FOUND')
    return normalizeVoucher(voucher)
  },

  async create(input: CreateVoucherInput, outletId: string) {
    if (input.code) {
      await ensureCodeUnique(input.code, outletId)
    }
    if (input.scope === 'PER_ITEM') {
      await validateProductIds(input.productIds, outletId)
    }
    // customerId targeting: pastikan customer ada
    if (input.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: input.customerId, outletId, deletedAt: null },
      })
      if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')
    }

    const voucher = await voucherRepository.create({ ...input, outletId })
    return normalizeVoucher(voucher)
  },

  async update(id: string, input: UpdateVoucherInput, outletId: string) {
    const voucher = await voucherRepository.findById(id)
    if (!voucher) throw new NotFoundError('Voucher', 'VOUCHER_NOT_FOUND')

    if (input.code && input.code !== voucher.code) {
      await ensureCodeUnique(input.code, outletId, id)
    }

    const newScope = input.scope ?? voucher.scope
    const newProductIds = input.productIds
    if (newScope === 'PER_ITEM' && newProductIds !== undefined) {
      if (newProductIds.length === 0) {
        throw new BadRequestError(
          'Voucher PER_ITEM harus memiliki minimal 1 produk',
          'PRODUCT_REQUIRED',
        )
      }
      await validateProductIds(newProductIds, outletId)
    }

    if (input.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: input.customerId, outletId, deletedAt: null },
      })
      if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')
    }

    const updated = await voucherRepository.update(id, input)
    return normalizeVoucher(updated)
  },

  async delete(id: string) {
    const voucher = await voucherRepository.findById(id)
    if (!voucher) throw new NotFoundError('Voucher', 'VOUCHER_NOT_FOUND')

    // Cek apakah masih ada cart aktif yang memakai voucher ini
    const activeCarts = await prisma.cart.count({
      where: { voucherId: id, status: 'ACTIVE' },
    })
    if (activeCarts > 0) {
      throw new BadRequestError(
        `Voucher masih digunakan oleh ${activeCarts} cart aktif`,
        'VOUCHER_IN_USE',
      )
    }

    return normalizeVoucher(await voucherRepository.softDelete(id))
  },

  // ── Validate ───────────────────────────────────────────────────────────────

  /**
   * Validasi kode voucher tanpa menggunakannya.
   * Mengembalikan voucher + preview diskon jika valid.
   */
  async validate(input: ValidateVoucherInput, outletId: string) {
    const row = await voucherRepository.findByCode(input.code, outletId)

    if (!row) {
      return {
        valid: false,
        reason: 'Kode voucher tidak ditemukan',
        voucher: null,
        discountPreview: null,
      }
    }

    // Cek targeting customer jika voucher punya customerId
    if (row.customerId && input.customerId && row.customerId !== input.customerId) {
      return {
        valid: false,
        reason: 'Voucher ini tidak berlaku untuk akun Anda',
        voucher: null,
        discountPreview: null,
      }
    }

    const usageByCustomer = input.customerId
      ? await voucherRepository.countUsageByCustomer(row.id, input.customerId)
      : 0

    const voucherDef = toVoucherDef(row)
    const { valid, reason } = validateVoucherEligibility(voucherDef, {
      subtotal: input.subtotal,
      usageByCustomer,
    })

    if (!valid) {
      return { valid: false, reason, voucher: normalizeVoucher(row), discountPreview: null }
    }

    // Preview diskon — lineItems kosong jika tidak dikirim
    const discountPreview = computeVoucherDiscount([], input.subtotal, voucherDef)

    return {
      valid: true,
      reason: null,
      voucher: normalizeVoucher(row),
      discountPreview: {
        discountAmount: discountPreview.discountAmount,
        discountedSubtotal: Math.max(0, input.subtotal - discountPreview.discountAmount),
        itemDiscountMap: discountPreview.itemDiscountMap,
      },
    }
  },

  // ── Apply ke Cart ──────────────────────────────────────────────────────────

  /**
   * Terapkan voucher ke cart — by code atau voucherId.
   * Return cart row dengan voucherId terisi (caller harus call withSummary).
   */
  async applyToCart(
    cartId: string,
    input: { code?: string; voucherId?: string; customerId?: string },
    outletId: string,
  ) {
    // Resolve voucher
    let voucherRow: VoucherRow | null = null
    if (input.voucherId) {
      voucherRow = await voucherRepository.findById(input.voucherId)
    } else if (input.code) {
      voucherRow = await voucherRepository.findByCode(input.code, outletId)
    }

    if (!voucherRow) throw new NotFoundError('Voucher', 'VOUCHER_NOT_FOUND')

    // Validasi targeting
    if (voucherRow.customerId && input.customerId && voucherRow.customerId !== input.customerId) {
      throw new BadRequestError(
        'Voucher ini tidak berlaku untuk akun Anda',
        'VOUCHER_NOT_FOR_CUSTOMER',
      )
    }

    const usageByCustomer = input.customerId
      ? await voucherRepository.countUsageByCustomer(voucherRow.id, input.customerId)
      : 0

    const { valid, reason } = validateVoucherEligibility(toVoucherDef(voucherRow), {
      subtotal: 0, // akan dicek ulang saat checkout
      usageByCustomer,
    })

    if (!valid) throw new BadRequestError(reason ?? 'Voucher tidak valid', 'VOUCHER_INVALID')

    await prisma.cart.update({
      where: { id: cartId },
      data: { voucherId: voucherRow.id, updatedAt: new Date() },
    })

    return normalizeVoucher(voucherRow)
  },

  async removeFromCart(cartId: string) {
    await prisma.cart.update({
      where: { id: cartId },
      data: { voucherId: null, updatedAt: new Date() },
    })
  },

  // ── Auto-apply ─────────────────────────────────────────────────────────────

  /**
   * Cari voucher auto-apply terbaik untuk subtotal tertentu.
   * Digunakan oleh cart.service saat menghitung summary.
   */
  async findBestAutoApply(
    outletId: string,
    subtotal: number,
    lineItems: LineItemForVoucher[],
    customerId?: string,
  ) {
    const rows = await voucherRepository.findAutoApply(outletId)
    if (!rows.length) return null

    // Hitung usage per customer untuk semua voucher sekaligus
    const usageByCustomer: Record<string, number> = {}
    if (customerId) {
      await Promise.all(
        rows.map(async (r) => {
          usageByCustomer[r.id] = await voucherRepository.countUsageByCustomer(r.id, customerId)
        }),
      )
    }

    const vouchers = rows.map(toVoucherDef)
    const best = pickBestAutoApplyVoucher(vouchers, lineItems, subtotal, { usageByCustomer })
    return best
      ? {
          voucher: normalizeVoucher(rows.find((r) => r.id === best.voucher.id)!),
          result: best.result,
        }
      : null
  },

  /**
   * Endpoint publik: GET /vouchers/auto-apply?subtotal=…
   * Mengembalikan voucher auto-apply terbaik + preview diskon.
   */
  async getAutoApply(outletId: string, query: AutoApplyQuery) {
    const result = await voucherService.findBestAutoApply(
      outletId,
      query.subtotal,
      [], // tanpa detail item — hanya PER_BILL yang akurat; PER_ITEM butuh cart
      query.customerId,
    )

    if (!result) {
      return { autoApply: false, voucher: null, discountPreview: null }
    }

    return {
      autoApply: true,
      voucher: result.voucher,
      discountPreview: {
        discountAmount: result.result.discountAmount,
        discountedSubtotal: Math.max(0, query.subtotal - result.result.discountAmount),
      },
    }
  },

  // ── Redemption ─────────────────────────────────────────────────────────────

  async getRedemptions(voucherId: string, query: ListRedemptionQuery) {
    const voucher = await voucherRepository.findById(voucherId)
    if (!voucher) throw new NotFoundError('Voucher', 'VOUCHER_NOT_FOUND')

    const { data, page, limit, total } = await voucherRepository.findRedemptions(voucherId, query)
    return { data: data.map(normalizeRedemption), page, limit, total }
  },

  // ── Checkout integration ───────────────────────────────────────────────────

  /**
   * Digunakan oleh order.service saat checkout:
   * 1. Re-validasi voucher (kondisi mungkin berubah sejak voucher ditambah ke cart)
   * 2. Hitung discountAmount final
   * 3. Increment usageCount + catat redemption dalam transaksi yang sama
   *
   * Return: { voucherDef, discountAmount, itemDiscountMap } atau null jika tidak ada voucher.
   */
  async processCheckout(opts: {
    voucherId?: string | null
    outletId: string
    customerId?: string | null
    subtotal: number
    lineItems: LineItemForVoucher[]
    orderId: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any
  }): Promise<{
    voucherDef: VoucherDef
    discountAmount: number
    itemDiscountMap: Record<string, number>
  } | null> {
    if (!opts.voucherId) return null

    const row = await prisma.voucher.findFirst({
      where: { id: opts.voucherId, deletedAt: null },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        scope: true,
        value: true,
        minPurchase: true,
        maxDiscount: true,
        usageLimit: true,
        usageLimitPerCustomer: true,
        usageCount: true,
        autoApply: true,
        isActive: true,
        startAt: true,
        endAt: true,
        products: { select: { productId: true } },
      },
    })

    if (!row) return null

    const voucherDef: VoucherDef = {
      id: row.id,
      name: row.name,
      code: row.code,
      type: row.type as 'PERCENTAGE' | 'FIXED_AMOUNT',
      scope: row.scope as 'PER_BILL' | 'PER_ITEM',
      value: Number(row.value),
      minPurchase: row.minPurchase ? Number(row.minPurchase) : null,
      maxDiscount: row.maxDiscount ? Number(row.maxDiscount) : null,
      usageLimit: row.usageLimit,
      usageLimitPerCustomer: row.usageLimitPerCustomer,
      usageCount: row.usageCount,
      autoApply: row.autoApply,
      isActive: row.isActive,
      startAt: row.startAt,
      endAt: row.endAt,
      productIds: row.products.map((p: { productId: string }) => p.productId),
    }

    const usageByCustomer = opts.customerId
      ? await opts.tx.voucherRedemption.count({
          where: { voucherId: row.id, customerId: opts.customerId },
        })
      : 0

    const { valid, reason } = validateVoucherEligibility(voucherDef, {
      subtotal: opts.subtotal,
      usageByCustomer,
    })

    if (!valid) {
      // Voucher sudah tidak valid saat checkout (race condition / kadaluarsa)
      // Lanjutkan tanpa voucher — tidak throw error agar order tetap bisa dibuat
      console.warn(`⚠️  Voucher ${row.id} tidak valid saat checkout: ${reason}`)
      return null
    }

    const { discountAmount, itemDiscountMap } = computeVoucherDiscount(
      opts.lineItems,
      opts.subtotal,
      voucherDef,
    )

    // Atomic: increment + catat redemption
    await voucherRepository.incrementUsage(row.id, opts.tx)
    await voucherRepository.createRedemption(
      {
        voucherId: row.id,
        outletId: opts.outletId,
        customerId: opts.customerId ?? undefined,
        orderId: opts.orderId,
        discountAmount,
      },
      opts.tx,
    )

    return { voucherDef, discountAmount, itemDiscountMap }
  },

  /**
   * Kembalikan usageCount saat order di-void (tidak buat redemption negatif,
   * cukup decrement counter).
   * Dipanggil dari order.service.voidOrder() di dalam tx.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async processVoid(voucherId: string | null | undefined, tx: any) {
    if (!voucherId) return
    await voucherRepository.decrementUsage(voucherId, tx)
  },
}
