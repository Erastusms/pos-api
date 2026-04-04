import { prisma } from '../../infrastructure/database/prisma.client'
import { discountRepository, type DiscountRow } from './discount.repository'
import type { CreateDiscountInput, UpdateDiscountInput, ListDiscountQuery } from './discount.schema'
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors'

// ─── Shared normalizer ────────────────────────────────────────────────────────

/** Konversi Prisma Decimal fields ke number agar respons JSON bersih */
export function normalizeDiscount(d: DiscountRow) {
  return {
    id: d.id,
    outletId: d.outletId,
    name: d.name,
    code: d.code,
    description: d.description,
    type: d.type,
    scope: d.scope,
    value: Number(d.value),
    minPurchase: d.minPurchase !== null ? Number(d.minPurchase) : null,
    maxDiscount: d.maxDiscount !== null ? Number(d.maxDiscount) : null,
    isActive: d.isActive,
    startAt: d.startAt,
    endAt: d.endAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    products: d.products,
    _count: d._count,
  }
}

// ─── Guards ───────────────────────────────────────────────────────────────────

/** Pastikan produk-produk yang diberikan ada & milik outlet ini */
async function validateProductIds(productIds: string[], outletId: string) {
  if (!productIds.length) return

  const found = await prisma.product.count({
    where: { id: { in: productIds }, outletId, deletedAt: null, isActive: true },
  })

  if (found !== productIds.length) {
    throw new BadRequestError(
      'Satu atau lebih productId tidak ditemukan di outlet ini',
      'PRODUCT_NOT_FOUND',
    )
  }
}

/** Pastikan kode promo belum dipakai di outlet yang sama */
async function ensureCodeUnique(code: string, outletId: string, excludeId?: string) {
  const existing = await discountRepository.findByCode(code, outletId)
  if (existing && existing.id !== excludeId) {
    throw new ConflictError(
      `Kode promo "${code}" sudah digunakan di outlet ini`,
      'DISCOUNT_CODE_EXISTS',
    )
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const discountService = {
  async list(outletId: string, query: ListDiscountQuery) {
    const { data, page, limit, total } = await discountRepository.findMany(outletId, query)
    return { data: data.map(normalizeDiscount), page, limit, total }
  },

  async getById(id: string) {
    const discount = await discountRepository.findById(id)
    if (!discount) throw new NotFoundError('Diskon', 'DISCOUNT_NOT_FOUND')
    return normalizeDiscount(discount)
  },

  async create(input: CreateDiscountInput, outletId: string) {
    if (input.code) {
      await ensureCodeUnique(input.code, outletId)
    }

    if (input.scope === 'PER_ITEM') {
      await validateProductIds(input.productIds, outletId)
    }

    const discount = await discountRepository.create({ ...input, outletId })
    return normalizeDiscount(discount)
  },

  async update(id: string, input: UpdateDiscountInput, outletId: string) {
    const discount = await discountRepository.findById(id)
    if (!discount) throw new NotFoundError('Diskon', 'DISCOUNT_NOT_FOUND')

    // Validasi kode baru jika berubah
    if (input.code && input.code !== discount.code) {
      await ensureCodeUnique(input.code, outletId, id)
    }

    // Jika scope berubah ke PER_ITEM atau productIds diupdate
    const newScope = input.scope ?? discount.scope
    const newProductIds = input.productIds

    if (newScope === 'PER_ITEM' && newProductIds !== undefined) {
      if (newProductIds.length === 0) {
        throw new BadRequestError(
          'Diskon PER_ITEM harus memiliki minimal 1 produk',
          'PRODUCT_REQUIRED',
        )
      }
      await validateProductIds(newProductIds, outletId)
    }

    const updated = await discountRepository.update(id, input)
    return normalizeDiscount(updated)
  },

  async delete(id: string) {
    const discount = await discountRepository.findById(id)
    if (!discount) throw new NotFoundError('Diskon', 'DISCOUNT_NOT_FOUND')

    // Cek apakah masih ada cart aktif yang memakai diskon ini
    const activeCartsCount = await prisma.cart.count({
      where: { discountId: id, status: 'ACTIVE' },
    })
    if (activeCartsCount > 0) {
      throw new BadRequestError(
        `Diskon masih digunakan oleh ${activeCartsCount} cart aktif. Lepaskan diskon dari cart terlebih dahulu.`,
        'DISCOUNT_IN_USE',
      )
    }

    const deleted = await discountRepository.softDelete(id)
    return normalizeDiscount(deleted)
  },
}
