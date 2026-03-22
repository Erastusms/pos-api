import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ─── Roles ───────────────────────────────────────────────────────────────────

const ROLES = [
  { id: 1, name: 'SUPER_ADMIN', displayName: 'Super Admin', description: 'Akses penuh ke seluruh sistem' },
  { id: 2, name: 'OWNER',       displayName: 'Owner',       description: 'Pemilik bisnis, akses penuh ke outlet yang dimiliki' },
  { id: 3, name: 'MANAGER',     displayName: 'Manager',     description: 'Manajer outlet, akses operasional penuh' },
  { id: 4, name: 'CASHIER',     displayName: 'Kasir',       description: 'Staf kasir, hanya akses transaksi' },
]

// ─── Permissions ─────────────────────────────────────────────────────────────

const PERMISSIONS = [
  // User
  { resource: 'user', action: 'create' }, { resource: 'user', action: 'read' },
  { resource: 'user', action: 'update' }, { resource: 'user', action: 'delete' },
  // Outlet
  { resource: 'outlet', action: 'create' }, { resource: 'outlet', action: 'read' },
  { resource: 'outlet', action: 'update' }, { resource: 'outlet', action: 'delete' },
  // Category
  { resource: 'category', action: 'create' }, { resource: 'category', action: 'read' },
  { resource: 'category', action: 'update' }, { resource: 'category', action: 'delete' },
  // Product
  { resource: 'product', action: 'create' }, { resource: 'product', action: 'read' },
  { resource: 'product', action: 'update' }, { resource: 'product', action: 'delete' },
  // Inventory
  { resource: 'inventory', action: 'create' }, { resource: 'inventory', action: 'read' },
  { resource: 'inventory', action: 'update' },
  // Transaction
  { resource: 'transaction', action: 'create' }, { resource: 'transaction', action: 'read' },
  { resource: 'transaction', action: 'void' },
  // Customer
  { resource: 'customer', action: 'create' }, { resource: 'customer', action: 'read' },
  { resource: 'customer', action: 'update' }, { resource: 'customer', action: 'delete' },
  // Employee
  { resource: 'employee', action: 'create' }, { resource: 'employee', action: 'read' },
  { resource: 'employee', action: 'update' }, { resource: 'employee', action: 'delete' },
  // Discount
  { resource: 'discount', action: 'create' }, { resource: 'discount', action: 'read' },
  { resource: 'discount', action: 'update' }, { resource: 'discount', action: 'delete' },
  // Report
  { resource: 'report', action: 'read' }, { resource: 'report', action: 'export' },
]

type PermRef = { resource: string; action: string }
const all = PERMISSIONS as PermRef[]

