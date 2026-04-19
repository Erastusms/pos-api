/**
 * Receipt Queue — BullMQ-based job queue untuk generate PDF receipt.
 *
 * Arsitektur:
 *   API endpoint → enqueue job → Redis queue → Worker → generate PDF → update DB
 *
 * Queue name: "receipt-pdf"
 * Job payload: { receiptId, orderId, outletId }
 */

import { Queue, Worker, type Job } from 'bullmq'
import { env } from '../../config/env'

// ─── Job payload type ─────────────────────────────────────────────────────────

export interface ReceiptJobData {
  receiptId: string
  orderId:   string
  outletId:  string
}

// ─── Queue name ───────────────────────────────────────────────────────────────

export const RECEIPT_QUEUE_NAME = 'receipt-pdf'

// ─── BullMQ connection config (shared) ───────────────────────────────────────

/** Extract host:port dari REDIS_URL untuk BullMQ (tidak support URL string langsung) */
function parseRedisUrl(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}

export const redisConnection = parseRedisUrl(env.REDIS_URL)

// ─── Queue singleton ──────────────────────────────────────────────────────────

let _queue: Queue<ReceiptJobData> | null = null

export function getReceiptQueue(): Queue<ReceiptJobData> {
  if (!_queue) {
    _queue = new Queue<ReceiptJobData>(RECEIPT_QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts:         3,
        backoff:          { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 }, // simpan 100 job terakhir yang sukses
        removeOnFail:     { count: 50  }, // simpan 50 job terakhir yang gagal
      },
    })
  }
  return _queue
}

// ─── Worker factory ───────────────────────────────────────────────────────────

/**
 * Buat Worker yang memproses job dari receipt queue.
 * Processor function di-inject saat startup agar bisa menerima
 * dependency (prisma, pdfGenerator) tanpa circular import.
 */
export function createReceiptWorker(
  processor: (job: Job<ReceiptJobData>) => Promise<void>,
): Worker<ReceiptJobData> {
  return new Worker<ReceiptJobData>(
    RECEIPT_QUEUE_NAME,
    processor,
    {
      connection:  redisConnection,
      concurrency: 3, // proses maks 3 PDF sekaligus
    },
  )
}
