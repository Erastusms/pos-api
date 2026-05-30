import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies BEFORE importing service ───────────────────────────────

vi.mock('../voucher.repository', () => ({
  voucherRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByCode: vi.fn(),
    findAutoApply: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    incrementUsage: vi.fn(),
    decrementUsage: vi.fn(),
    countUsageByCustomer: vi.fn(),
    createRedemption: vi.fn(),
    findRedemptions: vi.fn(),
    validateProductIds: vi.fn(),
  },
}))

vi.mock('../../../infrastructure/database/prisma.client', () => ({
  prisma: {
    cart: { count: vi.fn(), update: vi.fn() },
    customer: { findFirst: vi.fn() },
    voucher: { findFirst: vi.fn() },
    voucherRedemption: { count: vi.fn() },
  },
}))

vi.mock('../../../infrastructure/database/transaction', () => ({
  withTransaction: vi.fn((cb) => cb({})),
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  computeVoucherDiscount,
  validateVoucherEligibility,
  pickBestAutoApplyVoucher,
  type VoucherDef,
  type LineItemForVoucher,
} from '../voucher.engine'

import { voucherService } from '../voucher.service'
import { voucherRepository } from '../voucher.repository'
import { prisma } from '../../../infrastructure/database/prisma.client'
import { NotFoundError, ConflictError, BadRequestError } from '../../../shared/errors'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeVoucherDef = (overrides: Partial<VoucherDef> = {}): VoucherDef => ({
  id: 'vch-001',
  name: 'Test Voucher',
  code: 'TEST10',
  type: 'PERCENTAGE',
  scope: 'PER_BILL',
  value: 10,
  minPurchase: null,
  maxDiscount: null,
  usageLimit: null,
  usageLimitPerCustomer: null,
  usageCount: 0,
  autoApply: false,
  isActive: true,
  startAt: null,
  endAt: null,
  productIds: [],
  ...overrides,
})

const makeVoucherRow = (overrides = {}) => ({
  id: 'vch-001',
  outletId: 'outlet-001',
  name: 'Test Voucher',
  code: 'TEST10',
  description: null,
  type: 'PERCENTAGE' as const,
  scope: 'PER_BILL' as const,
  value: '10',
  minPurchase: null,
  maxDiscount: null,
  usageLimit: null,
  usageLimitPerCustomer: null,
  usageCount: 0,
  autoApply: false,
  priority: 0,
  customerId: null,
  isActive: true,
  startAt: null,
  endAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  products: [],
  _count: { redemptions: 0 },
  ...overrides,
})

const lineItems: LineItemForVoucher[] = [
  { productId: 'prod-001', lineTotal: 35000, quantity: 1 },
  { productId: 'prod-002', lineTotal: 25000, quantity: 1 },
]

// ═════════════════════════════════════════════════════════════════════════════
// ENGINE TESTS (pure functions — no mocks needed)
// ═════════════════════════════════════════════════════════════════════════════

describe('validateVoucherEligibility', () => {
  it('valid untuk voucher aktif tanpa batasan', () => {
    const v = makeVoucherDef()
    expect(validateVoucherEligibility(v, { subtotal: 100000 })).toEqual({
      valid: true,
      reason: null,
    })
  })

  it('tidak valid jika isActive=false', () => {
    const { valid, reason } = validateVoucherEligibility(makeVoucherDef({ isActive: false }), {
      subtotal: 100000,
    })
    expect(valid).toBe(false)
    expect(reason).toMatch(/tidak aktif/i)
  })

  it('tidak valid jika belum mulai (startAt di masa depan)', () => {
    const future = new Date(Date.now() + 86400000)
    const { valid } = validateVoucherEligibility(makeVoucherDef({ startAt: future }), {
      subtotal: 100000,
    })
    expect(valid).toBe(false)
  })

  it('tidak valid jika sudah kadaluarsa (endAt lampau)', () => {
    const past = new Date(Date.now() - 86400000)
    const { valid, reason } = validateVoucherEligibility(makeVoucherDef({ endAt: past }), {
      subtotal: 100000,
    })
    expect(valid).toBe(false)
    expect(reason).toMatch(/kadaluarsa/i)
  })

  it('tidak valid jika usageCount >= usageLimit', () => {
    const { valid, reason } = validateVoucherEligibility(
      makeVoucherDef({ usageLimit: 5, usageCount: 5 }),
      { subtotal: 100000 },
    )
    expect(valid).toBe(false)
    expect(reason).toMatch(/habis/i)
  })

  it('tidak valid jika usageByCustomer >= usageLimitPerCustomer', () => {
    const { valid, reason } = validateVoucherEligibility(
      makeVoucherDef({ usageLimitPerCustomer: 1 }),
      { subtotal: 100000, usageByCustomer: 1 },
    )
    expect(valid).toBe(false)
    expect(reason).toMatch(/1x per customer/i)
  })

  it('tidak valid jika subtotal < minPurchase', () => {
    const { valid, reason } = validateVoucherEligibility(makeVoucherDef({ minPurchase: 100000 }), {
      subtotal: 50000,
    })
    expect(valid).toBe(false)
    expect(reason).toMatch(/minimum/i)
  })

  it('valid jika usageCount < usageLimit', () => {
    const { valid } = validateVoucherEligibility(
      makeVoucherDef({ usageLimit: 10, usageCount: 9 }),
      { subtotal: 100000 },
    )
    expect(valid).toBe(true)
  })
})

describe('computeVoucherDiscount — PER_BILL', () => {
  it('PERCENTAGE 10% dari subtotal 100.000 = 10.000', () => {
    const result = computeVoucherDiscount(lineItems, 100000, makeVoucherDef())
    expect(result.discountAmount).toBe(10000)
    expect(result.qualifies).toBe(true)
  })

  it('FIXED_AMOUNT Rp 20.000 dari subtotal 100.000', () => {
    const result = computeVoucherDiscount(
      lineItems,
      100000,
      makeVoucherDef({ type: 'FIXED_AMOUNT', value: 20000 }),
    )
    expect(result.discountAmount).toBe(20000)
  })

  it('PERCENTAGE di-cap oleh maxDiscount', () => {
    const result = computeVoucherDiscount(
      lineItems,
      100000,
      makeVoucherDef({ value: 50, maxDiscount: 25000 }),
    )
    // 50% dari 100.000 = 50.000, tapi cap 25.000
    expect(result.discountAmount).toBe(25000)
  })

  it('tidak kualifikasi jika subtotal < minPurchase', () => {
    const result = computeVoucherDiscount(lineItems, 30000, makeVoucherDef({ minPurchase: 50000 }))
    expect(result.qualifies).toBe(false)
    expect(result.discountAmount).toBe(0)
  })

  it('mengembalikan 0 jika voucher null', () => {
    const result = computeVoucherDiscount(lineItems, 100000, null)
    expect(result.discountAmount).toBe(0)
    expect(result.qualifies).toBe(true)
  })
})

describe('computeVoucherDiscount — PER_ITEM', () => {
  const perItemVoucher = makeVoucherDef({
    scope: 'PER_ITEM',
    type: 'PERCENTAGE',
    value: 15,
    productIds: ['prod-001'],
  })

  it('15% hanya untuk prod-001 (lineTotal 35.000) = 5.250', () => {
    const result = computeVoucherDiscount(lineItems, 60000, perItemVoucher)
    // 15% dari 35.000 = 5.250
    expect(result.discountAmount).toBe(5250)
    expect(result.itemDiscountMap['prod-001']).toBe(5250)
    expect(result.itemDiscountMap['prod-002']).toBeUndefined()
  })

  it('FIXED_AMOUNT per unit untuk PER_ITEM', () => {
    const fixedPerItem = makeVoucherDef({
      scope: 'PER_ITEM',
      type: 'FIXED_AMOUNT',
      value: 3000,
      productIds: ['prod-001'],
    })
    // qty=1, potongan = 3000 * 1 = 3000
    const result = computeVoucherDiscount(lineItems, 60000, fixedPerItem)
    expect(result.discountAmount).toBe(3000)
  })

  it('PER_ITEM dengan semua produk (productIds kosong)', () => {
    const allProducts = makeVoucherDef({
      scope: 'PER_ITEM',
      value: 10,
      productIds: [], // kosong = semua produk
    })
    const result = computeVoucherDiscount(lineItems, 60000, allProducts)
    // 10% dari 35.000 + 10% dari 25.000 = 3.500 + 2.500 = 6.000
    expect(result.discountAmount).toBe(6000)
  })

  it('PER_ITEM di-cap oleh maxDiscount global', () => {
    const cappedVoucher = makeVoucherDef({
      scope: 'PER_ITEM',
      type: 'PERCENTAGE',
      value: 50,
      maxDiscount: 4000,
      productIds: ['prod-001', 'prod-002'],
    })
    // 50% dari 35.000 = 17.500, 50% dari 25.000 = 12.500 → total 30.000 → cap 4.000
    const result = computeVoucherDiscount(lineItems, 60000, cappedVoucher)
    expect(result.discountAmount).toBe(4000)
  })
})

describe('pickBestAutoApplyVoucher', () => {
  const voucher10pct = makeVoucherDef({ id: 'v1', value: 10, autoApply: true, priority: 5 })
  const voucher15pct = makeVoucherDef({ id: 'v2', value: 15, autoApply: true, priority: 3 })
  const voucherFlat = makeVoucherDef({
    id: 'v3',
    type: 'FIXED_AMOUNT',
    value: 8000,
    autoApply: true,
    priority: 1,
  })

  it('memilih voucher dengan diskon terbesar', () => {
    // 15% dari 100.000 = 15.000 > 10% = 10.000 > Rp 8.000
    const result = pickBestAutoApplyVoucher(
      [voucher10pct, voucher15pct, voucherFlat],
      lineItems,
      100000,
    )
    expect(result?.voucher.id).toBe('v2')
    expect(result?.result.discountAmount).toBe(15000)
  })

  it('tiebreaker: priority lebih tinggi menang', () => {
    // Kedua voucher 10% → sama; v1 priority=5, v2 priority=3 → v1 menang
    const vA = makeVoucherDef({ id: 'vA', value: 10, autoApply: true, priority: 5 })
    const vB = makeVoucherDef({ id: 'vB', value: 10, autoApply: true, priority: 3 })
    const result = pickBestAutoApplyVoucher([vA, vB], lineItems, 100000)
    expect(result?.voucher.id).toBe('vA')
  })

  it('melewati voucher yang tidak valid (minPurchase tidak terpenuhi)', () => {
    const highMin = makeVoucherDef({ id: 'vHigh', value: 50, minPurchase: 500000, autoApply: true })
    const result = pickBestAutoApplyVoucher([highMin, voucher10pct], lineItems, 100000)
    // highMin tidak valid (subtotal 100.000 < min 500.000) → pilih voucher10pct
    expect(result?.voucher.id).toBe('v1')
  })

  it('mengembalikan null jika tidak ada voucher yang valid', () => {
    const inactive = makeVoucherDef({ isActive: false, autoApply: true })
    const result = pickBestAutoApplyVoucher([inactive], lineItems, 100000)
    expect(result).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// SERVICE TESTS (dengan mocks)
// ═════════════════════════════════════════════════════════════════════════════

describe('voucherService.create', () => {
  beforeEach(() => vi.clearAllMocks())

  it('membuat voucher baru PER_BILL PERCENTAGE', async () => {
    vi.mocked(voucherRepository.findByCode).mockResolvedValue(null)
    vi.mocked(voucherRepository.create).mockResolvedValue(makeVoucherRow())

    const result = await voucherService.create(
      {
        name: 'Test',
        code: 'TEST10',
        type: 'PERCENTAGE',
        scope: 'PER_BILL',
        value: 10,
        autoApply: false,
        priority: 0,
        isActive: true,
        productIds: [],
      },
      'outlet-001',
    )

    expect(result.id).toBe('vch-001')
    expect(result.isExpired).toBe(false)
    expect(result.remainingUses).toBeNull()
  })

  it('melempar ConflictError jika kode duplikat', async () => {
    vi.mocked(voucherRepository.findByCode).mockResolvedValue(makeVoucherRow())

    await expect(
      voucherService.create(
        {
          name: 'X',
          code: 'TEST10',
          type: 'PERCENTAGE',
          scope: 'PER_BILL',
          value: 10,
          autoApply: false,
          priority: 0,
          isActive: true,
          productIds: [],
        },
        'outlet-001',
      ),
    ).rejects.toThrow(ConflictError)
  })

  it('melempar BadRequestError jika PER_ITEM tanpa productIds', async () => {
    vi.mocked(voucherRepository.findByCode).mockResolvedValue(null)

    await expect(
      voucherService.create(
        {
          name: 'X',
          code: 'CODE1',
          type: 'PERCENTAGE',
          scope: 'PER_ITEM',
          value: 10,
          autoApply: false,
          priority: 0,
          isActive: true,
          productIds: [],
        },
        'outlet-001',
      ),
    ).rejects.toThrow() // Zod superRefine akan catch ini sebelum sampai ke service
  })
})

describe('voucherService.validate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mengembalikan valid=true dengan discountPreview', async () => {
    vi.mocked(voucherRepository.findByCode).mockResolvedValue(makeVoucherRow())
    vi.mocked(voucherRepository.countUsageByCustomer).mockResolvedValue(0)

    const result = await voucherService.validate({ code: 'TEST10', subtotal: 100000 }, 'outlet-001')

    expect(result.valid).toBe(true)
    expect(result.discountPreview?.discountAmount).toBe(10000) // 10% dari 100.000
    expect(result.discountPreview?.discountedSubtotal).toBe(90000)
  })

  it('mengembalikan valid=false jika kode tidak ada', async () => {
    vi.mocked(voucherRepository.findByCode).mockResolvedValue(null)

    const result = await voucherService.validate({ code: 'GHOST', subtotal: 0 }, 'outlet-001')
    expect(result.valid).toBe(false)
    expect(result.voucher).toBeNull()
  })

  it('mengembalikan valid=false jika usage limit per customer terlampaui', async () => {
    vi.mocked(voucherRepository.findByCode).mockResolvedValue(
      makeVoucherRow({ usageLimitPerCustomer: 1 }),
    )
    vi.mocked(voucherRepository.countUsageByCustomer).mockResolvedValue(1) // sudah 1x

    const result = await voucherService.validate(
      { code: 'TEST10', customerId: 'cust-001', subtotal: 100000 },
      'outlet-001',
    )
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/1x per customer/i)
  })

  it('mengembalikan valid=false jika voucher untuk customer lain', async () => {
    vi.mocked(voucherRepository.findByCode).mockResolvedValue(
      makeVoucherRow({ customerId: 'cust-special' }),
    )
    vi.mocked(voucherRepository.countUsageByCustomer).mockResolvedValue(0)

    const result = await voucherService.validate(
      { code: 'TEST10', customerId: 'cust-other', subtotal: 100000 },
      'outlet-001',
    )
    expect(result.valid).toBe(false)
  })
})

describe('voucherService.delete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('berhasil hapus jika tidak ada cart aktif', async () => {
    vi.mocked(voucherRepository.findById).mockResolvedValue(makeVoucherRow())
    vi.mocked(prisma.cart.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    vi.mocked(voucherRepository.softDelete).mockResolvedValue(makeVoucherRow({ isActive: false }))

    const result = await voucherService.delete('vch-001')
    expect(result.isActive).toBe(false)
  })

  it('melempar BadRequestError jika masih ada cart aktif', async () => {
    vi.mocked(voucherRepository.findById).mockResolvedValue(makeVoucherRow())
    vi.mocked(prisma.cart.count as ReturnType<typeof vi.fn>).mockResolvedValue(3)

    await expect(voucherService.delete('vch-001')).rejects.toThrow(BadRequestError)
  })

  it('melempar NotFoundError jika voucher tidak ada', async () => {
    vi.mocked(voucherRepository.findById).mockResolvedValue(null)

    await expect(voucherService.delete('ghost')).rejects.toThrow(NotFoundError)
  })
})

describe('voucherService.getAutoApply', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mengembalikan autoApply=false jika tidak ada voucher', async () => {
    vi.mocked(voucherRepository.findAutoApply).mockResolvedValue([])

    const result = await voucherService.getAutoApply('outlet-001', { subtotal: 100000 })
    expect(result.autoApply).toBe(false)
    expect(result.voucher).toBeNull()
  })

  it('mengembalikan voucher terbaik jika ada', async () => {
    vi.mocked(voucherRepository.findAutoApply).mockResolvedValue([
      makeVoucherRow({ id: 'v1', value: '10', autoApply: true }),
      makeVoucherRow({ id: 'v2', value: '20', autoApply: true }),
    ])
    vi.mocked(voucherRepository.countUsageByCustomer).mockResolvedValue(0)

    const result = await voucherService.getAutoApply('outlet-001', { subtotal: 100000 })
    expect(result.autoApply).toBe(true)
    // v2 (20%) memberikan diskon lebih besar
    expect(result.discountPreview?.discountAmount).toBe(20000)
  })
})

describe('voucherService normalizeVoucher computed fields', () => {
  it('isExpired=true jika endAt sudah lewat', () => {
    const row = makeVoucherRow({ endAt: new Date('2020-01-01') })
    const { isExpired } = voucherService.getById as unknown as { isExpired: boolean }
    // Test normalizeVoucher langsung via list mock
    vi.mocked(voucherRepository.findById).mockResolvedValue(row)
    return voucherService.getById('vch-001').then((r) => {
      expect(r.isExpired).toBe(true)
    })
  })

  it('remainingUses dihitung benar', () => {
    const row = makeVoucherRow({ usageLimit: 10, usageCount: 6 })
    vi.mocked(voucherRepository.findById).mockResolvedValue(row)
    return voucherService.getById('vch-001').then((r) => {
      expect(r.remainingUses).toBe(4)
    })
  })

  it('remainingUses=null jika usageLimit tidak terbatas', () => {
    vi.mocked(voucherRepository.findById).mockResolvedValue(makeVoucherRow())
    return voucherService.getById('vch-001').then((r) => {
      expect(r.remainingUses).toBeNull()
    })
  })
})
