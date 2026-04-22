import { prisma } from '../../infrastructure/database/prisma.client'

// ─── Shared select ────────────────────────────────────────────────────────────

const paymentSelect = {
  id:                      true,
  orderId:                 true,
  outletId:                true,
  midtransOrderId:         true,
  midtransTransactionId:   true,
  paymentType:             true,
  bankName:                true,
  vaNumber:                true,
  grossAmount:             true,
  status:                  true,
  midtransTransactionTime: true,
  midtransSettlementTime:  true,
  midtransExpireTime:      true,
  paidAt:                  true,
  expiredAt:               true,
  createdAt:               true,
  updatedAt:               true,
} as const

// ─── Type ─────────────────────────────────────────────────────────────────────

export type PaymentRow = {
  id:                      string
  orderId:                 string
  outletId:                string
  midtransOrderId:         string
  midtransTransactionId:   string | null
  paymentType:             string
  bankName:                string
  vaNumber:                string | null
  grossAmount:             unknown   // Prisma Decimal
  status:                  'PENDING' | 'SETTLEMENT' | 'EXPIRED' | 'CANCELLED' | 'FAILED'
  midtransTransactionTime: Date | null
  midtransSettlementTime:  Date | null
  midtransExpireTime:      Date | null
  paidAt:                  Date | null
  expiredAt:               Date | null
  createdAt:               Date
  updatedAt:               Date
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

export function normalizePayment(row: PaymentRow) {
  return {
    id:                      row.id,
    orderId:                 row.orderId,
    outletId:                row.outletId,
    midtransOrderId:         row.midtransOrderId,
    midtransTransactionId:   row.midtransTransactionId,
    paymentType:             row.paymentType,
    bankName:                row.bankName,
    vaNumber:                row.vaNumber,
    grossAmount:             Number(row.grossAmount),
    status:                  row.status,
    midtransTransactionTime: row.midtransTransactionTime,
    midtransSettlementTime:  row.midtransSettlementTime,
    midtransExpireTime:      row.midtransExpireTime,
    paidAt:                  row.paidAt,
    expiredAt:               row.expiredAt,
    createdAt:               row.createdAt,
    updatedAt:               row.updatedAt,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const paymentRepository = {

  findByOrderId(orderId: string): Promise<PaymentRow | null> {
    return prisma.payment.findUnique({
      where:  { orderId },
      select: paymentSelect,
    }) as Promise<PaymentRow | null>
  },

  findByMidtransOrderId(midtransOrderId: string): Promise<PaymentRow | null> {
    return prisma.payment.findUnique({
      where:  { midtransOrderId },
      select: paymentSelect,
    }) as Promise<PaymentRow | null>
  },

  /**
   * Upsert payment — satu order satu payment (replace jika ganti metode).
   * Dipanggil saat create VA pertama atau change method.
   */
  upsert(data: {
    orderId:         string
    outletId:        string
    midtransOrderId: string
    paymentType:     string
    bankName:        string
    vaNumber:        string | null
    grossAmount:     number
    midtransTransactionId?:   string
    midtransTransactionTime?: Date
    midtransExpireTime?:      Date
  }): Promise<PaymentRow> {
    return prisma.payment.upsert({
      where:  { orderId: data.orderId },
      create: {
        orderId:                 data.orderId,
        outletId:                data.outletId,
        midtransOrderId:         data.midtransOrderId,
        paymentType:             data.paymentType,
        bankName:                data.bankName,
        vaNumber:                data.vaNumber,
        grossAmount:             data.grossAmount,
        status:                  'PENDING',
        midtransTransactionId:   data.midtransTransactionId,
        midtransTransactionTime: data.midtransTransactionTime,
        midtransExpireTime:      data.midtransExpireTime,
      },
      update: {
        // Reset dan isi dengan data baru (saat change method)
        midtransOrderId:         data.midtransOrderId,
        paymentType:             data.paymentType,
        bankName:                data.bankName,
        vaNumber:                data.vaNumber,
        grossAmount:             data.grossAmount,
        status:                  'PENDING',
        midtransTransactionId:   data.midtransTransactionId ?? null,
        midtransTransactionTime: data.midtransTransactionTime ?? null,
        midtransExpireTime:      data.midtransExpireTime ?? null,
        // Reset field lama
        midtransSettlementTime:  null,
        paidAt:                  null,
        expiredAt:               null,
        rawNotification:         undefined,
        updatedAt:               new Date(),
      },
      select: paymentSelect,
    }) as Promise<PaymentRow>
  },

  update(
    id: string,
    data: Partial<{
      status:                  'PENDING' | 'SETTLEMENT' | 'EXPIRED' | 'CANCELLED' | 'FAILED'
      midtransTransactionId:   string
      midtransSettlementTime:  Date
      midtransExpireTime:      Date
      rawNotification:         Record<string, unknown>
      paidAt:                  Date
      expiredAt:               Date
    }>,
  ): Promise<PaymentRow> {
    return prisma.payment.update({
      where:  { id },
      data:   { ...data, updatedAt: new Date() },
      select: paymentSelect,
    }) as Promise<PaymentRow>
  },
}
