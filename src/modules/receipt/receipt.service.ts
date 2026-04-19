/**
 * Receipt Service.
 *
 * Tanggung jawab:
 *  - Enqueue job PDF ke BullMQ
 *  - Query status receipt
 *  - Regenerate receipt (reset & re-enqueue)
 */

import { receiptRepository } from './receipt.repository'
import { getReceiptQueue } from '../../infrastructure/queue/receipt.queue'
import { NotFoundError, BadRequestError } from '../../shared/errors'
import { prisma } from '../../infrastructure/database/prisma.client'

// ─── Normalizer ───────────────────────────────────────────────────────────────

export function normalizeReceipt(row: Awaited<ReturnType<typeof receiptRepository.findByOrderId>>) {
  if (!row) return null
  return {
    id: row.id,
    orderId: row.orderId,
    outletId: row.outletId,
    status: row.status,
    pdfUrl: row.pdfUrl,
    jobId: row.jobId,
    errorMessage: row.errorMessage,
    attempts: row.attempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const receiptService = {
  /**
   * Enqueue generate PDF untuk satu order.
   * Idempotent: upsert receipt row — aman dipanggil berkali-kali.
   */
  async enqueue(orderId: string, outletId: string) {
    // Validasi order ada & milik outlet ini
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, outletId: true, orderNumber: true },
    })

    if (!order) throw new NotFoundError('Order', 'ORDER_NOT_FOUND')
    if (order.outletId !== outletId) throw new NotFoundError('Order', 'ORDER_NOT_FOUND')

    // Upsert receipt row terlebih dahulu agar kita punya receiptId
    const jobId = `receipt-${orderId}`
    const receipt = await receiptRepository.upsert({ orderId, outletId, jobId })

    // Enqueue job ke BullMQ dengan data lengkap
    const queue = getReceiptQueue()
    const job = await queue.add(
      `receipt:${order.orderNumber}`,
      { receiptId: receipt.id, orderId, outletId },
      {
        jobId, // deterministic jobId → idempotent (BullMQ skip duplicate yang masih pending)
        priority: 1,
      },
    )

    // Update jobId jika BullMQ mengassign ID berbeda
    if (job.id && job.id !== receipt.jobId) {
      await receiptRepository.update(receipt.id, { jobId: job.id })
    }

    const updated = await receiptRepository.findByOrderId(orderId)
    return normalizeReceipt(updated)
  },

  /**
   * Ambil status receipt berdasarkan orderId.
   */
  async getByOrderId(orderId: string, outletId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { outletId: true },
    })
    if (!order || order.outletId !== outletId) {
      throw new NotFoundError('Order', 'ORDER_NOT_FOUND')
    }

    const receipt = await receiptRepository.findByOrderId(orderId)
    if (!receipt) throw new NotFoundError('Receipt', 'RECEIPT_NOT_FOUND')

    return normalizeReceipt(receipt)
  },

  /**
   * Reset & generate ulang receipt.
   * Guard: Tidak bisa regenerate jika masih GENERATING.
   */
  async regenerate(orderId: string, outletId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, outletId: true, orderNumber: true },
    })
    if (!order || order.outletId !== outletId) {
      throw new NotFoundError('Order', 'ORDER_NOT_FOUND')
    }

    const existing = await receiptRepository.findByOrderId(orderId)

    if (existing?.status === 'GENERATING') {
      throw new BadRequestError(
        'Receipt sedang dalam proses generate. Coba lagi nanti.',
        'RECEIPT_GENERATING',
      )
    }

    // Hapus job lama dari queue (jika ada & masih pending)
    if (existing?.jobId) {
      const queue = getReceiptQueue()
      const oldJob = await queue.getJob(existing.jobId)
      if (oldJob) {
        await oldJob.remove().catch(() => {
          /* job mungkin sudah selesai — normal */
        })
      }
    }

    // Buat job baru dengan timestamp untuk hindari duplicate key
    const newJobId = `receipt-${orderId}-${Date.now()}`
    const queue = getReceiptQueue()

    // Upsert receipt row (reset state)
    const receipt = await receiptRepository.upsert({
      orderId,
      outletId,
      jobId: newJobId,
    })

    await queue.add(
      `receipt:${order.orderNumber}`,
      { receiptId: receipt.id, orderId, outletId },
      { jobId: newJobId, priority: 1 },
    )

    const updated = await receiptRepository.findByOrderId(orderId)
    return normalizeReceipt(updated)
  },
}
