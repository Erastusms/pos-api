/**
 * Voucher Engine — kalkulasi diskon voucher (pure functions, no DB calls).
 *
 * Digunakan bersama oleh:
 *  - cart.service  (preview total di cart)
 *  - order.service (snapshot saat checkout)
 *
 * Mendukung 4 kombinasi:
 *   PERCENTAGE  × PER_BILL  → potong % dari subtotal
 *   PERCENTAGE  × PER_ITEM  → potong % dari lineTotal tiap produk yang berlaku
 *   FIXED_AMOUNT × PER_BILL  → potong nominal dari subtotal
 *   FIXED_AMOUNT × PER_ITEM  → potong nominal per unit setiap item yang berlaku
 */

import { round2 } from '../../shared/utils/tax.engine'

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoucherDef = {
  id: string
  name: string
  code: string | null
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  scope: 'PER_BILL' | 'PER_ITEM'
  value: number
  minPurchase: number | null
  maxDiscount: number | null
  usageLimit: number | null
  usageLimitPerCustomer: number | null
  usageCount: number
  autoApply: boolean
  isActive: boolean
  startAt: Date | null
  endAt: Date | null
  productIds: string[]
}

export type LineItemForVoucher = {
  productId: string
  lineTotal: number
  quantity: number
}

export type VoucherComputeResult = {
  discountAmount: number
  /** Map productId → item-level discount (untuk PER_ITEM) */
  itemDiscountMap: Record<string, number>
  qualifies: boolean
  reason: string | null
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Cek apakah voucher masih valid pada waktu sekarang.
 * Tidak memeriksa DB — hanya memeriksa field dari VoucherDef.
 */
export function validateVoucherEligibility(
  voucher: VoucherDef,
  opts: {
    subtotal: number
    usageByCustomer?: number // berapa kali customer ini sudah pakai
  },
): { valid: boolean; reason: string | null } {
  if (!voucher.isActive) {
    return { valid: false, reason: 'Voucher tidak aktif' }
  }

  const now = new Date()

  if (voucher.startAt && now < voucher.startAt) {
    return { valid: false, reason: 'Voucher belum mulai berlaku' }
  }

  if (voucher.endAt && now > voucher.endAt) {
    return { valid: false, reason: 'Voucher sudah kadaluarsa' }
  }

  if (voucher.usageLimit !== null && voucher.usageCount >= voucher.usageLimit) {
    return { valid: false, reason: 'Voucher sudah habis digunakan' }
  }

  if (
    voucher.usageLimitPerCustomer !== null &&
    opts.usageByCustomer !== undefined &&
    opts.usageByCustomer >= voucher.usageLimitPerCustomer
  ) {
    return {
      valid: false,
      reason: `Voucher hanya bisa digunakan ${voucher.usageLimitPerCustomer}x per customer`,
    }
  }

  if (voucher.minPurchase !== null && opts.subtotal < voucher.minPurchase) {
    return {
      valid: false,
      reason: `Minimum pembelian Rp ${voucher.minPurchase.toLocaleString('id-ID')} belum terpenuhi`,
    }
  }

  return { valid: true, reason: null }
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Hitung diskon voucher berdasarkan definisi dan item-item di cart/order.
 *
 * @param lineItems - enriched line items (unitPrice + modifier) × qty
 * @param subtotal  - total sebelum diskon
 * @param voucher   - definisi voucher (null → return zero)
 */
export function computeVoucherDiscount(
  lineItems: LineItemForVoucher[],
  subtotal: number,
  voucher: VoucherDef | null,
): VoucherComputeResult {
  if (!voucher) {
    return { discountAmount: 0, itemDiscountMap: {}, qualifies: true, reason: null }
  }

  // Guard: minPurchase
  if (voucher.minPurchase !== null && subtotal < voucher.minPurchase) {
    return {
      discountAmount: 0,
      itemDiscountMap: {},
      qualifies: false,
      reason: `Minimum pembelian Rp ${voucher.minPurchase.toLocaleString('id-ID')} belum terpenuhi`,
    }
  }

  let discountAmount = 0
  const itemDiscountMap: Record<string, number> = {}

  // ── PER_BILL ──────────────────────────────────────────────────────────────
  if (voucher.scope === 'PER_BILL') {
    discountAmount =
      voucher.type === 'PERCENTAGE' ? round2(subtotal * (voucher.value / 100)) : voucher.value

    if (voucher.maxDiscount !== null) {
      discountAmount = Math.min(discountAmount, voucher.maxDiscount)
    }

    discountAmount = Math.max(0, round2(discountAmount))
    return { discountAmount, itemDiscountMap: {}, qualifies: true, reason: null }
  }

  // ── PER_ITEM ──────────────────────────────────────────────────────────────
  const applicableIds = new Set(voucher.productIds)

  for (const item of lineItems) {
    const applies = applicableIds.size === 0 || applicableIds.has(item.productId)
    if (!applies) continue

    let itemDiscount =
      voucher.type === 'PERCENTAGE'
        ? round2(item.lineTotal * (voucher.value / 100))
        : round2(voucher.value * item.quantity)

    itemDiscount = Math.min(itemDiscount, item.lineTotal)
    itemDiscount = Math.max(0, round2(itemDiscount))

    if (itemDiscount > 0) {
      itemDiscountMap[item.productId] = round2(
        (itemDiscountMap[item.productId] ?? 0) + itemDiscount,
      )
      discountAmount += itemDiscount
    }
  }

  discountAmount = round2(discountAmount)

  // Cap global (maxDiscount)
  if (voucher.maxDiscount !== null && discountAmount > voucher.maxDiscount) {
    const ratio = voucher.maxDiscount / discountAmount
    for (const pid of Object.keys(itemDiscountMap)) {
      itemDiscountMap[pid] = round2((itemDiscountMap[pid] ?? 0) * ratio)
    }
    discountAmount = round2(voucher.maxDiscount)
  }

  return { discountAmount, itemDiscountMap, qualifies: true, reason: null }
}

/**
 * Dari daftar voucher auto-apply, pilih satu yang memberikan diskon terbesar
 * setelah memvalidasi semua syarat.
 *
 * Strategi: best-value (bukan first-match).
 * Jika nilai sama, gunakan priority lebih tinggi sebagai tiebreaker.
 */
export function pickBestAutoApplyVoucher(
  vouchers: VoucherDef[],
  lineItems: LineItemForVoucher[],
  subtotal: number,
  opts: { usageByCustomer?: Record<string, number> } = {},
): { voucher: VoucherDef; result: VoucherComputeResult } | null {
  let best: { voucher: VoucherDef; result: VoucherComputeResult } | null = null

  for (const vch of vouchers) {
    const usage = opts.usageByCustomer?.[vch.id]
    const { valid } = validateVoucherEligibility(vch, { subtotal, usageByCustomer: usage })
    if (!valid) continue

    const result = computeVoucherDiscount(lineItems, subtotal, vch)
    if (!result.qualifies) continue

    if (
      !best ||
      result.discountAmount > best.result.discountAmount ||
      (result.discountAmount === best.result.discountAmount && vch.priority > best.voucher.priority)
    ) {
      best = { voucher: vch, result }
    }
  }

  return best
}
