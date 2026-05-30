import { prisma } from '../../infrastructure/database/prisma.client'
import { cartRepository, type CartRow, type CartItemRow } from './cart.repository'
import type {
  CreateCartInput,
  UpdateCartInput,
  AddCartItemInput,
  UpdateCartItemInput,
} from './cart.schema'
import type { ApplyDiscountInput } from './cart.schema'
import { NotFoundError, BadRequestError } from '../../shared/errors'
import {
  round2,
  computeTax,
  normalizeTaxSettings,
  type RawTaxSettings,
} from '../../shared/utils/tax.engine'
import {
  computeDiscount,
  type DiscountDef,
  type LineItemForDiscount,
} from '../../shared/utils/discount.engine'
import { voucherService } from '../voucher/voucher.service'
import { computeVoucherDiscount, type VoucherDef } from '../voucher/voucher.engine'

// ─── Internal type ────────────────────────────────────────────────────────────

type AppliedDiscount = {
  id: string
  name: string
  code: string | null
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  scope: 'PER_ITEM' | 'PER_BILL'
  value: number
  minPurchase: number | null
  maxDiscount: number | null
}

// ─── Cart summary computation ─────────────────────────────────────────────────

/**
 * Hitung ringkasan total keranjang.
 *
 * Urutan:  subtotal → discount → discountedSubtotal
 *          → service charge → tax → rounding → total
 */
export function computeCartSummary(
  items: CartItemRow[],
  settings: RawTaxSettings | null,
  discount: DiscountDef | null = null,
  voucher: VoucherDef | null = null, // PATCH: parameter baru
) {
  const enrichedItems = items.map((item) => {
    const modifierSum = item.modifiers.reduce((acc, m) => acc + Number(m.price), 0)
    const lineTotal = (Number(item.unitPrice) + modifierSum) * Number(item.quantity)
    return { ...item, lineTotal: round2(lineTotal) }
  })

  const subtotal = round2(enrichedItems.reduce((acc, i) => acc + i.lineTotal, 0))

  // Discount (existing)
  const lineItemsForDiscount = enrichedItems.map((i) => ({
    productId: i.productId,
    lineTotal: i.lineTotal,
    quantity: Number(i.quantity),
  }))
  const discountResult = computeDiscount(lineItemsForDiscount, subtotal, discount)
  const discountAmount = discountResult.discountAmount
  let discountedSubtotal = round2(Math.max(0, subtotal - discountAmount))

  // PATCH: Voucher discount (diterapkan setelah discount reguler)
  const voucherResult = computeVoucherDiscount(lineItemsForDiscount, discountedSubtotal, voucher)
  const voucherDiscount = voucherResult.qualifies ? voucherResult.discountAmount : 0
  discountedSubtotal = round2(Math.max(0, discountedSubtotal - voucherDiscount))

  // Tax + rounding (existing — tidak berubah)
  const taxSettings = normalizeTaxSettings(settings)
  const tax = computeTax(discountedSubtotal, taxSettings)

  const itemCount = round2(enrichedItems.reduce((acc, i) => acc + Number(i.quantity), 0))

  return {
    itemCount,
    subtotal,
    discountAmount,
    discountedSubtotal: round2(discountedSubtotal + voucherDiscount), // subtotal setelah discount saja
    voucherDiscountAmount: voucherDiscount, // PATCH: field baru
    finalSubtotal: discountedSubtotal, // PATCH: setelah semua diskon
    serviceChargeAmount: tax.serviceChargeAmount,
    taxAmount: tax.taxAmount,
    roundingAmount: tax.roundingAmount,
    total: tax.total,
    items: enrichedItems,
    // Existing fields
    discountQualifies: discountResult.qualifies,
    discountReason: discountResult.reason,
    itemDiscountMap: discountResult.itemDiscountMap,
    // PATCH: voucher fields
    voucherQualifies: voucherResult.qualifies,
    voucherReason: voucherResult.reason,
    voucherItemMap: voucherResult.itemDiscountMap,
  }
}

// ─── Shared: ambil settings outlet ───────────────────────────────────────────

async function getOutletSettings(outletId: string): Promise<RawTaxSettings | null> {
  return prisma.outletSettings.findUnique({
    where: { outletId },
    select: { taxRate: true, serviceCharge: true, rounding: true, roundingValue: true },
  })
}

// ─── Shared: ambil discount aktif yang di-apply ke cart ──────────────────────

async function getCartDiscountDef(
  discountId: string | null | undefined,
): Promise<DiscountDef | null> {
  if (!discountId) return null

  const d = await prisma.discount.findFirst({
    where: { id: discountId, deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      scope: true,
      value: true,
      minPurchase: true,
      maxDiscount: true,
      products: { select: { productId: true } },
    },
  })
  if (!d) return null

  return {
    id: d.id,
    name: d.name,
    code: d.code,
    type: d.type as 'PERCENTAGE' | 'FIXED_AMOUNT',
    scope: d.scope as 'PER_ITEM' | 'PER_BILL',
    value: Number(d.value),
    minPurchase: d.minPurchase !== null ? Number(d.minPurchase) : null,
    maxDiscount: d.maxDiscount !== null ? Number(d.maxDiscount) : null,
    productIds: d.products.map((p: { productId: string }) => p.productId),
  }
}

