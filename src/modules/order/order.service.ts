import { prisma } from '../../infrastructure/database/prisma.client'
import { withTransaction } from '../../infrastructure/database/transaction'
import { orderRepository, normalizeOrder, generateOrderNumber } from './order.repository'
import { computeCartSummary } from '../cart/cart.service'
import type { CreateOrderInput, VoidOrderInput, ListOrderQuery } from './order.schema'
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors'
import type { RawTaxSettings } from '../../shared/utils/tax.engine'
import type { DiscountDef } from '../../shared/utils/discount.engine'
import { customerService } from '../customer/customer.service'
import { voucherService } from '../voucher/voucher.service'

// ─── Role IDs yang boleh void order PAID ──────────────────────────────────────
// 1=Super Admin, 2=Owner, 3=Manager
const VOID_PAID_ALLOWED_ROLES = new Set([1, 2, 3])

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Ambil OutletSettings untuk tax engine */
async function getOutletSettings(outletId: string): Promise<RawTaxSettings | null> {
  return prisma.outletSettings.findUnique({
    where: { outletId },
    select: { taxRate: true, serviceCharge: true, rounding: true, roundingValue: true },
  })
}

/** Ambil DiscountDef dari Cart.discountId */
async function getDiscountDef(discountId: string | null | undefined): Promise<DiscountDef | null> {
  if (!discountId) return null

  const d = await prisma.discount.findFirst({
    where: { id: discountId, deletedAt: null },
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

/**
 * Konsumsi stok via SALE_OUT (FIFO) untuk satu produk.
 * Dipanggil di dalam $transaction.
 *
 * Jika produk tidak memiliki inventory item (belum diinisialisasi),
 * lewati tanpa error — beberapa jenis produk mungkin tidak dilacak stoknya.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deductInventory(
  productId: string,
  outletId: string,
  quantity: number,
  orderNumber: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
): Promise<void> {
  const inventoryItem = await tx.inventoryItem.findUnique({
    where: { productId },
    select: { id: true, quantity: true, outletId: true },
  })

  if (!inventoryItem || inventoryItem.outletId !== outletId) return

  const currentQty = Number(inventoryItem.quantity)
  const newQty = currentQty - quantity

  if (newQty < 0) {
    throw new BadRequestError(
      `Stok tidak mencukupi untuk produk. Tersedia: ${currentQty}, diminta: ${quantity}`,
      'INSUFFICIENT_STOCK',
    )
  }

  // Konsumsi FIFO cost layers
  const layers = await tx.inventoryCostLayer.findMany({
    where: { inventoryItemId: inventoryItem.id, quantityLeft: { gt: 0 } },
    orderBy: { createdAt: 'asc' },
  })

  let remaining = quantity
  let totalCost = 0

  for (const layer of layers) {
    if (remaining <= 0) break
    const layerLeft = Number(layer.quantityLeft)
    const consume = Math.min(layerLeft, remaining)
    totalCost += consume * Number(layer.costPerUnit)
    remaining -= consume
    await tx.inventoryCostLayer.update({
      where: { id: layer.id },
      data: { quantityLeft: layerLeft - consume },
    })
  }

  const avgCost = quantity > 0 ? Math.round((totalCost / quantity) * 100) / 100 : 0

  // Update quantity
  await tx.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: { quantity: newQty, updatedAt: new Date() },
  })

  // Catat adjustment log
  await tx.inventoryAdjustment.create({
    data: {
      inventoryItemId: inventoryItem.id,
      type: 'SALE_OUT',
      quantity: -quantity,
      quantityBefore: currentQty,
      quantityAfter: newQty,
      costPerUnit: avgCost,
      totalCost: totalCost,
      reference: orderNumber,
      userId,
    },
  })
}

/**
 * Kembalikan stok via RETURN_IN untuk satu produk.
 * Dipanggil saat order di-void, di dalam $transaction.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function restoreInventory(
  productId: string,
  outletId: string,
  quantity: number,
  unitCost: number,
  orderNumber: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
): Promise<void> {
  const inventoryItem = await tx.inventoryItem.findUnique({
    where: { productId },
    select: { id: true, quantity: true, outletId: true },
  })

  if (!inventoryItem || inventoryItem.outletId !== outletId) return

  const currentQty = Number(inventoryItem.quantity)
  const newQty = currentQty + quantity

  // Buat cost layer baru (RETURN_IN — barang kembali masuk)
  await tx.inventoryCostLayer.create({
    data: {
      inventoryItemId: inventoryItem.id,
      quantityIn: quantity,
      quantityLeft: quantity,
      costPerUnit: unitCost,
    },
  })

  await tx.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: { quantity: newQty, updatedAt: new Date() },
  })

  await tx.inventoryAdjustment.create({
    data: {
      inventoryItemId: inventoryItem.id,
      type: 'RETURN_IN',
      quantity,
      quantityBefore: currentQty,
      quantityAfter: newQty,
      costPerUnit: unitCost,
      totalCost: quantity * unitCost,
      reference: orderNumber,
      userId,
      notes: 'Stok dikembalikan karena order di-void',
    },
  })
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const orderService = {
  /**
   * List order dengan filter + pagination.
   */
  async list(outletId: string, query: ListOrderQuery) {
    const { data, page, limit, total } = await orderRepository.findMany(outletId, query)
    return { data: data.map(normalizeOrder), page, limit, total }
  },

  /**
   * Detail satu order.
   */
  async getById(id: string) {
    const order = await orderRepository.findById(id)
    if (!order) throw new NotFoundError('Order', 'ORDER_NOT_FOUND')
    return normalizeOrder(order)
  },

  /**
   * Buat order dari cart.
   *
   * Race condition protection:
   * 1. Cek idempotency — jika order non-VOID untuk cartId ini sudah ada → 409
   * 2. Di dalam $transaction:
   *    a. `cart.updateMany({ where: { id, status: 'ACTIVE' } })` — atomic optimistic lock
   *       Jika count === 0: cart sudah di-checkout / abandoned oleh request lain → 409
   *    b. Snapshot semua data, buat order, deduct inventory
   */
  async createFromCart(input: CreateOrderInput, outletId: string, userId: string) {
    const { cartId, notes } = input

    // ── 1. Cek idempotency sebelum masuk transaction ────────────────────────
    const existingOrder = await orderRepository.findByCartId(cartId)
    if (existingOrder && existingOrder.status !== 'VOID') {
      throw new ConflictError(
        `Order untuk cart ini sudah ada (${existingOrder.orderNumber})`,
        'ORDER_ALREADY_EXISTS',
      )
    }

    // ── 2. Fetch cart dengan semua data yang dibutuhkan ─────────────────────
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      select: {
        id: true,
        status: true,
        outletId: true,
        userId: true,
        discountId: true,
        items: {
          select: {
            id: true,
            cartId: true,
            productId: true,
            variantId: true,
            quantity: true,
            unitPrice: true,
            notes: true,
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
            variant: {
              select: { id: true, name: true, sku: true },
            },
            modifiers: {
              select: { id: true, modifierId: true, name: true, price: true },
              orderBy: { id: 'asc' as const },
            },
          },
          orderBy: { createdAt: 'asc' as const },
        },
      },
    })

    if (!cart) throw new NotFoundError('Cart', 'CART_NOT_FOUND')
    if (cart.outletId !== outletId) {
      throw new NotFoundError('Cart', 'CART_NOT_FOUND')
    }
    if (cart.items.length === 0) {
      throw new BadRequestError('Cart tidak memiliki item', 'CART_EMPTY')
    }

    // ── 3. Resolve discount + voucher + hitung summary ─────────────────────
    const [settings, discountDef, voucherRow] = await Promise.all([
      getOutletSettings(outletId),
      getDiscountDef(cart.discountId),
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

    // Konversi ke VoucherDef (reuse toVoucherDef pattern dari voucher.service)
    const voucherDef = voucherRow
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

    // Adaptasi CartItemRow type agar kompatibel dengan computeCartSummary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary = computeCartSummary(cart.items as any, settings, discountDef, voucherDef)

    // ── 4. Generate order number ─────────────────────────────────────────────
    const orderNumber = await generateOrderNumber(outletId)

    // ── 5. Atomic transaction: lock cart → buat order → deduct inventory ────
    const order = await withTransaction(async (tx) => {
      // ── 5a. Optimistic lock: update cart HANYA jika masih ACTIVE ───────────
      // updateMany mengembalikan { count: number }
      const lockResult = await tx.cart.updateMany({
        where: { id: cartId, status: 'ACTIVE' },
        data: { status: 'CHECKED_OUT', updatedAt: new Date() },
      })

      if (lockResult.count === 0) {
        // Cart sudah di-checkout atau di-abandon oleh request lain
        throw new ConflictError(
          'Cart sedang diproses atau sudah di-checkout. Coba lagi.',
          'CART_CHECKOUT_CONFLICT',
        )
      }

      // ── 5b. Buat Order dengan snapshot finansial ───────────────────────────
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          outletId,
          userId,
          cartId,
          discountId: cart.discountId ?? undefined,
          notes: notes ?? cart.id, // notes dari input, fallback ke cartId
          status: 'PENDING',

          // Financial snapshot
          subtotal: summary.subtotal,
          discountAmount: summary.discountAmount,
          discountedSubtotal: summary.discountedSubtotal,
          serviceChargeAmount: summary.serviceChargeAmount,
          taxAmount: summary.taxAmount,
          roundingAmount: summary.roundingAmount,
          total: summary.total - (voucherCheckout?.discountAmount ?? 0),

          // Discount snapshot
          discountName: discountDef?.name ?? null,
          discountCode: discountDef?.code ?? null,
          discountType: discountDef?.type ?? null,
          discountScope: discountDef?.scope ?? null,
          discountValue: discountDef?.value ?? null,

          // Voucher snapshot
          voucherId: voucherRow?.id ?? null,
          voucherCode: voucherRow?.code ?? null,
          voucherName: voucherRow?.name ?? null,
          voucherType: voucherRow?.type ?? null,
          voucherScope: voucherRow?.scope ?? null,
          voucherValue: voucherRow ? Number(voucherRow.value) : null,
          voucherDiscountAmount: voucherCheckout?.discountAmount ?? 0,

          // Items
          items: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            create: (cart.items as any[]).map((item: any) => {
              // Hitung lineTotal item (sama seperti di cart engine)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const modSum = item.modifiers.reduce(
                (acc: number, m: any) => acc + Number(m.price),
                0,
              )
              const lineTotal = (Number(item.unitPrice) + modSum) * Number(item.quantity)

              // Per-item discount amount dari engine
              const itemDiscountAmount = summary.itemDiscountMap?.[item.productId as string] ?? 0

              return {
                productId: item.productId,
                variantId: item.variantId,
                productName: item.product?.name ?? '(Produk dihapus)',
                productSku: item.product?.sku ?? '-',
                variantName: item.variant?.name ?? null,
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
                itemDiscountAmount,
                lineTotal: Math.round(lineTotal * 100) / 100,
                notes: item.notes,
                modifiers: {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  create: item.modifiers.map((m: any) => ({
                    modifierId: m.modifierId,
                    name: m.name,
                    price: Number(m.price),
                  })),
                },
              }
            }),
          },
        },
        select: {
          id: true,
          orderNumber: true,
          items: { select: { productId: true, quantity: true, unitPrice: true } },
        },
      })

      // ── 5b-extra: Process voucher (increment + redemption) ─────────────
      // PATCH: voucherDiscountAmount dikirim sebagai bagian dari order create
      const voucherCheckout = await voucherService.processCheckout({
        voucherId: cart.voucherId,
        outletId,
        customerId: cart.customerId ?? null, // jika cart punya customerId
        subtotal: summary.subtotal,
        lineItems: summary.items.map((i) => ({
          productId: i.productId,
          lineTotal: i.lineTotal,
          quantity: Number(i.quantity),
        })),
        orderId: newOrder.id,
        tx,
      })

      // ── 5c. Deduct inventory untuk setiap item ────────────────────────────
      for (const item of newOrder.items) {
        if (!item.productId) continue
        await deductInventory(
          item.productId,
          outletId,
          Number(item.quantity),
          newOrder.orderNumber,
          userId,
          tx,
        )
      }

      return newOrder
    })

    // Fetch full order untuk response
    const full = await orderRepository.findById(order.id)
    return normalizeOrder(full!)
  },

  /**
   * Void order.
   *
   * - PENDING → VOID: siapapun dengan permission void
   * - PAID → VOID: hanya MANAGER / OWNER / SUPER_ADMIN (cek roleId)
   * - DONE / VOID: tidak bisa di-void
   *
   * Inventory dikembalikan via RETURN_IN.
   */
  async voidOrder(id: string, input: VoidOrderInput, userId: string, userRoleId: number) {
    const order = await orderRepository.findById(id)
    if (!order) throw new NotFoundError('Order', 'ORDER_NOT_FOUND')

    if (order.status === 'VOID') {
      throw new BadRequestError('Order sudah di-void sebelumnya', 'ORDER_ALREADY_VOID')
    }
    if (order.status === 'DONE') {
      throw new BadRequestError('Order yang sudah selesai (DONE) tidak dapat di-void', 'ORDER_DONE')
    }
    if (order.status === 'PAID' && !VOID_PAID_ALLOWED_ROLES.has(userRoleId)) {
      throw new BadRequestError(
        'Hanya Manager / Owner yang dapat me-void order yang sudah PAID',
        'INSUFFICIENT_ROLE',
      )
    }

    const updated = await withTransaction(async (tx) => {
      // Re-check status di dalam tx (anti-race condition)
      const current = await tx.order.findUnique({
        where: { id },
        select: {
          status: true,
          orderNumber: true,
          outletId: true,
          items: {
            select: { productId: true, quantity: true, unitPrice: true },
          },
        },
      })

      if (!current || current.status === 'VOID') {
        throw new ConflictError('Order sudah di-void oleh request lain', 'VOID_CONFLICT')
      }
      if (current.status === 'DONE') {
        throw new BadRequestError('Order sudah selesai, tidak bisa di-void', 'ORDER_DONE')
      }

      // Update status → VOID
      const voided = await tx.order.update({
        where: { id },
        data: {
          status: 'VOID',
          voidReason: input.reason,
          voidedAt: new Date(),
          voidedById: userId,
          updatedAt: new Date(),
        },
        select: { id: true, orderNumber: true },
      })

      // Kembalikan inventory
      for (const item of current.items) {
        if (!item.productId) continue
        await restoreInventory(
          item.productId,
          current.outletId,
          Number(item.quantity),
          Number(item.unitPrice), // gunakan unitPrice sebagai cost estimate
          current.orderNumber,
          userId,
          tx,
        )
      }

      // ── PATCH: Kembalikan usageCount voucher ─────────────────────────────
      if (current.voucherId) {
        await voucherService.processVoid(current.voucherId, tx)
      }

      // ── PATCH: Refund poin jika ada loyalty earn untuk order ini ──────────
      // Cari loyalty transaction EARN untuk order ini
      const { prisma: prismaClient } = await import('../../infrastructure/database/prisma.client')
      const earnTx = await prismaClient.loyaltyTransaction.findFirst({
        where: { orderId: id, type: 'EARN' },
        select: { id: true, customerId: true, outletId: true, points: true },
      })

      if (earnTx) {
        const currentBalance = await prismaClient.loyaltyTransaction.aggregate({
          where: { customerId: earnTx.customerId },
          _sum: { points: true },
        })
        const balance = Math.max(0, currentBalance._sum.points ?? 0)
        const refundPoints = Math.min(earnTx.points, balance) // tidak refund lebih dari saldo

        if (refundPoints > 0) {
          await prismaClient.loyaltyTransaction.create({
            data: {
              customerId: earnTx.customerId,
              outletId: earnTx.outletId,
              orderId: id,
              type: 'REFUND',
              points: -refundPoints,
              pointsBefore: balance,
              pointsAfter: balance - refundPoints,
              description: `Refund poin dari order ${current.orderNumber} yang di-void`,
            },
          })
        }
      }

      return voided
    })

    const full = await orderRepository.findById(updated.id)
    return normalizeOrder(full!)
  },

  /**
   * Tandai order PAID → DONE.
   * Dipanggil setelah Payment module mengonfirmasi pembayaran.
   */
  async completeOrder(id: string) {
    const order = await orderRepository.findById(id)
    if (!order) throw new NotFoundError('Order', 'ORDER_NOT_FOUND')

    if (order.status !== 'PAID') {
      throw new BadRequestError(
        `Hanya order berstatus PAID yang dapat diselesaikan. Status saat ini: ${order.status}`,
        'INVALID_ORDER_STATUS',
      )
    }

    const updated = await orderRepository.update(id, {
      status: 'DONE',
      completedAt: new Date(),
    })
    return normalizeOrder(updated)
  },

  /**
   * Tandai order PENDING → PAID.
   * Dipanggil oleh Payment module setelah konfirmasi settlement.
   * PATCH: Setelah PAID, otomatis earn poin jika order punya customerId.
   */
  async markPaid(id: string, paidAt?: Date) {
    const order = await orderRepository.findById(id)
    if (!order) throw new NotFoundError('Order', 'ORDER_NOT_FOUND')

    if (order.status !== 'PENDING') {
      throw new BadRequestError(
        `Hanya order berstatus PENDING yang dapat ditandai PAID. Status: ${order.status}`,
        'INVALID_ORDER_STATUS',
      )
    }

    const updated = await orderRepository.update(id, {
      status: 'PAID',
      paidAt: paidAt ?? new Date(),
    })

    // ── PATCH: Earn loyalty points jika ada customer terkait ───────────────
    // Jalankan async tanpa await agar tidak menunda response payment
    // Error di sini tidak boleh menggagalkan flow pembayaran
    const orderWithCustomer = await import('../../infrastructure/database/prisma.client')
      .then(({ prisma }) =>
        prisma.order.findUnique({
          where: { id },
          select: { customerId: true, outletId: true, total: true },
        }),
      )
      .catch(() => null)

    if (orderWithCustomer?.customerId) {
      customerService
        .earnPoints(
          orderWithCustomer.customerId,
          orderWithCustomer.outletId,
          id,
          Number(orderWithCustomer.total),
        )
        .catch((err: Error) => {
          // Log tapi jangan crash — earn poin bukan bagian kritis payment
          console.warn(`⚠️  Gagal earn poin untuk order ${id}:`, err.message)
        })
    }
    // ── END PATCH ──────────────────────────────────────────────────────────

    return normalizeOrder(updated)
  },
}
