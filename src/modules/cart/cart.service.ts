import { prisma } from '../../infrastructure/database/prisma.client'
import { cartRepository, type CartRow, type CartItemRow } from './cart.repository'
import type { CreateCartInput, UpdateCartInput, AddCartItemInput, UpdateCartItemInput } from './cart.schema'
import { NotFoundError, BadRequestError } from '../../shared/errors'

// ─── Total calculation helpers ────────────────────────────────────────────────

/** Bulatkan ke 2 desimal agar tidak ada floating-point drift */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Terapkan rounding sesuai pengaturan outlet.
 * Contoh: rounding=UP, value=500, rawTotal=12_350 → 12_500
 */
function applyRounding(amount: number, mode: string, value: number): number {
  if (!value || mode === 'NONE') return amount
  switch (mode) {
    case 'UP':      return Math.ceil(amount / value) * value
    case 'DOWN':    return Math.floor(amount / value) * value
    case 'NEAREST': return Math.round(amount / value) * value
    default:        return amount
  }
}

type OutletSettings = {
  taxRate:       unknown  // Prisma Decimal
  serviceCharge: unknown  // Prisma Decimal
  rounding:      string
  roundingValue: number
}

/**
 * Hitung ringkasan total keranjang.
 * Urutan kalkulasi: subtotal → service charge → tax → rounding → total.
 * Semua kalkulasi berbasis `subtotal` (harga satuan × qty + modifier).
 */
export function computeCartSummary(
  items:    CartItemRow[],
  settings: OutletSettings | null,
) {
  // Hitung line total tiap item (unit price + modifier prices) × qty
  const enrichedItems = items.map((item) => {
    const modifierSum = item.modifiers.reduce(
      (acc, m) => acc + Number(m.price), 0,
    )
    const lineTotal = (Number(item.unitPrice) + modifierSum) * Number(item.quantity)
    return { ...item, lineTotal: round2(lineTotal) }
  })

  const subtotal = round2(
    enrichedItems.reduce((acc, i) => acc + i.lineTotal, 0),
  )

  const serviceChargeRate = settings ? Number(settings.serviceCharge) / 100 : 0
  const taxRate            = settings ? Number(settings.taxRate) / 100 : 0

  const serviceChargeAmount = round2(subtotal * serviceChargeRate)
  const taxableAmount       = subtotal + serviceChargeAmount
  const taxAmount           = round2(taxableAmount * taxRate)
  const rawTotal            = taxableAmount + taxAmount

  // Rounding
  let roundedTotal   = rawTotal
  if (settings && settings.roundingValue > 0) {
    roundedTotal = applyRounding(rawTotal, settings.rounding, settings.roundingValue)
  }
  const roundingAmount = round2(roundedTotal - rawTotal)
  const total          = round2(roundedTotal)

  const itemCount = enrichedItems.reduce(
    (acc, i) => acc + Number(i.quantity), 0,
  )

  return {
    itemCount:            round2(itemCount),
    subtotal,
    serviceChargeAmount,
    taxAmount,
    roundingAmount,
    total,
    items: enrichedItems,
  }
}

// ─── Shared: ambil settings outlet (nullable jika belum dikonfigurasi) ─────────

async function getOutletSettings(outletId: string): Promise<OutletSettings | null> {
  return prisma.outletSettings.findUnique({
    where:  { outletId },
    select: { taxRate: true, serviceCharge: true, rounding: true, roundingValue: true },
  })
}

// ─── Shared: format cart response dengan summary ──────────────────────────────

async function withSummary(cart: CartRow) {
  const settings = await getOutletSettings(cart.outletId)
  const summary  = computeCartSummary(cart.items, settings)

  // Remap item agar primaryImageUrl naik ke permukaan (lebih ramah konsumer API)
  const items = summary.items.map((item) => ({
    id:        item.id,
    cartId:    item.cartId,
    productId: item.productId,
    variantId: item.variantId,
    quantity:  Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    lineTotal: item.lineTotal,
    notes:     item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    product: {
      id:              item.product.id,
      name:            item.product.name,
      sku:             item.product.sku,
      primaryImageUrl: item.product.images[0]?.url ?? null,
    },
    variant:   item.variant,
    modifiers: item.modifiers.map((m) => ({
      id:         m.id,
      modifierId: m.modifierId,
      name:       m.name,
      price:      Number(m.price),
    })),
  }))

  return {
    id:        cart.id,
    outletId:  cart.outletId,
    userId:    cart.userId,
    notes:     cart.notes,
    status:    cart.status,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
    items,
    summary: {
      itemCount:           summary.itemCount,
      subtotal:            summary.subtotal,
      serviceChargeAmount: summary.serviceChargeAmount,
      taxAmount:           summary.taxAmount,
      roundingAmount:      summary.roundingAmount,
      total:               summary.total,
    },
  }
}