const ROLE_PERMISSIONS: Record<string, PermRef[]> = {
  SUPER_ADMIN: all,
  OWNER: all,
  MANAGER: [
    { resource: 'category',    action: 'create' }, { resource: 'category',    action: 'read'   },
    { resource: 'category',    action: 'update' }, { resource: 'category',    action: 'delete' },
    { resource: 'product',     action: 'create' }, { resource: 'product',     action: 'read'   },
    { resource: 'product',     action: 'update' },
    { resource: 'inventory',   action: 'create' }, { resource: 'inventory',   action: 'read'   },
    { resource: 'inventory',   action: 'update' },
    { resource: 'transaction', action: 'create' }, { resource: 'transaction', action: 'read'   },
    { resource: 'transaction', action: 'void'   },
    { resource: 'customer',    action: 'create' }, { resource: 'customer',    action: 'read'   },
    { resource: 'customer',    action: 'update' },
    { resource: 'employee',    action: 'read'   },
    { resource: 'discount',    action: 'create' }, { resource: 'discount',    action: 'read'   },
    { resource: 'discount',    action: 'update' },
    { resource: 'report',      action: 'read'   }, { resource: 'report',      action: 'export' },
  ],
  CASHIER: [
    { resource: 'category',    action: 'read'   },
    { resource: 'product',     action: 'read'   },
    { resource: 'inventory',   action: 'read'   },
    { resource: 'transaction', action: 'create' }, { resource: 'transaction', action: 'read' },
    { resource: 'customer',    action: 'create' }, { resource: 'customer',    action: 'read'  },
    { resource: 'discount',    action: 'read'   },
  ],
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.info('🌱 Starting database seed...\n')

  // 1. Roles
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: { displayName: role.displayName, description: role.description },
      create: role,
    })
  }
  console.info(`✅ Roles seeded: ${ROLES.map((r) => r.name).join(', ')}`)

  // 2. Permissions
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { resource_action: { resource: perm.resource, action: perm.action } },
      update: {},
      create: perm,
    })
  }
  console.info(`✅ Permissions seeded: ${PERMISSIONS.length} permissions`)

  // 3. Role → Permission mapping
  const dbPerms = await prisma.permission.findMany()
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } })
    if (!role) continue
    let count = 0
    for (const perm of perms) {
      const dbPerm = dbPerms.find((p) => p.resource === perm.resource && p.action === perm.action)
      if (!dbPerm) continue
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: dbPerm.id } },
        update: {},
        create: { roleId: role.id, permissionId: dbPerm.id },
      })
      count++
    }
    console.info(`   ${roleName}: ${count} permissions`)
  }
  console.info('✅ Role permissions seeded')

  // 4. Default outlet
  const outlet = await prisma.outlet.upsert({
    where: { id: 'default-outlet-001' },
    update: {},
    create: {
      id: 'default-outlet-001',
      name: 'Outlet Utama',
      address: 'Jl. Sudirman No. 1, Jakarta Pusat',
      phone: '021-12345678',
      email: 'outlet@pos.com',
      isActive: true,
    },
  })
  console.info(`✅ Outlet: "${outlet.name}"`)

  // 5. Users
  const adminPw = await bcrypt.hash('Admin@123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@pos.com' },
    update: {},
    create: { name: 'Super Admin', email: 'admin@pos.com', password: adminPw, roleId: 1, outletId: outlet.id },
  })
  const ownerPw = await bcrypt.hash('Owner@123', 12)
  await prisma.user.upsert({
    where: { email: 'owner@pos.com' },
    update: {},
    create: { name: 'Demo Owner', email: 'owner@pos.com', password: ownerPw, roleId: 2, outletId: outlet.id },
  })
  console.info(`✅ Users seeded: admin@pos.com, owner@pos.com`)

  // ─── Phase 2: Categories ──────────────────────────────────────────────────

  // Root categories (global — outletId null)
  const catMakanan = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'makanan', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Makanan', slug: 'makanan', description: 'Semua produk makanan',
      outletId: outlet.id, sortOrder: 1,
    },
  })
  const catMinuman = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'minuman', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Minuman', slug: 'minuman', description: 'Semua produk minuman',
      outletId: outlet.id, sortOrder: 2,
    },
  })
  const catSnack = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'snack', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Snack & Cemilan', slug: 'snack', description: 'Camilan dan makanan ringan',
      outletId: outlet.id, sortOrder: 3,
    },
  })

  // Sub-categories (nested under Makanan)
  const catNasiMie = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'nasi-mie', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Nasi & Mie', slug: 'nasi-mie', parentId: catMakanan.id,
      outletId: outlet.id, sortOrder: 1,
    },
  })
  const catRoti = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'roti-kue', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Roti & Kue', slug: 'roti-kue', parentId: catMakanan.id,
      outletId: outlet.id, sortOrder: 2,
    },
  })

  // Sub-categories (nested under Minuman)
  const catKopi = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'kopi', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Kopi', slug: 'kopi', parentId: catMinuman.id,
      outletId: outlet.id, sortOrder: 1,
    },
  })
  const catJus = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'jus-minuman-segar', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Jus & Minuman Segar', slug: 'jus-minuman-segar', parentId: catMinuman.id,
      outletId: outlet.id, sortOrder: 2,
    },
  })
  console.info(`✅ Categories seeded: Makanan, Minuman, Snack (+ 4 sub-kategori)`)

  // ─── Phase 2: Sample Products ─────────────────────────────────────────────

  const productsData = [
    { name: 'Nasi Goreng Spesial', sku: 'MKN-001', categoryId: catNasiMie.id },
    { name: 'Mie Ayam Bakso',      sku: 'MKN-002', categoryId: catNasiMie.id },
    { name: 'Roti Bakar Coklat',   sku: 'MKN-003', categoryId: catRoti.id    },
    { name: 'Es Kopi Susu',        sku: 'MNM-001', categoryId: catKopi.id    },
    { name: 'Americano',           sku: 'MNM-002', categoryId: catKopi.id    },
    { name: 'Jus Alpukat',         sku: 'MNM-003', categoryId: catJus.id     },
    { name: 'Keripik Kentang',     sku: 'SNK-001', categoryId: catSnack.id   },
  ]

  const createdProducts: Record<string, string> = {}
  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { sku_outletId: { sku: p.sku, outletId: outlet.id } },
      update: {},
      create: { ...p, outletId: outlet.id, isActive: true },
    })
    createdProducts[p.sku] = product.id
  }
  console.info(`✅ Products seeded: ${productsData.length} produk`)

  // ─── Phase 2: Initial Inventory ──────────────────────────────────────────

  // Initial stock data: [sku, quantity, costPerUnit, unit]
  const initialStocks: Array<[string, number, number, string]> = [
    ['MKN-001', 100, 15000,  'porsi'],
    ['MKN-002', 80,  12000,  'porsi'],
    ['MKN-003', 50,  8000,   'buah' ],
    ['MNM-001', 200, 5000,   'gelas'],
    ['MNM-002', 150, 4000,   'gelas'],
    ['MNM-003', 120, 6000,   'gelas'],
    ['SNK-001', 300, 3500,   'bungkus'],
  ]

  for (const [sku, qty, cost, unit] of initialStocks) {
    const productId = createdProducts[sku]
    if (!productId) continue

    // Buat InventoryItem jika belum ada
    const item = await prisma.inventoryItem.upsert({
      where: { productId },
      update: { quantity: qty, unit },
      create: { productId, outletId: outlet.id, quantity: qty, unit },
    })

    // Buat cost layer awal
    await prisma.inventoryCostLayer.upsert({
      where: { id: `seed-layer-${sku}` },
      update: {},
      create: {
        id: `seed-layer-${sku}`,
        inventoryItemId: item.id,
        quantityIn: qty,
        quantityLeft: qty,
        costPerUnit: cost,
      },
    })

    // Catat adjustment INITIAL
    await prisma.inventoryAdjustment.upsert({
      where: { id: `seed-adj-${sku}` },
      update: {},
      create: {
        id: `seed-adj-${sku}`,
        inventoryItemId: item.id,
        type: 'INITIAL',
        quantity: qty,
        quantityBefore: 0,
        quantityAfter: qty,
        costPerUnit: cost,
        totalCost: qty * cost,
        notes: 'Stok awal dari seed',
        userId: admin.id,
      },
    })
  }
  console.info(`✅ Inventory seeded: ${initialStocks.length} produk dengan stok awal`)

  console.info('\n🎉 Seed completed!\n')
  console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.info('  Super Admin : admin@pos.com  / Admin@123')
  console.info('  Owner       : owner@pos.com  / Owner@123')
  console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
