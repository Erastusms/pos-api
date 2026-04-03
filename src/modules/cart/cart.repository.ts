import { prisma } from '../../infrastructure/database/prisma.client'

// ─── Shared selects ───────────────────────────────────────────────────────────

const cartItemModifierSelect = {
  id:         true,
  modifierId: true,
  name:       true,
  price:      true,
} as const

const cartItemSelect = {
  id:        true,
  cartId:    true,
  productId: true,
  variantId: true,
  quantity:  true,
  unitPrice: true,
  notes:     true,
  createdAt: true,
  updatedAt: true,
  product: {
    select: {
      id:   true,
      name: true,
      sku:  true,
      images: {
        where:  { isPrimary: true },
        select: { url: true },
        take:   1,
      },
    },
  },
  variant: {
    select: { id: true, name: true, sku: true },
  },
  modifiers: {
    select:  cartItemModifierSelect,
    orderBy: { id: 'asc' as const },
  },
} as const

const cartSelect = {
  id:        true,
  outletId:  true,
  userId:    true,
  notes:     true,
  status:    true,
  createdAt: true,
  updatedAt: true,
  items: {
    select:  cartItemSelect,
    orderBy: { createdAt: 'asc' as const },
  },
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

export type CartItemModifierRow = {
  id:         string
  modifierId: string
  name:       string
  price:      unknown  // Prisma Decimal
}

export type CartItemRow = {
  id:        string
  cartId:    string
  productId: string
  variantId: string | null
  quantity:  unknown  // Prisma Decimal
  unitPrice: unknown  // Prisma Decimal
  notes:     string | null
  createdAt: Date
  updatedAt: Date
  product: {
    id:     string
    name:   string
    sku:    string
    images: { url: string }[]
  }
  variant: { id: string; name: string; sku: string } | null
  modifiers: CartItemModifierRow[]
}

export type CartRow = {
  id:        string
  outletId:  string
  userId:    string
  notes:     string | null
  status:    'ACTIVE' | 'CHECKED_OUT' | 'ABANDONED'
  createdAt: Date
  updatedAt: Date
  items:     CartItemRow[]
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const cartRepository = {
  // ── Cart ──────────────────────────────────────────────────────────────────

  findById(id: string): Promise<CartRow | null> {
    return prisma.cart.findUnique({
      where:  { id },
      select: cartSelect,
    }) as Promise<CartRow | null>
  },

  findActiveByUser(userId: string, outletId: string): Promise<CartRow[]> {
    return prisma.cart.findMany({
      where:  { userId, outletId, status: 'ACTIVE' },
      select: cartSelect,
      orderBy: { createdAt: 'desc' },
    }) as Promise<CartRow[]>
  },

  create(data: { outletId: string; userId: string; notes?: string }): Promise<CartRow> {
    return prisma.cart.create({
      data:   { outletId: data.outletId, userId: data.userId, notes: data.notes },
      select: cartSelect,
    }) as Promise<CartRow>
  },

  update(
    id: string,
    data: { notes?: string | null; status?: 'ACTIVE' | 'CHECKED_OUT' | 'ABANDONED' },
  ): Promise<CartRow> {
    return prisma.cart.update({
      where:  { id },
      data:   { ...data, updatedAt: new Date() },
      select: cartSelect,
    }) as Promise<CartRow>
  },

  // ── Cart Items ─────────────────────────────────────────────────────────────

  findItemById(itemId: string): Promise<CartItemRow | null> {
    return prisma.cartItem.findUnique({
      where:  { id: itemId },
      select: cartItemSelect,
    }) as Promise<CartItemRow | null>
  },

  addItem(data: {
    cartId:    string
    productId: string
    variantId?: string
    quantity:  number
    unitPrice: number
    notes?:    string
    modifiers: { modifierId: string; name: string; price: number }[]
  }): Promise<CartItemRow> {
    return prisma.cartItem.create({
      data: {
        cartId:    data.cartId,
        productId: data.productId,
        variantId: data.variantId,
        quantity:  data.quantity,
        unitPrice: data.unitPrice,
        notes:     data.notes,
        modifiers: {
          create: data.modifiers.map((m) => ({
            modifierId: m.modifierId,
            name:       m.name,
            price:      m.price,
          })),
        },
      },
      select: cartItemSelect,
    }) as Promise<CartItemRow>
  },

  updateItem(
    itemId: string,
    data:   { quantity?: number; notes?: string | null },
  ): Promise<CartItemRow> {
    return prisma.cartItem.update({
      where:  { id: itemId },
      data:   { ...data, updatedAt: new Date() },
      select: cartItemSelect,
    }) as Promise<CartItemRow>
  },

  removeItem(itemId: string): Promise<void> {
    return prisma.cartItem.delete({ where: { id: itemId } }).then(() => undefined)
  },

  clearItems(cartId: string): Promise<{ count: number }> {
    return prisma.cartItem.deleteMany({ where: { cartId } })
  },
}
