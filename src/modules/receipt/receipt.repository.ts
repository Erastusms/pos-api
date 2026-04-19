import { prisma } from '../../infrastructure/database/prisma.client'

// ─── Shared select ────────────────────────────────────────────────────────────

const receiptSelect = {
  id:           true,
  orderId:      true,
  outletId:     true,
  status:       true,
  pdfUrl:       true,
  jobId:        true,
  errorMessage: true,
  attempts:     true,
  createdAt:    true,
  updatedAt:    true,
} as const

// ─── Type ─────────────────────────────────────────────────────────────────────

export type ReceiptRow = {
  id:           string
  orderId:      string
  outletId:     string
  status:       'QUEUED' | 'GENERATING' | 'READY' | 'FAILED'
  pdfUrl:       string | null
  jobId:        string | null
  errorMessage: string | null
  attempts:     number
  createdAt:    Date
  updatedAt:    Date
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const receiptRepository = {

  findByOrderId(orderId: string): Promise<ReceiptRow | null> {
    return prisma.receipt.findUnique({
      where:  { orderId },
      select: receiptSelect,
    }) as Promise<ReceiptRow | null>
  },

  findById(id: string): Promise<ReceiptRow | null> {
    return prisma.receipt.findUnique({
      where:  { id },
      select: receiptSelect,
    }) as Promise<ReceiptRow | null>
  },

  /**
   * Upsert receipt row.
   * Satu order selalu punya satu receipt — jika sudah ada, reset ke QUEUED.
   */
  upsert(data: {
    orderId:  string
    outletId: string
    jobId:    string
  }): Promise<ReceiptRow> {
    return prisma.receipt.upsert({
      where:  { orderId: data.orderId },
      create: {
        orderId:  data.orderId,
        outletId: data.outletId,
        jobId:    data.jobId,
        status:   'QUEUED',
        attempts: 0,
      },
      update: {
        jobId:        data.jobId,
        status:       'QUEUED',
        pdfUrl:       null,
        errorMessage: null,
        attempts:     0,
        updatedAt:    new Date(),
      },
      select: receiptSelect,
    }) as Promise<ReceiptRow>
  },

  update(
    id: string,
    data: Partial<Pick<ReceiptRow, 'status' | 'pdfUrl' | 'jobId' | 'errorMessage' | 'attempts'>>,
  ): Promise<ReceiptRow> {
    return prisma.receipt.update({
      where:  { id },
      data:   { ...data, updatedAt: new Date() },
      select: receiptSelect,
    }) as Promise<ReceiptRow>
  },
}
