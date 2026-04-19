/**
 * Receipt PDF Generator.
 *
 * Menggunakan PDFKit untuk generate struk thermal-style dalam format A5 portrait.
 *
 * Layout struk:
 *   Nama Outlet
 *   Alamat & Telpon
 *   NPWP (jika ada)
 *   ─────────────────
 *   No. Order  : TRX-XXX
 *   Tanggal    : DD/MM/YYYY HH:mm
 *   Kasir      : Nama Kasir
 *   ─────────────────
 *   Nama Produk (variant)       Qty × Harga
 *     └ Modifier                       +Harga
 *   ...
 *   ─────────────────
 *   Subtotal              Rp xxx
 *   Diskon (CODE 10%)    -Rp xxx
 *   Service Charge        Rp xxx
 *   PPN (11%)             Rp xxx
 *   Pembulatan            Rp xxx
 *   ═════════════════
 *   TOTAL                 Rp xxx
 *   ─────────────────
 *   [footer text]
 */

import PDFDocument from 'pdfkit'
import path from 'path'
import fs from 'fs'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptModifier {
  name:  string
  price: number
}

export interface ReceiptItem {
  productName:        string
  variantName:        string | null
  quantity:           number
  unitPrice:          number
  lineTotal:          number
  itemDiscountAmount: number
  modifiers:          ReceiptModifier[]
}

export interface ReceiptOutlet {
  name:           string
  address:        string | null
  phone:          string | null
  taxNumber:      string | null
  receiptFooter:  string | null
  receiptLogoUrl: string | null
  taxName:        string
  currency:       string
  timezone:       string
}

export interface ReceiptFinancial {
  subtotal:            number
  discountAmount:      number
  discountedSubtotal:  number
  serviceChargeAmount: number
  taxAmount:           number
  roundingAmount:      number
  total:               number
}

export interface ReceiptDiscount {
  name:  string | null
  code:  string | null
  type:  string | null
  value: number | null
}

export interface ReceiptData {
  orderNumber: string
  createdAt:   Date
  cashierName: string
  outlet:      ReceiptOutlet
  items:       ReceiptItem[]
  financial:   ReceiptFinancial
  discount:    ReceiptDiscount | null
  paidAt:      Date | null
  status:      string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RECEIPT_DIR = path.resolve('uploads', 'receipts')

function ensureReceiptDir(): void {
  if (!fs.existsSync(RECEIPT_DIR)) {
    fs.mkdirSync(RECEIPT_DIR, { recursive: true })
  }
}

/** Format angka ke rupiah: 75000 → "Rp 75.000" */
function formatRp(amount: number, currency = 'IDR'): string {
  if (currency === 'IDR') {
    return `Rp ${Math.abs(amount).toLocaleString('id-ID')}`
  }
  return `${currency} ${Math.abs(amount).toFixed(2)}`
}

/** Format tanggal ke DD/MM/YYYY HH:mm */
function formatDate(d: Date, timezone: string): string {
  try {
    return d.toLocaleString('id-ID', {
      timeZone: timezone,
      day:      '2-digit',
      month:    '2-digit',
      year:     'numeric',
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    })
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ')
  }
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate PDF receipt dan simpan ke disk.
 * @returns Path relatif (public URL segment) dari file PDF
 */
export async function generateReceiptPdf(
  data:     ReceiptData,
  filename: string,
): Promise<string> {
  ensureReceiptDir()

  const outputPath = path.join(RECEIPT_DIR, filename)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size:    'A5',
      margins: { top: 30, bottom: 30, left: 40, right: 40 },
    })

    const writeStream = fs.createWriteStream(outputPath)
    doc.pipe(writeStream)

    const PAGE_WIDTH = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const CW         = 72  // lebar kolom kanan (harga)
    const LW         = PAGE_WIDTH - CW

    const { outlet, financial } = data
    const currency              = outlet.currency

    const infoLeft  = doc.page.margins.left
    const infoRight = doc.page.margins.left + PAGE_WIDTH

    // ── Header outlet ──────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(14).text(outlet.name, { align: 'center' })

    if (outlet.address) {
      doc.font('Helvetica').fontSize(8).text(outlet.address, { align: 'center' })
    }
    if (outlet.phone) {
      doc.fontSize(8).text(`Tel: ${outlet.phone}`, { align: 'center' })
    }
    if (outlet.taxNumber) {
      doc.fontSize(8).text(`NPWP: ${outlet.taxNumber}`, { align: 'center' })
    }

    // ── Separator ──────────────────────────────────────────────────────────
    const drawLine = (color = '#000000') => {
      doc.moveDown(0.4)
        .strokeColor(color).lineWidth(0.5)
        .moveTo(infoLeft, doc.y).lineTo(infoRight, doc.y)
        .stroke().strokeColor('#000000')
      doc.moveDown(0.3)
    }

    drawLine()

    // ── Info order ─────────────────────────────────────────────────────────
    const infoRow = (label: string, value: string) => {
      const y = doc.y
      doc.font('Helvetica').fontSize(8).text(label, infoLeft, y)
      doc.text(value, infoLeft, y, { align: 'right', width: PAGE_WIDTH })
      doc.moveDown(0.2)
    }