// ─── Guard: pastikan cart ada & statusnya ACTIVE ───────────────────────────────

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
  // ── Buat cart baru ────────────────────────────────────────────────────────

  async create(input: CreateCartInput, outletId: string, userId: string) {
    const cart = await cartRepository.create({ outletId, userId, notes: input.notes })
    return withSummary(cart)
  },

  // ── Ambil semua cart ACTIVE milik user di outlet ───────────────────────────

  async listActive(userId: string, outletId: string) {
    const carts    = await cartRepository.findActiveByUser(userId, outletId)
    const settings = await getOutletSettings(outletId)
    return carts.map((cart) => {
      const summary = computeCartSummary(cart.items, settings)
      return {
        id:        cart.id,
        outletId:  cart.outletId,
        userId:    cart.userId,
        notes:     cart.notes,
        status:    cart.status,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
        itemCount: summary.itemCount,
        total:     summary.total,
      }
    })
  },

  // ── Detail cart (dengan items + summary) ──────────────────────────────────

  async getById(cartId: string) {
    const cart = await cartRepository.findById(cartId)
    if (!cart) throw new NotFoundError('Cart', 'CART_NOT_FOUND')
    return withSummary(cart)
  },

  // ── Update catatan cart ────────────────────────────────────────────────────

  async update(cartId: string, input: UpdateCartInput) {
    await requireActiveCart(cartId)
    const updated = await cartRepository.update(cartId, { notes: input.notes ?? undefined })
    return withSummary(updated)
  },

  // ── Abandon cart ──────────────────────────────────────────────────────────

  async abandon(cartId: string) {
    await requireActiveCart(cartId)
    const updated = await cartRepository.update(cartId, { status: 'ABANDONED' })
    return withSummary(updated)
  },

  // ── Tambah item ke cart ───────────────────────────────────────────────────

  async addItem(cartId: string, input: AddCartItemInput, outletId: string) {
    await requireActiveCart(cartId)

    // Validasi produk ada & milik outlet ini
    const product = await prisma.product.findFirst({
      where:  { id: input.productId, outletId, deletedAt: null, isActive: true },
      select: {
        id:    true,
        price: true,
        type:  true,
        variants: {
          where:  { isActive: true },
          select: { id: true, price: true },
        },
        modifierGroups: {
          where:  { isActive: true },
          select: {
            isRequired: true,
            modifiers: {
              where:  { isActive: true },
              select: { id: true, name: true, price: true },
            },
          },
        },
      },
    })
    if (!product) throw new NotFoundError('Produk', 'PRODUCT_NOT_FOUND')

    // Validasi variant jika diberikan
    let unitPrice = Number(product.price)
    if (input.variantId) {
      if (product.type !== 'VARIANT') {
        throw new BadRequestError(
          'Produk ini bukan tipe VARIANT, variantId tidak dapat digunakan',
          'PRODUCT_NOT_VARIANT',
        )
      }
      const variant = product.variants.find((v: { id: string; price: unknown }) => v.id === input.variantId)
      if (!variant) {
        throw new NotFoundError('Variant produk', 'VARIANT_NOT_FOUND')
      }
      // Gunakan harga variant jika tersedia, fallback ke harga produk
      if (variant.price !== null) unitPrice = Number(variant.price)
    }

    // Validasi & snapshot modifier
    type ModifierRow = { id: string; name: string; price: unknown }
    type ModifierGroupRow = { isRequired: boolean; modifiers: ModifierRow[] }
    const allModifiers = (product.modifierGroups as ModifierGroupRow[]).flatMap((g) => g.modifiers)
    const snapshotModifiers: { modifierId: string; name: string; price: number }[] = []

    for (const reqMod of input.modifiers) {
      const found = allModifiers.find((m: ModifierRow) => m.id === reqMod.modifierId)
      if (!found) {
        throw new NotFoundError(
          `Modifier ${reqMod.modifierId}`,
          'MODIFIER_NOT_FOUND',
        )
      }
      snapshotModifiers.push({
        modifierId: found.id,
        name:       found.name,
        price:      Number(found.price),
      })
    }

    const cartItem = await cartRepository.addItem({
      cartId:    cartId,
      productId: input.productId,
      variantId: input.variantId,
      quantity:  input.quantity,
      unitPrice,
      notes:     input.notes,
      modifiers: snapshotModifiers,
    })

    // Kembalikan cart lengkap agar klien tidak perlu fetch ulang
    const cart = await cartRepository.findById(cartId)
    return withSummary(cart!)
  },

  // ── Update quantity / catatan satu item ───────────────────────────────────

  async updateItem(cartId: string, itemId: string, input: UpdateCartItemInput) {
    await requireActiveCart(cartId)

    // Pastikan item memang milik cart ini
    const item = await cartRepository.findItemById(itemId)
    if (!item || item.cartId !== cartId) {
      throw new NotFoundError('Item cart', 'CART_ITEM_NOT_FOUND')
    }

    await cartRepository.updateItem(itemId, {
      quantity: input.quantity,
      notes:    input.notes ?? undefined,
    })

    const cart = await cartRepository.findById(cartId)
    return withSummary(cart!)
  },

  // ── Hapus satu item ───────────────────────────────────────────────────────

  async removeItem(cartId: string, itemId: string) {
    await requireActiveCart(cartId)

    const item = await cartRepository.findItemById(itemId)
    if (!item || item.cartId !== cartId) {
      throw new NotFoundError('Item cart', 'CART_ITEM_NOT_FOUND')
    }

    await cartRepository.removeItem(itemId)

    const cart = await cartRepository.findById(cartId)
    return withSummary(cart!)
  },

  // ── Kosongkan semua item (clear cart) ────────────────────────────────────

  async clearItems(cartId: string) {
    await requireActiveCart(cartId)
    await cartRepository.clearItems(cartId)

    const cart = await cartRepository.findById(cartId)
    return withSummary(cart!)
  },
}
