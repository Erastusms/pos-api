import { prisma } from '../../infrastructure/database/prisma.client'

// ─── Shared select shapes ─────────────────────────────────────────────────────

const inventoryItemSelect = {
  id:        true,
  productId: true,
  outletId:  true,
  quantity:  true,
  unit:      true,
  createdAt: true,
  updatedAt: true,
  product: {
    select: {
      id:   true,
      name: true,
      sku:  true,
      isActive: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  },
} as const

const adjustmentSelect = {
  id:              true,
  inventoryItemId: true,
  type:            true,
  quantity:        true,
  quantityBefore:  true,
  quantityAfter:   true,
  costPerUnit:     true,
  totalCost:       true,
  notes:           true,
  reference:       true,
  userId:          true,
  createdAt:       true,
  user: { select: { id: true, name: true, email: true } },
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

export type InventoryItemRow = {
  id: string; productId: string; outletId: string
  quantity: unknown; unit: string; createdAt: Date; updatedAt: Date
  product: { id: string; name: string; sku: string; isActive: boolean
    category: { id: string; name: string; slug: string } | null }
}

export type AdjustmentRow = {
  id: string; inventoryItemId: string; type: string
  quantity: unknown; quantityBefore: unknown; quantityAfter: unknown
  costPerUnit: unknown; totalCost: unknown
  notes: string | null; reference: string | null; userId: string | null
  createdAt: Date
  user: { id: string; name: string; email: string } | null
}

export type CostLayerRow = {
  id: string; inventoryItemId: string
  quantityIn: unknown; quantityLeft: unknown; costPerUnit: unknown
  createdAt: Date
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const inventoryRepository = {
  // ── InventoryItem ──────────────────────────────────────────────────────────

  findItemById(id: string): Promise<InventoryItemRow | null> {
    return prisma.inventoryItem.findUnique({
      where:  { id },
      select: inventoryItemSelect,
    }) as Promise<InventoryItemRow | null>
  },

  findItemByProductId(productId: string): Promise<InventoryItemRow | null> {
    return prisma.inventoryItem.findUnique({
      where:  { productId },
      select: inventoryItemSelect,
    }) as Promise<InventoryItemRow | null>
  },

  findAllItems(
    outletId: string,
    opts: { skip: number; take: number; search?: string; categoryId?: string; lowStockOnly?: boolean },
  ): Promise<[InventoryItemRow[], number]> {
    const where = {
      outletId,
      product: {
        deletedAt: null,
        ...(opts.search
          ? { OR: [
              { name: { contains: opts.search, mode: 'insensitive' as const } },
              { sku:  { contains: opts.search, mode: 'insensitive' as const } },
            ]}
          : {}),
        ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      },
      ...(opts.lowStockOnly ? { quantity: { lte: 10 } } : {}),
    }

    return Promise.all([
      prisma.inventoryItem.findMany({
        where,
        select:  inventoryItemSelect,
        skip:    opts.skip,
        take:    opts.take,
        orderBy: { product: { name: 'asc' } },
      }) as Promise<InventoryItemRow[]>,
      prisma.inventoryItem.count({ where }),
    ])
  },

  createItem(data: {
    productId: string; outletId: string; quantity: number; unit: string
  }): Promise<InventoryItemRow> {
    return prisma.inventoryItem.create({
      data,
      select: inventoryItemSelect,
    }) as Promise<InventoryItemRow>
  },

  updateItemQuantity(id: string, quantity: number) {
    return prisma.inventoryItem.update({
      where: { id },
      data:  { quantity, updatedAt: new Date() },
    })
  },

  // ── Adjustments (immutable log) ────────────────────────────────────────────

  createAdjustment(data: {
    inventoryItemId: string; type: string
    quantity: number; quantityBefore: number; quantityAfter: number
    costPerUnit?: number; totalCost?: number
    notes?: string; reference?: string; userId?: string
  }) {
    return prisma.inventoryAdjustment.create({ data }) as Promise<AdjustmentRow>
  },

  findAdjustments(
    inventoryItemId: string,
    opts: { skip: number; take: number; type?: string },
  ): Promise<[AdjustmentRow[], number]> {
    const where = {
      inventoryItemId,
      ...(opts.type ? { type: opts.type as never } : {}),
    }
    return Promise.all([
      prisma.inventoryAdjustment.findMany({
        where,
        select:  adjustmentSelect,
        skip:    opts.skip,
        take:    opts.take,
        orderBy: { createdAt: 'desc' },
      }) as Promise<AdjustmentRow[]>,
      prisma.inventoryAdjustment.count({ where }),
    ])
  },

  // ── FIFO Cost Layers ───────────────────────────────────────────────────────

  createCostLayer(data: {
    inventoryItemId: string; quantityIn: number; quantityLeft: number; costPerUnit: number
  }) {
    return prisma.inventoryCostLayer.create({ data })
  },

  /** Ambil semua layer dengan sisa stok > 0, urut dari yang terlama (FIFO) */
  getActiveCostLayers(inventoryItemId: string): Promise<CostLayerRow[]> {
    return prisma.inventoryCostLayer.findMany({
      where:   { inventoryItemId, quantityLeft: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
    }) as Promise<CostLayerRow[]>
  },

  updateCostLayerQuantity(id: string, quantityLeft: number) {
    return prisma.inventoryCostLayer.update({
      where: { id },
      data:  { quantityLeft },
    })
  },

  /** Preview COGS untuk sejumlah qty tanpa mengubah data */
  async previewFifoCogs(
    inventoryItemId: string,
    quantity: number,
  ): Promise<{ totalCost: number; avgCostPerUnit: number; canFulfill: boolean; available: number }> {
    const layers = await this.getActiveCostLayers(inventoryItemId)
    const available = layers.reduce((sum, l) => sum + Number(l.quantityLeft), 0)

    if (available < quantity) {
      return { totalCost: 0, avgCostPerUnit: 0, canFulfill: false, available }
    }

    let remaining = quantity
    let totalCost = 0
    for (const layer of layers) {
      if (remaining <= 0) break
      const consume = Math.min(Number(layer.quantityLeft), remaining)
      totalCost += consume * Number(layer.costPerUnit)
      remaining -= consume
    }

    return {
      totalCost:      Math.round(totalCost * 100) / 100,
      avgCostPerUnit: Math.round((totalCost / quantity) * 100) / 100,
      canFulfill:     true,
      available,
    }
  },

  // ── Product lookup ─────────────────────────────────────────────────────────

  findProductById(productId: string, outletId: string) {
    return prisma.product.findFirst({
      where:  { id: productId, outletId, deletedAt: null },
      select: { id: true, name: true, sku: true, outletId: true },
    })
  },
}