// ─── Shared: format cart response dengan summary ──────────────────────────────

async function withSummary(cart: CartRow) {
  const [settings, discountDef, voucherRow] = await Promise.all([
    getOutletSettings(cart.outletId),
    getCartDiscountDef(cart.discountId),
    // PATCH: resolve voucher jika ada di cart
    cart.voucherId
      ? prisma.voucher.findFirst({
          where: { id: cart.voucherId, deletedAt: null },
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
      : null,
  ])

  // Konversi voucherRow ke VoucherDef
  const voucherDef: VoucherDef | null = voucherRow
    ? {
        id: voucherRow.id,
        name: voucherRow.name,
        code: voucherRow.code,
        type: voucherRow.type as 'PERCENTAGE' | 'FIXED_AMOUNT',
        scope: voucherRow.scope as 'PER_BILL' | 'PER_ITEM',
        value: Number(voucherRow.value),
        minPurchase: voucherRow.minPurchase ? Number(voucherRow.minPurchase) : null,
        maxDiscount: voucherRow.maxDiscount ? Number(voucherRow.maxDiscount) : null,
        usageLimit: voucherRow.usageLimit,
        usageLimitPerCustomer: voucherRow.usageLimitPerCustomer,
        usageCount: voucherRow.usageCount,
        autoApply: voucherRow.autoApply,
        isActive: voucherRow.isActive,
        startAt: voucherRow.startAt,
        endAt: voucherRow.endAt,
        productIds: voucherRow.products.map((p: { productId: string }) => p.productId),
      }
    : null

  const summary = computeCartSummary(cart.items, settings, discountDef, voucherDef)

  // ... sisa withSummary tidak berubah, hanya tambahkan appliedVoucher ke return
  return {
    // ... field yang sudah ada ...
    appliedVoucher: voucherDef
      ? {
          id: voucherDef.id,
          name: voucherDef.name,
          code: voucherDef.code,
          type: voucherDef.type,
          scope: voucherDef.scope,
          value: voucherDef.value,
        }
      : null,
  }
}

// ─── Guard: pastikan cart ACTIVE ──────────────────────────────────────────────

async function requireActiveCart(cartId: string): Promise<CartRow> {
  const cart = await cartRepository.findById(cartId)
  if (!cart) throw new NotFoundError('Cart', 'CART_NOT_FOUND')
  if (cart.status !== 'ACTIVE') {
    throw new BadRequestError(
      `Cart sudah berstatus ${cart.status} dan tidak dapat diubah`,
      'CART_NOT_ACTIVE',
    )
  }
  return cart
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const cartService = {
  async create(input: CreateCartInput, outletId: string, userId: string) {
    const cart = await cartRepository.create({ outletId, userId, notes: input.notes })
    return withSummary(cart)
  },

  async listActive(userId: string, outletId: string) {
    const carts = await cartRepository.findActiveByUser(userId, outletId)
    const settings = await getOutletSettings(outletId)
    return Promise.all(
      carts.map(async (cart) => {
        const discountDef = await getCartDiscountDef(cart.discountId)
        const summary = computeCartSummary(cart.items, settings, discountDef)
        return {
          id: cart.id,
          outletId: cart.outletId,
          userId: cart.userId,
          discountId: cart.discountId ?? null,
          notes: cart.notes,
          status: cart.status,
          createdAt: cart.createdAt,
          updatedAt: cart.updatedAt,
          itemCount: summary.itemCount,
          total: summary.total,
        }
      }),
    )
  },

  async getById(cartId: string) {
    const cart = await cartRepository.findById(cartId)
    if (!cart) throw new NotFoundError('Cart', 'CART_NOT_FOUND')
    return withSummary(cart)
  },

  async update(cartId: string, input: UpdateCartInput) {
    await requireActiveCart(cartId)
    const updated = await cartRepository.update(cartId, { notes: input.notes ?? undefined })
    return withSummary(updated)
  },

  async abandon(cartId: string) {
    await requireActiveCart(cartId)
    const updated = await cartRepository.update(cartId, { status: 'ABANDONED' })
    return withSummary(updated)
  },

  async addItem(cartId: string, input: AddCartItemInput, outletId: string) {
    await requireActiveCart(cartId)

    const product = await prisma.product.findFirst({
      where: { id: input.productId, outletId, deletedAt: null, isActive: true },
      select: {
        id: true,
        price: true,
        type: true,
        variants: {
          where: { isActive: true },
          select: { id: true, price: true },
        },
        modifierGroups: {
          where: { isActive: true },
          select: {
            isRequired: true,
            modifiers: {
              where: { isActive: true },
              select: { id: true, name: true, price: true },
            },
          },
        },
      },
    })
    if (!product) throw new NotFoundError('Produk', 'PRODUCT_NOT_FOUND')

    let unitPrice = Number(product.price)
    if (input.variantId) {
      if (product.type !== 'VARIANT') {
        throw new BadRequestError(
          'Produk ini bukan tipe VARIANT, variantId tidak dapat digunakan',
          'PRODUCT_NOT_VARIANT',
        )
      }
      const variant = product.variants.find(
        (v: { id: string; price: unknown }) => v.id === input.variantId,
      )
      if (!variant) throw new NotFoundError('Variant produk', 'VARIANT_NOT_FOUND')
      if (variant.price !== null) unitPrice = Number(variant.price)
    }

    type ModifierRow = { id: string; name: string; price: unknown }
    type ModifierGroupRow = { isRequired: boolean; modifiers: ModifierRow[] }
    const allModifiers = (product.modifierGroups as ModifierGroupRow[]).flatMap((g) => g.modifiers)
    const snapshotModifiers: { modifierId: string; name: string; price: number }[] = []

    for (const reqMod of input.modifiers) {
      const found = allModifiers.find((m: ModifierRow) => m.id === reqMod.modifierId)
      if (!found) throw new NotFoundError(`Modifier ${reqMod.modifierId}`, 'MODIFIER_NOT_FOUND')
      snapshotModifiers.push({ modifierId: found.id, name: found.name, price: Number(found.price) })
    }

    await cartRepository.addItem({
      cartId: cartId,
      productId: input.productId,
      variantId: input.variantId,
      quantity: input.quantity,
      unitPrice,
      notes: input.notes,
      modifiers: snapshotModifiers,
    })

    const cart = await cartRepository.findById(cartId)
    return withSummary(cart!)
  },

  async updateItem(cartId: string, itemId: string, input: UpdateCartItemInput) {
    await requireActiveCart(cartId)
    const item = await cartRepository.findItemById(itemId)
    if (!item || item.cartId !== cartId) throw new NotFoundError('Item cart', 'CART_ITEM_NOT_FOUND')
    await cartRepository.updateItem(itemId, {
      quantity: input.quantity,
      notes: input.notes ?? undefined,
    })
    const cart = await cartRepository.findById(cartId)
    return withSummary(cart!)
  },

  async removeItem(cartId: string, itemId: string) {
    await requireActiveCart(cartId)
    const item = await cartRepository.findItemById(itemId)
    if (!item || item.cartId !== cartId) throw new NotFoundError('Item cart', 'CART_ITEM_NOT_FOUND')
    await cartRepository.removeItem(itemId)
    const cart = await cartRepository.findById(cartId)
    return withSummary(cart!)
  },

  async clearItems(cartId: string) {
    await requireActiveCart(cartId)
    await cartRepository.clearItems(cartId)
    const cart = await cartRepository.findById(cartId)
    return withSummary(cart!)
  },

  // ── Discount operations ────────────────────────────────────────────────────

  /**
   * Terapkan diskon ke cart — by discountId atau kode promo.
   * Validasi: diskon harus aktif, belum expired, milik outlet yang sama.
   */
  async applyDiscount(cartId: string, input: ApplyDiscountInput, outletId: string) {
    const cart = await requireActiveCart(cartId)

    // Resolve discount dari ID atau kode
    let discount
    if (input.discountId) {
      discount = await prisma.discount.findFirst({
        where: { id: input.discountId, outletId, deletedAt: null },
        select: { id: true, name: true, isActive: true, startAt: true, endAt: true },
      })
    } else if (input.code) {
      discount = await prisma.discount.findFirst({
        where: { code: input.code, outletId, deletedAt: null },
        select: { id: true, name: true, isActive: true, startAt: true, endAt: true },
      })
    }

    if (!discount) throw new NotFoundError('Diskon', 'DISCOUNT_NOT_FOUND')

    // Validasi aktif
    if (!discount.isActive) {
      throw new BadRequestError('Diskon tidak aktif', 'DISCOUNT_INACTIVE')
    }

    // Validasi periode
    const now = new Date()
    if (discount.startAt && now < discount.startAt) {
      throw new BadRequestError('Diskon belum mulai berlaku', 'DISCOUNT_NOT_STARTED')
    }
    if (discount.endAt && now > discount.endAt) {
      throw new BadRequestError('Diskon sudah kadaluarsa', 'DISCOUNT_EXPIRED')
    }

    // Jangan apply jika sudah pakai diskon yang sama
    if (cart.discountId === discount.id) {
      throw new BadRequestError('Diskon ini sudah diterapkan pada cart', 'DISCOUNT_ALREADY_APPLIED')
    }

    await cartRepository.update(cartId, { discountId: discount.id })
    const updated = await cartRepository.findById(cartId)
    return withSummary(updated!)
  },

  /** Lepaskan diskon dari cart */
  async removeDiscount(cartId: string) {
    const cart = await requireActiveCart(cartId)
    if (!cart.discountId) {
      throw new BadRequestError(
        'Cart tidak memiliki diskon yang diterapkan',
        'DISCOUNT_NOT_APPLIED',
      )
    }
    await cartRepository.update(cartId, { discountId: null })
    const updated = await cartRepository.findById(cartId)
    return withSummary(updated!)
  },
}
