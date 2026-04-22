/**
 * Payment Service.
 *
 * Tanggung jawab:
 *  - Buat VA Bank Transfer via Midtrans Core API
 *  - Ganti metode pembayaran (cancel lama → buat baru)
 *  - Sinkron status dari Midtrans
 *  - Handle webhook notification (idempotent)
 *  - Update Order status setelah settlement
 */

import { prisma } from '../../infrastructure/database/prisma.client'
import { paymentRepository, normalizePayment } from './payment.repository'
import { orderService } from '../order/order.service'
import {
  chargeBankTransfer,
  cancelTransaction,
  getTransactionStatus,
  verifySignature,
  type MidtransNotification,
  type SupportedBank,
} from './midtrans.client'
import type { CreatePaymentInput, ChangePaymentMethodInput } from './payment.schema'
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate midtransOrderId yang unik per transaksi.
 * Format: {orderNumber}-{unixTs}
 * Berbeda dari orderId POS agar bisa buat ulang saat ganti metode.
 */
function buildMidtransOrderId(orderNumber: string): string {
  return `${orderNumber}-${Date.now()}`
}

/** Parse tanggal dari string Midtrans "YYYY-MM-DD HH:mm:ss" → Date */
function parseMidtransDate(s: string | undefined | null): Date | undefined {
  if (!s) return undefined
  // Ganti spasi dengan T agar valid ISO string
  return new Date(s.replace(' ', 'T') + '+07:00')
}

/**
 * Map transaction_status + fraud_status dari Midtrans ke status Payment kita.
 */
