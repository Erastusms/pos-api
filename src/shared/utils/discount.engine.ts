/**
 * Discount Engine — pusat kalkulasi diskon.
 *
 * Mendukung 4 kombinasi:
 *   PERCENTAGE  × PER_BILL  → potong % dari subtotal
 *   PERCENTAGE  × PER_ITEM  → potong % dari lineTotal tiap produk yang berlaku
 *   FIXED_AMOUNT × PER_BILL  → potong nominal dari subtotal
 *   FIXED_AMOUNT × PER_ITEM  → potong nominal per unit dari setiap item yang berlaku
 *
 * Guards:
 *   - minPurchase : diskon hanya berlaku jika subtotal ≥ minPurchase
 *   - maxDiscount : cap jumlah diskon maksimal (untuk tipe PERCENTAGE)
 *   - Diskon tidak boleh melebihi subtotal (floor 0)
 */

import { round2 } from './tax.engine'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiscountType  = 'PERCENTAGE' | 'FIXED_AMOUNT'
export type DiscountScope = 'PER_ITEM'   | 'PER_BILL'

export type DiscountDef = {
  id:          string
  name:        string
  code:        string | null
  type:        DiscountType
  scope:       DiscountScope
  value:       number   // persen (0-100) atau nominal (Rp)
  minPurchase: number | null
  maxDiscount: number | null
  productIds:  string[] // kosong = semua produk (untuk PER_ITEM)
}

export type LineItemForDiscount = {
  productId: string
  lineTotal: number
  quantity:  number
}

export type DiscountResult = {
  discountAmount:       number
  /** Map productId → potongan diskon pada item itu (untuk PER_ITEM) */
  itemDiscountMap:      Record<string, number>
  /** Apakah syarat minPurchase terpenuhi */
  qualifies:            boolean
  /** Pesan jika tidak qualify */
  reason:               string | null
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Hitung jumlah diskon berdasarkan definisi diskon dan item-item di cart.
 *
 * @param lineItems - enriched line items dari cart (setelah modifier ditambahkan)
 * @param subtotal  - total sebelum diskon
 * @param discount  - definisi diskon (null → tidak ada diskon)
 */
export function computeDiscount(
  lineItems: LineItemForDiscount[],
  subtotal:  number,
  discount:  DiscountDef | null,
): DiscountResult {
  if (!discount) {
    return { discountAmount: 0, itemDiscountMap: {}, qualifies: true, reason: null }
  }

  // ── Guard: minPurchase ──────────────────────────────────────────────────────
  if (discount.minPurchase !== null && subtotal < discount.minPurchase) {
    return {
      discountAmount:  0,
      itemDiscountMap: {},
      qualifies:       false,
      reason:          `Minimum pembelian Rp ${discount.minPurchase.toLocaleString('id-ID')} belum terpenuhi`,
    }
  }

  let discountAmount = 0
  const itemDiscountMap: Record<string, number> = {}

  // ── PER_BILL ────────────────────────────────────────────────────────────────
  if (discount.scope === 'PER_BILL') {
    if (discount.type === 'PERCENTAGE') {
      discountAmount = round2(subtotal * (discount.value / 100))
    } else {
      discountAmount = discount.value
    }

    // Apply cap (maxDiscount)
    if (discount.maxDiscount !== null) {
      discountAmount = Math.min(discountAmount, discount.maxDiscount)
    }

    // Floor 0
    discountAmount = Math.max(0, round2(discountAmount))
    return { discountAmount, itemDiscountMap: {}, qualifies: true, reason: null }
  }

  // ── PER_ITEM ────────────────────────────────────────────────────────────────
  // productIds kosong = berlaku untuk semua produk
  const applicableIds = new Set(discount.productIds)

  for (const item of lineItems) {
    const applies = applicableIds.size === 0 || applicableIds.has(item.productId)
    if (!applies) continue

    let itemDiscount = 0
    if (discount.type === 'PERCENTAGE') {
      itemDiscount = round2(item.lineTotal * (discount.value / 100))
    } else {
      // FIXED_AMOUNT per item: potongan nominal × quantity
      itemDiscount = round2(discount.value * item.quantity)
    }

    // Cap per-item sesuai lineTotalnya (tidak boleh lebih dari harga item)
    itemDiscount = Math.min(itemDiscount, item.lineTotal)
    itemDiscount = Math.max(0, round2(itemDiscount))

    if (itemDiscount > 0) {
      itemDiscountMap[item.productId] = (itemDiscountMap[item.productId] ?? 0) + itemDiscount
      discountAmount += itemDiscount
    }
  }

  discountAmount = round2(discountAmount)

  // Apply global cap (maxDiscount)
  if (discount.maxDiscount !== null && discountAmount > discount.maxDiscount) {
    const ratio = discount.maxDiscount / discountAmount
    for (const pid of Object.keys(itemDiscountMap)) {
      itemDiscountMap[pid] = round2((itemDiscountMap[pid] ?? 0) * ratio)
    }
    discountAmount = round2(discount.maxDiscount)
  }

  return { discountAmount, itemDiscountMap, qualifies: true, reason: null }
}
