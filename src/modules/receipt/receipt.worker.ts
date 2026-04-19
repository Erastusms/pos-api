/**
 * Receipt Worker — memproses job dari queue untuk generate PDF.
 *
 * Flow tiap job:
 *  1. Set receipt.status = GENERATING
 *  2. Fetch data order + outlet + settings
 *  3. Generate PDF via receipt.pdf.ts
 *  4. Set receipt.status = READY + simpan pdfUrl
 *  5. Jika error → set status = FAILED (BullMQ retry otomatis)
 */

import type { Job } from 'bullmq'
import { prisma } from '../../infrastructure/database/prisma.client'
import { createReceiptWorker, type ReceiptJobData } from '../../infrastructure/queue/receipt.queue'
import { generateReceiptPdf, type ReceiptData } from './receipt.pdf'

// ─── Job processor ────────────────────────────────────────────────────────────

async function processReceiptJob(job: Job<ReceiptJobData>): Promise<void> {
  const { receiptId, orderId, outletId } = job.data

  // ── 1. Set status GENERATING ──────────────────────────────────────────────
  await prisma.receipt.update({
    where: { id: receiptId },
    data: { status: 'GENERATING', attempts: { increment: 1 }, updatedAt: new Date() },
  })

  // ── 2. Fetch data order ───────────────────────────────────────────────────
  const [order, outletSettings, outlet] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paidAt: true,
        createdAt: true,
        subtotal: true,
        discountAmount: true,
        discountedSubtotal: true,
        serviceChargeAmount: true,
        taxAmount: true,
        roundingAmount: true,
        total: true,
        discountName: true,
        discountCode: true,
        discountType: true,
        discountValue: true,
        user: { select: { name: true } },
        items: {
          select: {
            productName: true,
            variantName: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            itemDiscountAmount: true,
            modifiers: { select: { name: true, price: true }, orderBy: { id: 'asc' as const } },
          },
          orderBy: { id: 'asc' as const },
        },
      },
    }),
    prisma.outletSettings.findUnique({
      where: { outletId },
      select: {
        taxName: true,
        currency: true,
        timezone: true,
        receiptFooter: true,
        receiptLogoUrl: true,
      },
    }),
    prisma.outlet.findUnique({
      where: { id: outletId },
      select: { name: true, address: true, phone: true, taxNumber: true },
    }),
  ])

  if (!order) throw new Error(`Order ${orderId} tidak ditemukan`)
  if (!outlet) throw new Error(`Outlet ${outletId} tidak ditemukan`)

  // ── 3. Susun ReceiptData ───────────────────────────────────────────────────
  const settings = outletSettings ?? {
    taxName: 'PPN',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    receiptFooter: null,
    receiptLogoUrl: null,
  }

  const receiptData: ReceiptData = {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    cashierName: order.user.name,
    status: order.status,
    outlet: {
      name: outlet.name,
      address: outlet.address,
      phone: outlet.phone,
      taxNumber: outlet.taxNumber,
      receiptFooter: settings.receiptFooter,
      receiptLogoUrl: settings.receiptLogoUrl,
      taxName: settings.taxName,
      currency: settings.currency,
      timezone: settings.timezone,
    },
    items: order.items.map(
      (item: {
        productName: string
        variantName: string | null
        quantity: unknown
        unitPrice: unknown
        lineTotal: unknown
        itemDiscountAmount: unknown
        modifiers: { name: string; price: unknown }[]
      }) => ({
        productName: item.productName,
        variantName: item.variantName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
        itemDiscountAmount: Number(item.itemDiscountAmount),
        modifiers: item.modifiers.map((m: { name: string; price: unknown }) => ({
          name: m.name,
          price: Number(m.price),
        })),
      }),
    ),
    financial: {
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      discountedSubtotal: Number(order.discountedSubtotal),
      serviceChargeAmount: Number(order.serviceChargeAmount),
      taxAmount: Number(order.taxAmount),
      roundingAmount: Number(order.roundingAmount),
      total: Number(order.total),
    },
    discount: order.discountName
      ? {
          name: order.discountName,
          code: order.discountCode,
          type: order.discountType,
          value: order.discountValue !== null ? Number(order.discountValue) : null,
        }
      : null,
  }

  // ── 4. Generate PDF ────────────────────────────────────────────────────────
  const filename = `receipt-${order.orderNumber}-${Date.now()}.pdf`
  const pdfUrl = await generateReceiptPdf(receiptData, filename)

  // ── 5. Update receipt → READY ──────────────────────────────────────────────
  await prisma.receipt.update({
    where: { id: receiptId },
    data: { status: 'READY', pdfUrl, updatedAt: new Date() },
  })
}

// ─── Worker singleton ─────────────────────────────────────────────────────────

let _worker: ReturnType<typeof createReceiptWorker> | null = null

export function startReceiptWorker(): ReturnType<typeof createReceiptWorker> {
  if (_worker) return _worker

  _worker = createReceiptWorker(async (job: Job<ReceiptJobData>) => {
    try {
      await processReceiptJob(job)
    } catch (err) {
      // Tandai FAILED — BullMQ akan retry sesuai config backoff
      try {
        await prisma.receipt.update({
          where: { id: job.data.receiptId },
          data: {
            status: 'FAILED',
            errorMessage: err instanceof Error ? err.message : String(err),
            updatedAt: new Date(),
          },
        })
      } catch {
        // Jangan crash worker karena gagal update status
      }
      throw err // re-throw agar BullMQ tahu job gagal
    }
  })

  _worker.on('completed', (job) => {
    console.info(`📄 Receipt job ${job.id} completed: ${job.data.orderId}`)
  })
  _worker.on('failed', (job, err) => {
    console.error(`❌ Receipt job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`)
  })

  console.info('🖨️  Receipt PDF worker started')
  return _worker
}

export async function stopReceiptWorker(): Promise<void> {
  if (_worker) {
    await _worker.close()
    _worker = null
    console.info('🛑 Receipt PDF worker stopped')
  }
}