function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string,
): 'PENDING' | 'SETTLEMENT' | 'EXPIRED' | 'CANCELLED' | 'FAILED' {
  switch (transactionStatus) {
    case 'settlement':
      return 'SETTLEMENT'
    case 'pending':
      return 'PENDING'
    case 'cancel':
      return 'CANCELLED'
    case 'expire':
      return 'EXPIRED'
    case 'deny':
      return 'FAILED'
    case 'capture':
      // Hanya credit card — fraud_status harus accept
      return fraudStatus === 'accept' ? 'SETTLEMENT' : 'FAILED'
    default:
      return 'FAILED'
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const paymentService = {
  /**
   * Ambil payment by orderId.
   */
  async getByOrderId(orderId: string, outletId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { outletId: true },
    })
    if (!order || order.outletId !== outletId) {
      throw new NotFoundError('Order', 'ORDER_NOT_FOUND')
    }

    const payment = await paymentRepository.findByOrderId(orderId)
    if (!payment) throw new NotFoundError('Payment', 'PAYMENT_NOT_FOUND')

    return normalizePayment(payment)
  },

  /**
   * Buat VA Bank Transfer untuk order.
   *
   * Guard:
   * - Order harus ada, milik outlet, dan berstatus PENDING
   * - Jika sudah ada payment SETTLEMENT → tolak
   * - Jika sudah ada payment PENDING → kembalikan yang existing (idempotent)
   */
  async createBankTransfer(input: CreatePaymentInput, outletId: string) {
    const { orderId, bankName } = input

    // ── Validasi order ──────────────────────────────────────────────────────
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        outletId: true,
        status: true,
        total: true,
        user: { select: { name: true, email: true, phone: true } },
      },
    })

    if (!order || order.outletId !== outletId) {
      throw new NotFoundError('Order', 'ORDER_NOT_FOUND')
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestError(
        `Hanya order berstatus PENDING yang bisa dibayar. Status saat ini: ${order.status}`,
        'INVALID_ORDER_STATUS',
      )
    }

    // ── Cek payment existing ───────────────────────────────────────────────
    const existing = await paymentRepository.findByOrderId(orderId)

    if (existing?.status === 'SETTLEMENT') {
      throw new ConflictError('Order sudah lunas', 'ORDER_ALREADY_PAID')
    }

    // Idempotent: jika PENDING dengan bank sama → kembalikan yang ada
    if (existing?.status === 'PENDING' && existing.bankName === bankName) {
      return normalizePayment(existing)
    }

    // ── Charge ke Midtrans ─────────────────────────────────────────────────
    const midtransOrderId = buildMidtransOrderId(order.orderNumber)
    const grossAmount = Math.round(Number(order.total)) // IDR tidak support desimal

    const chargeResult = await chargeBankTransfer({
      midtransOrderId,
      grossAmount,
      bankName: bankName as SupportedBank,
      customerDetails: {
        firstName: order.user.name.split(' ')[0] ?? order.user.name,
        email: order.user.email ?? undefined,
        phone: order.user.phone ?? undefined,
      },
    })

    // ── Simpan ke DB ───────────────────────────────────────────────────────
    const payment = await paymentRepository.upsert({
      orderId,
      outletId,
      midtransOrderId,
      paymentType: 'bank_transfer',
      bankName,
      vaNumber: chargeResult.vaNumber,
      grossAmount,
      midtransTransactionId: chargeResult.transactionId,
      midtransTransactionTime: parseMidtransDate(chargeResult.transactionTime),
      midtransExpireTime: parseMidtransDate(chargeResult.expiryTime),
    })

    return normalizePayment(payment)
  },

  /**
   * Ganti metode pembayaran (bank).
   *
   * Flow:
   * 1. Validasi payment PENDING ada
   * 2. Cancel transaksi lama di Midtrans
   * 3. Buat transaksi baru dengan bank baru
   * 4. Update payment record
   */
  async changePaymentMethod(orderId: string, input: ChangePaymentMethodInput, outletId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        outletId: true,
        status: true,
        total: true,
        user: { select: { name: true, email: true, phone: true } },
      },
    })

    if (!order || order.outletId !== outletId) {
      throw new NotFoundError('Order', 'ORDER_NOT_FOUND')
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestError(
        `Hanya order PENDING yang bisa ganti metode. Status: ${order.status}`,
        'INVALID_ORDER_STATUS',
      )
    }

    const existing = await paymentRepository.findByOrderId(orderId)
    if (!existing) {
      throw new NotFoundError('Payment', 'PAYMENT_NOT_FOUND')
    }
    if (existing.status !== 'PENDING') {
      throw new BadRequestError(
        `Tidak bisa ganti metode — payment berstatus ${existing.status}`,
        'PAYMENT_NOT_PENDING',
      )
    }
    if (existing.bankName === input.bankName) {
      throw new BadRequestError(
        `Bank sudah menggunakan ${input.bankName.toUpperCase()}`,
        'SAME_BANK',
      )
    }

    // ── Cancel VA lama di Midtrans ─────────────────────────────────────────
    try {
      await cancelTransaction(existing.midtransOrderId)
    } catch {
      // Midtrans mungkin sudah auto-expire — lanjutkan saja
      console.warn(`⚠️  Cancel Midtrans ${existing.midtransOrderId} gagal (mungkin sudah expired)`)
    }

    // Update status lama ke CANCELLED dulu
    await paymentRepository.update(existing.id, { status: 'CANCELLED' })

    // ── Buat VA baru dengan bank baru ──────────────────────────────────────
    return paymentService.createBankTransfer({ orderId, bankName: input.bankName }, outletId)
  },

  /**
   * Sinkron status payment dari Midtrans secara manual.
   * Berguna jika webhook tidak diterima.
   */
  async syncStatus(orderId: string, outletId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { outletId: true },
    })
    if (!order || order.outletId !== outletId) {
      throw new NotFoundError('Order', 'ORDER_NOT_FOUND')
    }

    const payment = await paymentRepository.findByOrderId(orderId)
    if (!payment) throw new NotFoundError('Payment', 'PAYMENT_NOT_FOUND')

    if (payment.status !== 'PENDING') {
      // Sudah final — tidak perlu sync
      return normalizePayment(payment)
    }

    const statusData = await getTransactionStatus(payment.midtransOrderId)
    const newStatus = mapMidtransStatus(statusData.transaction_status, statusData.fraud_status)

    const updated = await paymentRepository.update(payment.id, {
      status: newStatus,
      midtransTransactionId:
        statusData.transaction_id ?? payment.midtransTransactionId ?? undefined,
      midtransSettlementTime: parseMidtransDate(statusData.settlement_time),
      rawNotification: statusData as Record<string, unknown>,
      ...(newStatus === 'SETTLEMENT' ? { paidAt: new Date() } : {}),
      ...(newStatus === 'EXPIRED' ? { expiredAt: new Date() } : {}),
    })

    // Jika settlement → update order ke PAID
    if (newStatus === 'SETTLEMENT') {
      await orderService.markPaid(orderId, updated.paidAt ?? new Date())
    }

    return normalizePayment(updated)
  },

  /**
   * Handle notifikasi webhook dari Midtrans.
   *
   * Keamanan:
   * 1. Verifikasi signature_key (SHA512)
   * 2. Idempotent: skip jika status sudah sama
   *
   * Midtrans mungkin mengirim notifikasi berulang untuk event yang sama.
   * Gunakan midtransTransactionId + status sebagai key idempotency.
   */
  async handleNotification(
    notification: MidtransNotification,
  ): Promise<{ processed: boolean; message: string }> {
    // ── 1. Verifikasi signature ────────────────────────────────────────────
    if (!verifySignature(notification)) {
      throw new BadRequestError('Signature notifikasi tidak valid', 'INVALID_SIGNATURE')
    }

    // ── 2. Temukan payment berdasarkan Midtrans order_id ──────────────────
    const payment = await paymentRepository.findByMidtransOrderId(notification.order_id)

    if (!payment) {
      // Mungkin webhook dikirim untuk transaksi di luar sistem ini — abaikan
      console.warn(`⚠️  Payment untuk midtransOrderId ${notification.order_id} tidak ditemukan`)
      return { processed: false, message: 'Payment tidak ditemukan, notification diabaikan' }
    }

    // ── 3. Idempotency check ───────────────────────────────────────────────
    const newStatus = mapMidtransStatus(notification.transaction_status, notification.fraud_status)

    if (payment.status === newStatus) {
      return {
        processed: false,
        message: `Status sudah ${newStatus}, notifikasi duplikat diabaikan`,
      }
    }

    // Status final tidak boleh diupdate lagi (kecuali ke FAILED untuk reversal)
    const isFinal = ['SETTLEMENT', 'CANCELLED', 'FAILED'].includes(payment.status)
    if (isFinal && newStatus !== 'FAILED') {
      return { processed: false, message: `Payment sudah berstatus final ${payment.status}` }
    }

    // ── 4. Update payment status ───────────────────────────────────────────
    await paymentRepository.update(payment.id, {
      status: newStatus,
      midtransTransactionId: notification.transaction_id,
      midtransSettlementTime: parseMidtransDate(notification.settlement_time),
      midtransExpireTime: parseMidtransDate(notification.expiry_time),
      rawNotification: notification as Record<string, unknown>,
      ...(newStatus === 'SETTLEMENT' ? { paidAt: new Date() } : {}),
      ...(newStatus === 'EXPIRED' ? { expiredAt: new Date() } : {}),
    })

    // ── 5. Update Order status ─────────────────────────────────────────────
    if (newStatus === 'SETTLEMENT') {
      try {
        await orderService.markPaid(payment.orderId)
      } catch (err) {
        // Log tapi jangan gagalkan response — Midtrans butuh 200 OK
        console.error('❌ Gagal update order setelah payment settlement:', err)
      }
    }

    console.info(`✅ Payment notification processed: ${notification.order_id} → ${newStatus}`)
    return { processed: true, message: `Payment berhasil diupdate ke ${newStatus}` }
  },
}
