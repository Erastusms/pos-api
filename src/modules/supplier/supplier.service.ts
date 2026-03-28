import { supplierRepository, generatePoNumber } from './supplier.repository'
import type {
  CreateSupplierInput, UpdateSupplierInput, ListSupplierQuery,
  CreatePurchaseOrderInput, UpdatePurchaseOrderInput, ListPurchaseOrderQuery,
  ReceivePurchaseOrderInput,
} from './supplier.schema'
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors'

// ─── Service ──────────────────────────────────────────────────────────────────

export const supplierService = {
  // ── Supplier CRUD ──────────────────────────────────────────────────────────

  async list(outletId: string, query: ListSupplierQuery) {
    return supplierRepository.findMany(outletId, query)
  },

  async getById(id: string) {
    const supplier = await supplierRepository.findById(id)
    if (!supplier) throw new NotFoundError('Supplier', 'SUPPLIER_NOT_FOUND')
    return supplier
  },

  async create(input: CreateSupplierInput, outletId: string) {
    return supplierRepository.create({ ...input, outletId })
  },

  async update(id: string, input: UpdateSupplierInput) {
    const supplier = await supplierRepository.findById(id)
    if (!supplier) throw new NotFoundError('Supplier', 'SUPPLIER_NOT_FOUND')
    return supplierRepository.update(id, input)
  },

  async delete(id: string) {
    const supplier = await supplierRepository.findById(id)
    if (!supplier) throw new NotFoundError('Supplier', 'SUPPLIER_NOT_FOUND')
    return supplierRepository.softDelete(id)
  },

  // ── Purchase Order ─────────────────────────────────────────────────────────

  async listPo(outletId: string, query: ListPurchaseOrderQuery) {
    return supplierRepository.findManyPo(outletId, query)
  },

  async getPoById(id: string) {
    const po = await supplierRepository.findPoById(id)
    if (!po) throw new NotFoundError('Purchase Order', 'PO_NOT_FOUND')
    return po
  },

  async createPo(input: CreatePurchaseOrderInput, outletId: string, userId?: string) {
    // Validate supplier belongs to this outlet
    const supplier = await supplierRepository.findById(input.supplierId)
    if (!supplier) throw new NotFoundError('Supplier', 'SUPPLIER_NOT_FOUND')
    if (supplier.outletId !== outletId) {
      throw new BadRequestError('Supplier tidak ditemukan di outlet ini', 'SUPPLIER_NOT_FOUND')
    }

    const orderNumber = await generatePoNumber(outletId)
    return supplierRepository.createPo({ ...input, outletId, orderNumber, createdById: userId })
  },

  async updatePo(id: string, input: UpdatePurchaseOrderInput) {
    const po = await supplierRepository.findPoById(id)
    if (!po) throw new NotFoundError('Purchase Order', 'PO_NOT_FOUND')

    // Status transitions guard
    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') {
      throw new BadRequestError(
        `Purchase Order dengan status ${po.status} tidak dapat diubah`,
        'PO_IMMUTABLE_STATUS',
      )
    }

    // When marking as ORDERED, auto-set orderedAt
    const extra: { orderedAt?: Date } = {}
    if (input.status === 'ORDERED' && po.status === 'DRAFT') {
      extra.orderedAt = new Date()
    }

    return supplierRepository.updatePo(id, { ...input, ...extra })
  },

  async cancelPo(id: string) {
    const po = await supplierRepository.findPoById(id)
    if (!po) throw new NotFoundError('Purchase Order', 'PO_NOT_FOUND')

    if (po.status === 'RECEIVED') {
      throw new BadRequestError(
        'Purchase Order yang sudah diterima tidak dapat dibatalkan',
        'PO_ALREADY_RECEIVED',
      )
    }

    if (po.status === 'CANCELLED') {
      throw new ConflictError('Purchase Order sudah dibatalkan', 'PO_ALREADY_CANCELLED')
    }

    return supplierRepository.updatePo(id, { status: 'CANCELLED' })
  },

  async deletePo(id: string) {
    const po = await supplierRepository.findPoById(id)
    if (!po) throw new NotFoundError('Purchase Order', 'PO_NOT_FOUND')

    if (po.status !== 'DRAFT') {
      throw new BadRequestError(
        'Hanya Purchase Order berstatus DRAFT yang dapat dihapus',
        'PO_DELETE_NOT_ALLOWED',
      )
    }

    await supplierRepository.deletePo(id)
  },

  /**
   * Record received items. Automatically updates PO status:
   *   all received  → RECEIVED
   *   some received → PARTIAL
   *   none received → ORDERED
   *
   * Also updates inventory via PURCHASE_IN adjustment if items are received.
   */
  async receivePo(id: string, input: ReceivePurchaseOrderInput) {
    const po = await supplierRepository.findPoById(id)
    if (!po) throw new NotFoundError('Purchase Order', 'PO_NOT_FOUND')

    if (po.status === 'CANCELLED') {
      throw new BadRequestError('Purchase Order sudah dibatalkan', 'PO_CANCELLED')
    }

    if (po.status === 'RECEIVED') {
      throw new BadRequestError('Purchase Order sudah selesai diterima', 'PO_ALREADY_RECEIVED')
    }

    // Validate that all item IDs belong to this PO
    const poItemIds = new Set((po.items ?? []).map((i: { id: string }) => i.id))
    for (const item of input.items) {
      if (!poItemIds.has(item.purchaseOrderItemId)) {
        throw new BadRequestError(
          `Item ID ${item.purchaseOrderItemId} tidak termasuk dalam PO ini`,
          'PO_ITEM_NOT_FOUND',
        )
      }
    }

    // Validate received quantities don't exceed ordered quantities
    const poItemMap = new Map(
      (po.items ?? []).map((i: { id: string; quantity: unknown }) => [i.id, i]),
    )
    for (const item of input.items) {
      const poItem = poItemMap.get(item.purchaseOrderItemId) as
        | { quantity: unknown }
        | undefined
      if (poItem && item.receivedQuantity > Number(poItem.quantity)) {
        throw new BadRequestError(
          `Jumlah diterima melebihi jumlah yang dipesan`,
          'RECEIVED_EXCEEDS_ORDERED',
        )
      }
    }

    return supplierRepository.receivePoItems(id, input.items, input.notes)
  },
}
