/**
 * Midtrans Client — wrapper tipis di atas midtrans-client SDK resmi.
 *
 * Menggunakan Core API (VT-Direct) untuk:
 *  - Membuat transaksi Bank Transfer (VA)
 *  - Mengambil status transaksi
 *  - Membatalkan transaksi pending
 *  - Memvalidasi signature notifikasi webhook
 *
 * Dokumentasi: https://docs.midtrans.com/docs/custom-interface-core-api
 */

import midtransClient from 'midtrans-client'
import crypto from 'crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupportedBank = 'bca' | 'bni' | 'bri' | 'permata' | 'mandiri'

export interface ChargeRequest {
  midtransOrderId: string // order_id yang dikirim ke Midtrans
  grossAmount: number
  bankName: SupportedBank
  customerDetails?: {
    firstName: string
    email?: string
    phone?: string
  }
  itemDetails?: {
    id: string
    price: number
    quantity: number
    name: string
  }[]
}

export interface ChargeResponse {
  transactionId: string
  orderId: string
  grossAmount: string
  vaNumber: string | null
  bankName: string
  transactionTime: string
  expiryTime: string | null
  transactionStatus: string
  statusCode: string
  statusMessage: string
}

export interface MidtransNotification {
  transaction_id: string
  order_id: string
  gross_amount: string
  payment_type: string
  transaction_time: string
  transaction_status: string
  fraud_status?: string
  signature_key: string
  status_code: string
  va_numbers?: { bank: string; va_number: string }[]
  settlement_time?: string
  expiry_time?: string
  status_message?: string
  [key: string]: unknown
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _coreApi: midtransClient.CoreApi | null = null

function getCoreApi(): midtransClient.CoreApi {
  if (_coreApi) return _coreApi

  // Lazy-initialize agar env sudah ter-load
  const { env } = require('../../config/env')

  _coreApi = new midtransClient.CoreApi({
    isProduction: env.MIDTRANS_IS_PRODUCTION,
    serverKey: env.MIDTRANS_SERVER_KEY,
    clientKey: env.MIDTRANS_CLIENT_KEY,
  })

  return _coreApi
}

// ─── Signature validator ──────────────────────────────────────────────────────

/**
 * Verifikasi signature_key dari notifikasi Midtrans.
 *
 * Formula: SHA512(order_id + status_code + gross_amount + server_key)
 * Ref: https://docs.midtrans.com/docs/https-notification-webhooks#verifying-authenticity-of-notification
 */
export function verifySignature(notification: MidtransNotification): boolean {
  try {
    const { env } = require('../../config/env')
    const { order_id, status_code, gross_amount, signature_key } = notification

    const raw = `${order_id}${status_code}${gross_amount}${env.MIDTRANS_SERVER_KEY}`
    const expected = crypto.createHash('sha512').update(raw).digest('hex')

    return expected === signature_key
  } catch {
    return false
  }
}

// ─── Bank Transfer (VA) operations ───────────────────────────────────────────

/**
 * Buat transaksi Bank Transfer dan dapatkan nomor VA.
 *
 * Bank support: BCA, BNI, BRI, Permata, Mandiri (echannel)
 * Default expiry: 24 jam dari waktu pembuatan
 */
export async function chargeBankTransfer(req: ChargeRequest): Promise<ChargeResponse> {
  const core = getCoreApi()

  // Mandiri menggunakan payment_type "echannel", bukan "bank_transfer"
  const isMandiri = req.bankName === 'mandiri'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {
    payment_type: isMandiri ? 'echannel' : 'bank_transfer',
    transaction_details: {
      order_id: req.midtransOrderId,
      gross_amount: Math.round(req.grossAmount), // Midtrans tidak support desimal untuk IDR
    },
  }

  if (!isMandiri) {
    payload['bank_transfer'] = { bank: req.bankName }
  } else {
    payload['echannel'] = {
      bill_info1: 'Pembayaran POS',
      bill_info2: req.midtransOrderId,
    }
  }

  if (req.customerDetails) {
    payload['customer_details'] = {
      first_name: req.customerDetails.firstName.slice(0, 30), // BCA max 30 char
      ...(req.customerDetails.email ? { email: req.customerDetails.phone } : {}),
      ...(req.customerDetails.phone ? { phone: req.customerDetails.phone } : {}),
    }
  }

  if (req.itemDetails?.length) {
    payload['item_details'] = req.itemDetails
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = await core.charge(payload)

  // Ekstrak VA number (format berbeda tiap bank)
  let vaNumber: string | null = null
  if (response.va_numbers?.length) {
    vaNumber = response.va_numbers[0].va_number
  } else if (response.permata_va_number) {
    vaNumber = response.permata_va_number
  } else if (response.bill_key) {
    // Mandiri: bill_key (kode bayar) — bukan VA biasa
    vaNumber = `${response.biller_code}-${response.bill_key}`
  }

  return {
    transactionId: response.transaction_id,
    orderId: response.order_id,
    grossAmount: response.gross_amount,
    vaNumber,
    bankName: req.bankName,
    transactionTime: response.transaction_time,
    expiryTime: response.expiry_time ?? null,
    transactionStatus: response.transaction_status,
    statusCode: response.status_code,
    statusMessage: response.status_message,
  }
}

/**
 * Ambil status transaksi dari Midtrans berdasarkan midtransOrderId.
 */
export async function getTransactionStatus(midtransOrderId: string): Promise<MidtransNotification> {
  const core = getCoreApi()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = await core.transaction.status(midtransOrderId)
  return response as MidtransNotification
}

/**
 * Batalkan transaksi PENDING di Midtrans.
 * Hanya bisa dilakukan sebelum settlement.
 */
export async function cancelTransaction(midtransOrderId: string): Promise<void> {
  const core = getCoreApi()
  await core.transaction.cancel(midtransOrderId)
}
