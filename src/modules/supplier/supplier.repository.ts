import { prisma } from '../../infrastructure/database/prisma.client'
import { parsePagination } from '../../shared/utils/pagination'
import type {
  CreateSupplierInput, UpdateSupplierInput, ListSupplierQuery,
  CreatePurchaseOrderInput, UpdatePurchaseOrderInput, ListPurchaseOrderQuery,
} from './supplier.schema'

// ─── Select shapes ────────────────────────────────────────────────────────────

const supplierSelect = {
  id: true, name: true, contactName: true, phone: true,
  email: true, address: true, notes: true,
  isActive: true, outletId: true,
  createdAt: true, updatedAt: true,
  _count: { select: { purchaseOrders: true } },
} as const

const poListSelect = {
  id: true, orderNumber: true, status: true, notes: true,
  orderedAt: true, expectedAt: true, receivedAt: true,
  totalAmount: true, outletId: true, createdById: true,
  createdAt: true, updatedAt: true,
  supplier: { select: { id: true, name: true, contactName: true, phone: true } },
  _count: { select: { items: true } },
} as const

const poDetailSelect = {
  ...poListSelect,
  items: {
    select: {
      id: true, quantity: true, unit: true,
      costPerUnit: true, totalCost: true, receivedQuantity: true,
      product: { select: { id: true, name: true, sku: true } },
    },
    orderBy: { id: 'asc' as const },
  },
} as const

// ─── PO number generator ──────────────────────────────────────────────────────

export async function generatePoNumber(outletId: string): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')

  // Count today's POs for this outlet to build a sequential suffix
  const count = await prisma.purchaseOrder.count({
    where: {
      outletId,
      createdAt: {
        gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        lt:  new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
      },
    },
  })

  const seq = String(count + 1).padStart(4, '0')
  return `PO-${dateStr}-${seq}`
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const supplierRepository = {
  // ── Supplier CRUD ──────────────────────────────────────────────────────────

  async findMany(outletId: string, query: ListSupplierQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const isActive =
      query.isActive === 'true'  ? true
      : query.isActive === 'false' ? false
      : undefined

    const where = {
      outletId,
      deletedAt: null,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name:        { contains: query.search, mode: 'insensitive' as const } },
              { contactName: { contains: query.search, mode: 'insensitive' as const } },
              { phone:       { contains: query.search, mode: 'insensitive' as const } },
              { email:       { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [data, total] = await prisma.$transaction([
      prisma.supplier.findMany({
        where, select: supplierSelect, skip, take,
        orderBy: { name: 'asc' },
      }),
      prisma.supplier.count({ where }),
    ])

    return { data, total, page, limit }
  },

  findById(id: string) {
    return prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      select: supplierSelect,
    })
  },

  create(data: CreateSupplierInput & { outletId: string }) {
    return prisma.supplier.create({
      data,
      select: supplierSelect,
    })
  },

  update(id: string, data: UpdateSupplierInput) {
    return prisma.supplier.update({
      where: { id },
      data,
      select: supplierSelect,
    })
  },

  softDelete(id: string) {
    return prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, name: true },
    })
  },

  // ── Purchase Order ─────────────────────────────────────────────────────────

  async findManyPo(outletId: string, query: ListPurchaseOrderQuery) {
    const { skip, take, page, limit } = parsePagination(query)

    const where = {
      outletId,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status     ? { status: query.status }         : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate   ? { lte: new Date(query.endDate)   } : {}),
            },
          }
        : {}),
    }

    const [data, total] = await prisma.$transaction([
      prisma.purchaseOrder.findMany({
        where, select: poListSelect, skip, take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.purchaseOrder.count({ where }),
    ])

    return { data, total, page, limit }
  },

  findPoById(id: string) {
    return prisma.purchaseOrder.findUnique({
      where: { id },
      select: poDetailSelect,
    })
  },

  findPoByOrderNumber(orderNumber: string, outletId: string) {
    return prisma.purchaseOrder.findUnique({
      where: { orderNumber_outletId: { orderNumber, outletId } },
      select: { id: true, status: true },
    })
  },

  async createPo(
    data: CreatePurchaseOrderInput & {
      outletId: string
      orderNumber: string
      createdById?: string
    },
  ) {
    // Calculate total from items
    const totalAmount = data.items.reduce((sum, item) => {
      return sum + item.quantity * item.costPerUnit
    }, 0)

    return prisma.purchaseOrder.create({
      data: {
        outletId:    data.outletId,
        supplierId:  data.supplierId,
        orderNumber: data.orderNumber,
        notes:       data.notes,
        expectedAt:  data.expectedAt ? new Date(data.expectedAt) : undefined,
        totalAmount,
        createdById: data.createdById,
        items: {
          create: data.items.map((item) => ({
            productId:   item.productId,
            quantity:    item.quantity,
            unit:        item.unit,
            costPerUnit: item.costPerUnit,
            totalCost:   item.quantity * item.costPerUnit,
          })),
        },
      },
      select: poDetailSelect,
    })
  },

  updatePo(id: string, data: UpdatePurchaseOrderInput & {
    orderedAt?: Date
    receivedAt?: Date
  }) {
    return prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...data,
        ...(data.expectedAt ? { expectedAt: new Date(data.expectedAt) } : {}),
      },
      select: poDetailSelect,
    })
  },

  deletePo(id: string) {
    return prisma.purchaseOrder.delete({ where: { id } })
  },

  /**
   * Update received quantities for multiple items, recalculate PO total,
   * and determine the new status — all in one transaction.
   */
  async receivePoItems(
    poId: string,
    items: Array<{ purchaseOrderItemId: string; receivedQuantity: number }>,
    notes: string | undefined,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return prisma.$transaction(async (tx: any) => {
      // Update each item's receivedQuantity
      for (const item of items) {
        await tx.purchaseOrderItem.update({
          where: { id: item.purchaseOrderItemId },
          data:  { receivedQuantity: item.receivedQuantity },
        })
      }

      // Re-fetch all items to compute status
      const allItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: poId },
        select: { quantity: true, receivedQuantity: true },
      })

      const allReceived = allItems.every(
        (i: { quantity: unknown; receivedQuantity: unknown }) => Number(i.receivedQuantity) >= Number(i.quantity),
      )
      const anyReceived = allItems.some((i: { receivedQuantity: unknown }) => Number(i.receivedQuantity) > 0)

      const newStatus = allReceived ? 'RECEIVED'
        : anyReceived ? 'PARTIAL'
        : 'ORDERED'

      return tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status:     newStatus,
          receivedAt: allReceived ? new Date() : null,
          ...(notes ? { notes } : {}),
        },
        select: poDetailSelect,
      })
    })
  },
}
