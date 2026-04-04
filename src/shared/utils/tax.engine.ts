/**
 * Tax Engine — pusat kalkulasi pajak, service charge, dan rounding.
 *
 * Urutan kalkulasi standar POS:
 *   subtotal (sebelum diskon)
 *   → discount
 *   → discountedSubtotal
 *   → service charge  (% dari discountedSubtotal)
 *   → tax / PPN       (% dari discountedSubtotal + service charge)
 *   → rounding        (opsional, sesuai pengaturan outlet)
 *   → total
 *
 * Semua nilai dibulatkan ke 2 desimal (round2) agar tidak ada floating-point drift.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaxSettings = {
  taxRate:       number  // persen, e.g. 11   (bukan 0.11)
  serviceCharge: number  // persen, e.g. 5    (bukan 0.05)
  rounding:      string  // 'NONE' | 'UP' | 'DOWN' | 'NEAREST'
  roundingValue: number  // e.g. 100, 500, 1000
}

/** Tipe yang kompatibel dengan nilai Prisma Decimal (unknown) maupun angka biasa */
export type RawTaxSettings = {
  taxRate:       unknown
  serviceCharge: unknown
  rounding:      string
  roundingValue: number
}

export type TaxResult = {
  serviceChargeAmount: number
  taxAmount:           number
  roundingAmount:      number
  total:               number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Bulatkan ke 2 desimal — mencegah floating-point drift */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Terapkan rounding sesuai pengaturan outlet.
 * @example applyRounding(12_350, 'UP', 500) → 12_500
 */
export function applyRounding(amount: number, mode: string, value: number): number {
  if (!value || mode === 'NONE') return amount
  switch (mode) {
    case 'UP':      return Math.ceil(amount / value) * value
    case 'DOWN':    return Math.floor(amount / value) * value
    case 'NEAREST': return Math.round(amount / value) * value
    default:        return amount
  }
}

/** Normalisasi RawTaxSettings (Prisma Decimal) ke TaxSettings (number) */
export function normalizeTaxSettings(raw: RawTaxSettings | null): TaxSettings | null {
  if (!raw) return null
  return {
    taxRate:       Number(raw.taxRate),
    serviceCharge: Number(raw.serviceCharge),
    rounding:      raw.rounding,
    roundingValue: raw.roundingValue,
  }
}

// ─── Core tax computation ─────────────────────────────────────────────────────

/**
 * Hitung service charge, pajak, rounding, dan total berdasarkan `discountedSubtotal`.
 *
 * @param discountedSubtotal - subtotal setelah diskon diterapkan
 * @param settings           - pengaturan pajak outlet (nullable → semua 0)
 */
export function computeTax(
  discountedSubtotal: number,
  settings: TaxSettings | null,
): TaxResult {
  const scRate  = settings ? settings.serviceCharge / 100 : 0
  const taxRate = settings ? settings.taxRate / 100 : 0

  const serviceChargeAmount = round2(discountedSubtotal * scRate)
  const taxableAmount       = discountedSubtotal + serviceChargeAmount
  const taxAmount           = round2(taxableAmount * taxRate)
  const rawTotal            = taxableAmount + taxAmount

  let roundedTotal = rawTotal
  if (settings && settings.roundingValue > 0) {
    roundedTotal = applyRounding(rawTotal, settings.rounding, settings.roundingValue)
  }

  const roundingAmount = round2(roundedTotal - rawTotal)
  const total          = round2(roundedTotal)

  return { serviceChargeAmount, taxAmount, roundingAmount, total }
}