    infoRow('No. Order', data.orderNumber)
    infoRow('Tanggal',   formatDate(data.createdAt, outlet.timezone))
    infoRow('Kasir',     data.cashierName)
    if (data.paidAt) {
      infoRow('Dibayar', formatDate(data.paidAt, outlet.timezone))
    }

    drawLine()

    // ── Column header ──────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(8)
    doc.text('Item', infoLeft, doc.y, { lineBreak: false })
    doc.text('Jumlah', infoLeft, doc.y, { align: 'right', width: PAGE_WIDTH })
    doc.moveDown(0.3)
    drawLine('#888888')

    // ── Items ──────────────────────────────────────────────────────────────
    for (const item of data.items) {
      const displayName = item.variantName
        ? `${item.productName} (${item.variantName})`
        : item.productName

      doc.font('Helvetica-Bold').fontSize(8).text(displayName, infoLeft, doc.y)
      doc.moveDown(0.1)

      const qtyPrice  = `${item.quantity} × ${formatRp(item.unitPrice, currency)}`
      const totalStr  = formatRp(item.lineTotal, currency)
      const y         = doc.y

      doc.font('Helvetica').fontSize(8)
        .text(qtyPrice, infoLeft, y, { lineBreak: false, width: LW })
        .text(totalStr, infoLeft, y, { align: 'right', width: PAGE_WIDTH })
      doc.moveDown(0.2)

      // Modifiers
      for (const mod of item.modifiers) {
        if (Number(mod.price) === 0) continue
        const my = doc.y
        doc.font('Helvetica').fontSize(7)
          .text(`  + ${mod.name}`, infoLeft, my, { lineBreak: false, width: LW })
          .text(formatRp(mod.price, currency), infoLeft, my, { align: 'right', width: PAGE_WIDTH })
        doc.moveDown(0.2)
      }

      // Per-item discount
      if (item.itemDiscountAmount > 0) {
        const dy = doc.y
        doc.font('Helvetica').fontSize(7).fillColor('#cc0000')
          .text('  Diskon item', infoLeft, dy, { lineBreak: false, width: LW })
          .text(`-${formatRp(item.itemDiscountAmount, currency)}`, infoLeft, dy, { align: 'right', width: PAGE_WIDTH })
          .fillColor('#000000')
        doc.moveDown(0.2)
      }
    }

    drawLine('#888888')

    // ── Financial summary ──────────────────────────────────────────────────
    const summaryRow = (label: string, value: string, bold = false, color = '#000000') => {
      const y = doc.y
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(color)
        .text(label, infoLeft, y)
        .text(value, infoLeft, y, { align: 'right', width: PAGE_WIDTH })
        .fillColor('#000000')
      doc.moveDown(0.2)
    }

    summaryRow('Subtotal', formatRp(financial.subtotal, currency))

    if (financial.discountAmount > 0 && data.discount) {
      const label = data.discount.code ? `Diskon (${data.discount.code})` : 'Diskon'
      summaryRow(label, `-${formatRp(financial.discountAmount, currency)}`, false, '#cc0000')
    }

    if (financial.serviceChargeAmount > 0) {
      summaryRow('Service Charge', formatRp(financial.serviceChargeAmount, currency))
    }

    if (financial.taxAmount > 0) {
      summaryRow(outlet.taxName, formatRp(financial.taxAmount, currency))
    }

    if (financial.roundingAmount !== 0) {
      const label = financial.roundingAmount > 0 ? 'Pembulatan (+)' : 'Pembulatan (-)'
      summaryRow(label, formatRp(financial.roundingAmount, currency))
    }

    // ── Total (double line) ────────────────────────────────────────────────
    doc.moveDown(0.2)
    doc.moveTo(infoLeft, doc.y).lineTo(infoRight, doc.y).lineWidth(1.5).stroke().lineWidth(0.5)
    doc.moveDown(0.15)
    doc.moveTo(infoLeft, doc.y).lineTo(infoRight, doc.y).stroke()
    doc.moveDown(0.3)
    summaryRow('TOTAL', formatRp(financial.total, currency), true)

    // ── VOID badge ─────────────────────────────────────────────────────────
    if (data.status === 'VOID') {
      doc.moveDown(0.5)
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#cc0000')
        .text('★ VOID ★', { align: 'center' }).fillColor('#000000')
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    if (outlet.receiptFooter) {
      doc.moveDown(0.8)
      doc.moveTo(infoLeft, doc.y).lineTo(infoRight, doc.y).strokeColor('#888888').stroke().strokeColor('#000000')
      doc.moveDown(0.5)
      doc.font('Helvetica').fontSize(8).text(outlet.receiptFooter, { align: 'center' })
    }

    doc.moveDown(0.8)
    doc.font('Helvetica').fontSize(6).fillColor('#888888')
      .text(`Dicetak: ${new Date().toISOString()}`, { align: 'center' })

    doc.end()

    writeStream.on('finish', () => resolve(`/uploads/receipts/${filename}`))
    writeStream.on('error', reject)
    doc.on('error', reject)
  })
}
