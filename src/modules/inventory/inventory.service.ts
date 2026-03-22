import { inventoryRepository } from './inventory.repository'
import type {
  SetInitialStockInput,
  AdjustStockInput,
  ListInventoryQuery,
  HistoryQuery,
  CogsPreviewInput,
} from './inventory.schema'
import { withTransaction } from '../../infrastructure/database/transaction'
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors'
import { parsePagination } from '../../shared/utils/pagination'

// ─── Type helpers ─────────────────────────────────────────────────────────────

/** Jenis adjustment yang menambah stok (perlu cost layer baru) */
const STOCK_IN_TYPES = new Set(['INITIAL', 'PURCHASE_IN', 'ADJUSTMENT_IN', 'RETURN_IN'])

/** Jenis adjustment yang mengurangi stok (konsumsi FIFO) */
const STOCK_OUT_TYPES = new Set(['ADJUSTMENT_OUT', 'SALE_OUT'])

// ─── FIFO consumption (used internally by service) ────────────────────────────

/**
 * Konsumsi stok dari cost layers menggunakan algoritma FIFO.
 * Layer terlama dikonsumsi lebih dulu.
 *
 * Returns total COGS dan rata-rata HPP per unit.
 * Throws BadRequestError jika stok tidak mencukupi.
 *
 * PENTING: Harus dipanggil di dalam withTransaction() agar semua
 * update layer bersifat atomic.
 */
async function consumeStockFIFO(
  inventoryItemId: string,
  quantity: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
): Promise<{ totalCost: number; avgCostPerUnit: number }> {
  const layers = await tx.inventoryCostLayer.findMany({
    where:   { inventoryItemId, quantityLeft: { gt: 0 } },
    orderBy: { createdAt: 'asc' }, // FIFO: tertua dikonsumsi lebih dulu
  })

  const available = layers.reduce(
    (sum: number, l: { quantityLeft: unknown }) => sum + Number(l.quantityLeft),
    0,
  )

  if (available < quantity) {
    throw new BadRequestError(
      `Stok tidak mencukupi. Tersedia: ${available}, diminta: ${quantity}`,
      'INSUFFICIENT_STOCK',
    )
  }

  let remaining = quantity
  let totalCost  = 0

  for (const layer of layers) {
    if (remaining <= 0) break

    const layerLeft = Number(layer.quantityLeft)
    const consume   = Math.min(layerLeft, remaining)

    totalCost  += consume * Number(layer.costPerUnit)
    remaining  -= consume

    // Update sisa stok di layer ini
    await tx.inventoryCostLayer.update({
      where: { id: layer.id },
      data:  { quantityLeft: layerLeft - consume },
    })
  }

  return {
    totalCost:      Math.round(totalCost * 100) / 100,
    avgCostPerUnit: Math.round((totalCost / quantity) * 100) / 100,
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const inventoryService = {
  async list(outletId: string, query: ListInventoryQuery) {
    const { skip, take, page, limit } = parsePagination(
      { page: query.page, limit: query.limit },
      { page: 1, limit: 20, maxLimit: 100 },
    )

    const [items, total] = await inventoryRepository.findAllItems(outletId, {
      skip,
      take,
      search:       query.search,
      categoryId:   query.categoryId,
      lowStockOnly: query.lowStockOnly,
    })

    return {
      data: items.map(normalizeItem),
      meta: {
        page, limit, total,
        totalPages:  Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    }
  },

  async getByProductId(productId: string) {
    const item = await inventoryRepository.findItemByProductId(productId)
    if (!item) throw new NotFoundError('Inventory', 'INVENTORY_NOT_FOUND')
    return normalizeItem(item)
  },

  async getById(id: string) {
    const item = await inventoryRepository.findItemById(id)
    if (!item) throw new NotFoundError('Inventory', 'INVENTORY_NOT_FOUND')
    return normalizeItem(item)
  },

  async setInitialStock(input: SetInitialStockInput, outletId: string, userId: string) {
    // Validasi produk ada di outlet ini
    const product = await inventoryRepository.findProductById(input.productId, outletId)
    if (!product) throw new NotFoundError('Produk', 'PRODUCT_NOT_FOUND')

    // Cek apakah sudah ada inventory item untuk produk ini
    const existing = await inventoryRepository.findItemByProductId(input.productId)
    if (existing) {
      throw new ConflictError(
        'Stok awal sudah pernah diset untuk produk ini. Gunakan endpoint adjustment untuk mengubah stok.',
        'INITIAL_STOCK_ALREADY_SET',
      )
    }

    return withTransaction(async (tx) => {
      // 1. Buat inventory item
      const item = await tx.inventoryItem.create({
        data: {
          productId: input.productId,
          outletId,
          quantity: input.quantity,
          unit:     input.unit,
        },
      })

      // 2. Buat cost layer FIFO pertama
      await tx.inventoryCostLayer.create({
        data: {
          inventoryItemId: item.id,
          quantityIn:   input.quantity,
          quantityLeft: input.quantity,
          costPerUnit:  input.costPerUnit,
        },
      })

      // 3. Catat adjustment log
      await tx.inventoryAdjustment.create({
        data: {
          inventoryItemId: item.id,
          type:           'INITIAL',
          quantity:        input.quantity,
          quantityBefore:  0,
          quantityAfter:   input.quantity,
          costPerUnit:     input.costPerUnit,
          totalCost:       input.quantity * input.costPerUnit,
          notes:           input.notes ?? 'Stok awal',
          reference:       input.reference,
          userId,
        },
      })

      return normalizeItem(
        await tx.inventoryItem.findUnique({
          where:  { id: item.id },
          select: {
            id: true, productId: true, outletId: true,
            quantity: true, unit: true, createdAt: true, updatedAt: true,
            product: { select: {
              id: true, name: true, sku: true, isActive: true,
              category: { select: { id: true, name: true, slug: true } },
            }},
          },
        }),
      )
    })
  },

  async adjustStock(input: AdjustStockInput, outletId: string, userId: string) {
    const item = await inventoryRepository.findItemById(input.inventoryItemId)
    if (!item) throw new NotFoundError('Inventory item', 'INVENTORY_NOT_FOUND')

    // Pastikan item milik outlet yang sama
    if (item.outletId !== outletId) {
      throw new BadRequestError('Inventory item tidak ditemukan di outlet ini', 'INVENTORY_NOT_FOUND')
    }

    const currentQty = Number(item.quantity)
    const isStockIn  = STOCK_IN_TYPES.has(input.type)
    const isStockOut = STOCK_OUT_TYPES.has(input.type)

    return withTransaction(async (tx) => {
      let newQuantity = currentQty
      let totalCost: number | undefined
      let avgCostPerUnit: number | undefined

      if (isStockIn) {
        // Stok masuk: tambah quantity, buat cost layer baru
        newQuantity += input.quantity

        await tx.inventoryCostLayer.create({
          data: {
            inventoryItemId: item.id,
            quantityIn:   input.quantity,
            quantityLeft: input.quantity,
            costPerUnit:  input.costPerUnit!,
          },
        })

        totalCost     = input.quantity * input.costPerUnit!
        avgCostPerUnit = input.costPerUnit

      } else if (isStockOut) {
        // Stok keluar: kurangi quantity, konsumsi FIFO layers
        newQuantity -= input.quantity
        if (newQuantity < 0) {
          throw new BadRequestError(
            `Stok tidak mencukupi. Tersedia: ${currentQty}, diminta: ${input.quantity}`,
            'INSUFFICIENT_STOCK',
          )
        }

        const cogs = await consumeStockFIFO(item.id, input.quantity, tx)
        totalCost      = cogs.totalCost
        avgCostPerUnit = cogs.avgCostPerUnit
      }

      // Update quantity di inventory item
      await tx.inventoryItem.update({
        where: { id: item.id },
        data:  { quantity: newQuantity, updatedAt: new Date() },
      })

      // Catat adjustment log
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          inventoryItemId: item.id,
          type:            input.type,
          quantity:        isStockOut ? -input.quantity : input.quantity, // negatif untuk keluar
          quantityBefore:  currentQty,
          quantityAfter:   newQuantity,
          costPerUnit:     avgCostPerUnit,
          totalCost,
          notes:           input.notes,
          reference:       input.reference,
          userId,
        },
      })

      return {
        inventoryItemId: item.id,
        type:            input.type,
        quantity:        input.quantity,
        quantityBefore:  currentQty,
        quantityAfter:   newQuantity,
        ...(totalCost !== undefined && { totalCost, avgCostPerUnit }),
        adjustmentId:    adjustment.id,
        createdAt:       adjustment.createdAt,
      }
    })
  },

  async getHistory(inventoryItemId: string, query: HistoryQuery) {
    const item = await inventoryRepository.findItemById(inventoryItemId)
    if (!item) throw new NotFoundError('Inventory item', 'INVENTORY_NOT_FOUND')

    const { skip, take, page, limit } = parsePagination(
      { page: query.page, limit: query.limit },
      { page: 1, limit: 20, maxLimit: 100 },
    )

    const [adjustments, total] = await inventoryRepository.findAdjustments(inventoryItemId, {
      skip, take, type: query.type,
    })

    return {
      item: normalizeItem(item),
      data: adjustments.map(normalizeAdjustment),
      meta: {
        page, limit, total,
        totalPages:  Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    }
  },

  async previewCogs(inventoryItemId: string, input: CogsPreviewInput) {
    const item = await inventoryRepository.findItemById(inventoryItemId)
    if (!item) throw new NotFoundError('Inventory item', 'INVENTORY_NOT_FOUND')

    const result = await inventoryRepository.previewFifoCogs(inventoryItemId, input.quantity)

    return {
      inventoryItemId,
      productName:   item.product.name,
      currentStock:  Number(item.quantity),
      requestedQty:  input.quantity,
      ...result,
    }
  },
}

// ─── Normalizers (Decimal → number, consistent shape) ─────────────────────────

function normalizeItem(item: unknown) {
  if (!item) return item
  const i = item as Record<string, unknown>
  return {
    ...i,
    quantity: Number(i['quantity']),
  }
}

function normalizeAdjustment(adj: unknown) {
  const a = adj as Record<string, unknown>
  return {
    ...a,
    quantity:       Number(a['quantity']),
    quantityBefore: Number(a['quantityBefore']),
    quantityAfter:  Number(a['quantityAfter']),
    costPerUnit:    a['costPerUnit']  != null ? Number(a['costPerUnit'])  : null,
    totalCost:      a['totalCost']    != null ? Number(a['totalCost'])    : null,
  }
}
