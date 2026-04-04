import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ─── Roles ────────────────────────────────────────────────────────────────────

const ROLES = [
  { id: 1, name: 'SUPER_ADMIN', displayName: 'Super Admin', description: 'Akses penuh ke seluruh sistem' },
  { id: 2, name: 'OWNER',       displayName: 'Owner',       description: 'Pemilik bisnis, akses penuh ke outlet yang dimiliki' },
  { id: 3, name: 'MANAGER',     displayName: 'Manager',     description: 'Manajer outlet, akses operasional penuh' },
  { id: 4, name: 'CASHIER',     displayName: 'Kasir',       description: 'Staf kasir, hanya akses transaksi' },
]

// ─── Permissions ──────────────────────────────────────────────────────────────

const PERMISSIONS = [
  { resource: 'user',        action: 'create' }, { resource: 'user',        action: 'read'   },
  { resource: 'user',        action: 'update' }, { resource: 'user',        action: 'delete' },
  { resource: 'outlet',      action: 'create' }, { resource: 'outlet',      action: 'read'   },
  { resource: 'outlet',      action: 'update' }, { resource: 'outlet',      action: 'delete' },
  { resource: 'category',    action: 'create' }, { resource: 'category',    action: 'read'   },
  { resource: 'category',    action: 'update' }, { resource: 'category',    action: 'delete' },
  { resource: 'product',     action: 'create' }, { resource: 'product',     action: 'read'   },
  { resource: 'product',     action: 'update' }, { resource: 'product',     action: 'delete' },
  { resource: 'inventory',   action: 'create' }, { resource: 'inventory',   action: 'read'   },
  { resource: 'inventory',   action: 'update' },
  { resource: 'transaction', action: 'create' }, { resource: 'transaction', action: 'read'   },
  { resource: 'transaction', action: 'void'   },
  { resource: 'customer',    action: 'create' }, { resource: 'customer',    action: 'read'   },
  { resource: 'customer',    action: 'update' }, { resource: 'customer',    action: 'delete' },
  { resource: 'employee',    action: 'create' }, { resource: 'employee',    action: 'read'   },
  { resource: 'employee',    action: 'update' }, { resource: 'employee',    action: 'delete' },
  { resource: 'discount',    action: 'create' }, { resource: 'discount',    action: 'read'   },
  { resource: 'discount',    action: 'update' }, { resource: 'discount',    action: 'delete' },
  { resource: 'report',      action: 'read'   }, { resource: 'report',      action: 'export' },
  { resource: 'supplier',    action: 'create' }, { resource: 'supplier',    action: 'read'   },
  { resource: 'supplier',    action: 'update' }, { resource: 'supplier',    action: 'delete' },
  { resource: 'cart',        action: 'create' }, { resource: 'cart',        action: 'read'   },
  { resource: 'cart',        action: 'update' }, { resource: 'cart',        action: 'delete' },
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
    { resource: 'supplier',    action: 'create' }, { resource: 'supplier',    action: 'read'   },
    { resource: 'supplier',    action: 'update' },
    { resource: 'report',      action: 'read'   }, { resource: 'report',      action: 'export' },
    { resource: 'cart',        action: 'create' }, { resource: 'cart',        action: 'read'   },
    { resource: 'cart',        action: 'update' }, { resource: 'cart',        action: 'delete' },
  ],
  CASHIER: [
    { resource: 'category',    action: 'read'   },
    { resource: 'product',     action: 'read'   },
    { resource: 'inventory',   action: 'read'   },
    { resource: 'transaction', action: 'create' }, { resource: 'transaction', action: 'read' },
    { resource: 'customer',    action: 'create' }, { resource: 'customer',    action: 'read' },
    { resource: 'discount',    action: 'read'   },
    { resource: 'cart',        action: 'create' }, { resource: 'cart',        action: 'read'   },
    { resource: 'cart',        action: 'update' }, { resource: 'cart',        action: 'delete' },
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
  console.info(`✅ Permissions seeded: ${PERMISSIONS.length}`)

  // 3. Role → Permission
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

  // 4. Outlet
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

  // 5. Users (admin & owner)
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
  console.info('✅ Users seeded: admin@pos.com, owner@pos.com')

  // ── Phase 2: Categories ───────────────────────────────────────────────────

  const catMakanan = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'makanan', outletId: outlet.id } },
    update: {},
    create: { name: 'Makanan', slug: 'makanan', description: 'Semua produk makanan', outletId: outlet.id, sortOrder: 1 },
  })
  const catMinuman = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'minuman', outletId: outlet.id } },
    update: {},
    create: { name: 'Minuman', slug: 'minuman', description: 'Semua produk minuman', outletId: outlet.id, sortOrder: 2 },
  })
  const catSnack = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'snack', outletId: outlet.id } },
    update: {},
    create: { name: 'Snack & Cemilan', slug: 'snack', outletId: outlet.id, sortOrder: 3 },
  })
  const catNasiMie = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'nasi-mie', outletId: outlet.id } },
    update: {},
    create: { name: 'Nasi & Mie', slug: 'nasi-mie', parentId: catMakanan.id, outletId: outlet.id, sortOrder: 1 },
  })
  const catRoti = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'roti-kue', outletId: outlet.id } },
    update: {},
    create: { name: 'Roti & Kue', slug: 'roti-kue', parentId: catMakanan.id, outletId: outlet.id, sortOrder: 2 },
  })
  const catKopi = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'kopi', outletId: outlet.id } },
    update: {},
    create: { name: 'Kopi', slug: 'kopi', parentId: catMinuman.id, outletId: outlet.id, sortOrder: 1 },
  })
  const catJus = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'jus-minuman-segar', outletId: outlet.id } },
    update: {},
    create: { name: 'Jus & Minuman Segar', slug: 'jus-minuman-segar', parentId: catMinuman.id, outletId: outlet.id, sortOrder: 2 },
  })
  console.info('✅ Categories seeded: 7 kategori (3 root + 4 sub)')

  // ── Phase 2: Products ─────────────────────────────────────────────────────

  // 1. Nasi Goreng Spesial (SINGLE)
  const prodNasiGoreng = await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MKN-001', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Nasi Goreng Spesial', sku: 'MKN-001', type: 'SINGLE',
      price: 35000, cost: 15000, categoryId: catNasiMie.id, outletId: outlet.id,
      description: 'Nasi goreng dengan telur dan ayam suwir',
    },
  })

  // 2. Mie Ayam Bakso (SINGLE)
  await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MKN-002', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Mie Ayam Bakso', sku: 'MKN-002', type: 'SINGLE',
      price: 28000, cost: 12000, categoryId: catNasiMie.id, outletId: outlet.id,
    },
  })

  // 3. Roti Bakar (VARIANT — plain/coklat/keju)
  const prodRoti = await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MKN-003', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Roti Bakar', sku: 'MKN-003', type: 'VARIANT',
      price: 15000, cost: 7000, categoryId: catRoti.id, outletId: outlet.id,
      description: 'Roti bakar dengan berbagai pilihan topping',
    },
  })

  // Variants for Roti Bakar
  const rotiVariants = [
    { name: 'Plain', sku: 'MKN-003-PLN', price: 15000, cost: 7000, sortOrder: 0 },
    { name: 'Coklat', sku: 'MKN-003-COK', price: 18000, cost: 8000, sortOrder: 1 },
    { name: 'Keju', sku: 'MKN-003-KEJ', price: 20000, cost: 9000, sortOrder: 2 },
    { name: 'Coklat Keju', sku: 'MKN-003-COK-KEJ', price: 22000, cost: 10000, sortOrder: 3 },
  ]
  for (const v of rotiVariants) {
    await prisma.productVariant.upsert({
      where: { sku_productId: { sku: v.sku, productId: prodRoti.id } },
      update: {},
      create: { ...v, productId: prodRoti.id, attributes: { topping: v.name } },
    })
  }

  // 4. Es Kopi Susu (VARIANT — ukuran)
  const prodKopi = await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MNM-001', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Es Kopi Susu', sku: 'MNM-001', type: 'VARIANT',
      price: 25000, cost: 8000, categoryId: catKopi.id, outletId: outlet.id,
      description: 'Espresso blend dengan susu segar dan es batu',
    },
  })

  // Variants for Es Kopi Susu
  const kopiVariants = [
    { name: 'Regular (250ml)', sku: 'MNM-001-REG', price: 25000, cost: 8000,  sortOrder: 0 },
    { name: 'Large (400ml)',   sku: 'MNM-001-LRG', price: 32000, cost: 11000, sortOrder: 1 },
  ]
  for (const v of kopiVariants) {
    await prisma.productVariant.upsert({
      where: { sku_productId: { sku: v.sku, productId: prodKopi.id } },
      update: {},
      create: { ...v, productId: prodKopi.id, attributes: { ukuran: v.name.split(' ')[0]! } },
    })
  }

  // Modifier: Level Gula untuk Es Kopi Susu
  const modGroupGula = await prisma.productModifierGroup.upsert({
    where: { id: 'seed-modgroup-gula' },
    update: {},
    create: {
      id: 'seed-modgroup-gula',
      productId: prodKopi.id,
      name: 'Level Gula', isRequired: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
    },
  })
  const gulaOptions = ['25%', '50%', 'Normal (75%)', 'Extra (100%)']
  for (let i = 0; i < gulaOptions.length; i++) {
    await prisma.productModifier.upsert({
      where: { id: `seed-mod-gula-${i}` },
      update: {},
      create: { id: `seed-mod-gula-${i}`, modifierGroupId: modGroupGula.id, name: gulaOptions[i]!, price: 0, sortOrder: i },
    })
  }

  // Modifier: Suhu untuk Es Kopi Susu
  const modGroupSuhu = await prisma.productModifierGroup.upsert({
    where: { id: 'seed-modgroup-suhu' },
    update: {},
    create: {
      id: 'seed-modgroup-suhu',
      productId: prodKopi.id,
      name: 'Suhu', isRequired: true, minSelect: 1, maxSelect: 1, sortOrder: 1,
    },
  })
  for (const [i, opt] of [['Es', 0], ['Panas', 0]].entries()) {
    await prisma.productModifier.upsert({
      where: { id: `seed-mod-suhu-${i}` },
      update: {},
      create: { id: `seed-mod-suhu-${i}`, modifierGroupId: modGroupSuhu.id, name: String(opt), price: 0, sortOrder: i },
    })
  }

  // 5. Americano (SINGLE + modifier)
  const prodAmericano = await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MNM-002', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Americano', sku: 'MNM-002', type: 'SINGLE',
      price: 22000, cost: 6000, categoryId: catKopi.id, outletId: outlet.id,
    },
  })
  // Americano juga punya modifier suhu
  const modGroupAmericanoSuhu = await prisma.productModifierGroup.upsert({
    where: { id: 'seed-modgroup-americano-suhu' },
    update: {},
    create: {
      id: 'seed-modgroup-americano-suhu',
      productId: prodAmericano.id,
      name: 'Suhu', isRequired: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
    },
  })
  for (const [i, name] of ['Es', 'Panas'].entries()) {
    await prisma.productModifier.upsert({
      where: { id: `seed-mod-americano-suhu-${i}` },
      update: {},
      create: { id: `seed-mod-americano-suhu-${i}`, modifierGroupId: modGroupAmericanoSuhu.id, name, price: 0, sortOrder: i },
    })
  }

  // 6. Jus Alpukat (SINGLE)
  await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MNM-003', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Jus Alpukat', sku: 'MNM-003', type: 'SINGLE',
      price: 20000, cost: 7000, categoryId: catJus.id, outletId: outlet.id,
    },
  })

  // 7. Keripik Kentang (SINGLE)
  await prisma.product.upsert({
    where: { sku_outletId: { sku: 'SNK-001', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Keripik Kentang', sku: 'SNK-001', type: 'SINGLE',
      price: 12000, cost: 4500, categoryId: catSnack.id, outletId: outlet.id,
    },
  })

  console.info('✅ Products seeded: 7 produk (2 VARIANT dengan variants & modifier, 5 SINGLE)')

  // ── Phase 2: Inventory ────────────────────────────────────────────────────

  const products = await prisma.product.findMany({
    where: { outletId: outlet.id, deletedAt: null },
    select: { id: true, sku: true },
  })

  const stockData: Record<string, { qty: number; cost: number; unit: string }> = {
    'MKN-001': { qty: 100, cost: 15000,  unit: 'porsi'   },
    'MKN-002': { qty: 80,  cost: 12000,  unit: 'porsi'   },
    'MKN-003': { qty: 50,  cost: 7000,   unit: 'buah'    },
    'MNM-001': { qty: 200, cost: 8000,   unit: 'gelas'   },
    'MNM-002': { qty: 150, cost: 6000,   unit: 'gelas'   },
    'MNM-003': { qty: 120, cost: 7000,   unit: 'gelas'   },
    'SNK-001': { qty: 300, cost: 4500,   unit: 'bungkus' },
  }

  for (const product of products) {
    const s = stockData[product.sku]
    if (!s) continue

    const item = await prisma.inventoryItem.upsert({
      where: { productId: product.id },
      update: { quantity: s.qty, unit: s.unit },
      create: { productId: product.id, outletId: outlet.id, quantity: s.qty, unit: s.unit },
    })

    await prisma.inventoryCostLayer.upsert({
      where: { id: `seed-layer-${product.sku}` },
      update: {},
      create: {
        id: `seed-layer-${product.sku}`,
        inventoryItemId: item.id,
        quantityIn: s.qty, quantityLeft: s.qty, costPerUnit: s.cost,
      },
    })

    await prisma.inventoryAdjustment.upsert({
      where: { id: `seed-adj-${product.sku}` },
      update: {},
      create: {
        id: `seed-adj-${product.sku}`,
        inventoryItemId: item.id, type: 'INITIAL',
        quantity: s.qty, quantityBefore: 0, quantityAfter: s.qty,
        costPerUnit: s.cost, totalCost: s.qty * s.cost,
        notes: 'Stok awal dari seed', userId: admin.id,
      },
    })
  }
  console.info(`✅ Inventory seeded: ${Object.keys(stockData).length} produk dengan stok awal`)

  // ── Phase 2: Employees ────────────────────────────────────────────────────

  const employees = [
    {
      id:    'seed-emp-001',
      name:  'Siti Rahayu', position: 'Manager', employmentStatus: 'ACTIVE' as const,
      hireDate: new Date('2023-01-15'), salary: 6500000,
      email: 'siti@pos.com', phone: '081111111111',
    },
    {
      id:    'seed-emp-002',
      name:  'Budi Santoso', position: 'Kasir', employmentStatus: 'ACTIVE' as const,
      hireDate: new Date('2023-03-01'), salary: 4000000,
      email: 'budi@pos.com', phone: '082222222222',
    },
    {
      id:    'seed-emp-003',
      name:  'Dewi Lestari', position: 'Kasir', employmentStatus: 'ACTIVE' as const,
      hireDate: new Date('2023-06-15'), salary: 4000000,
      phone: '083333333333',
    },
    {
      id:    'seed-emp-004',
      name:  'Agus Priyanto', position: 'Barista', employmentStatus: 'ACTIVE' as const,
      hireDate: new Date('2024-01-02'), salary: 4500000,
      phone: '084444444444',
    },
    {
      id:    'seed-emp-005',
      name:  'Rina Kusuma', position: 'Kasir', employmentStatus: 'INACTIVE' as const,
      hireDate: new Date('2022-08-01'), salary: 4000000,
      notes: 'Cuti panjang',
    },
  ]

  for (const emp of employees) {
    await prisma.employee.upsert({
      where: { id: emp.id },
      update: {},
      create: { ...emp, outletId: outlet.id },
    })
  }

  // Set PIN untuk Budi dan Dewi (kasir aktif)
  const hashedPin = await bcrypt.hash('123456', 12)
  await prisma.employee.updateMany({
    where: { id: { in: ['seed-emp-002', 'seed-emp-003'] } },
    data: { pin: hashedPin },
  })

  // Contoh jadwal shift bulan ini
  const today = new Date()
  const thisMonth = today.getMonth()
  const thisYear = today.getFullYear()

  const shifts = [
    // Budi: shift pagi (Senin-Jumat minggu ini)
    { employeeId: 'seed-emp-002', day: 1,  startTime: '08:00', endTime: '16:00', type: 'MORNING'   as const },
    { employeeId: 'seed-emp-002', day: 2,  startTime: '08:00', endTime: '16:00', type: 'MORNING'   as const },
    { employeeId: 'seed-emp-002', day: 3,  startTime: '08:00', endTime: '16:00', type: 'MORNING'   as const },
    // Dewi: shift siang
    { employeeId: 'seed-emp-003', day: 1,  startTime: '14:00', endTime: '22:00', type: 'AFTERNOON' as const },
    { employeeId: 'seed-emp-003', day: 2,  startTime: '14:00', endTime: '22:00', type: 'AFTERNOON' as const },
    { employeeId: 'seed-emp-003', day: 3,  startTime: '14:00', endTime: '22:00', type: 'AFTERNOON' as const },
    // Agus: shift penuh
    { employeeId: 'seed-emp-004', day: 5,  startTime: '09:00', endTime: '17:00', type: 'FULL_DAY'  as const },
    { employeeId: 'seed-emp-004', day: 6,  startTime: '09:00', endTime: '17:00', type: 'FULL_DAY'  as const },
  ]

  for (const s of shifts) {
    const date = new Date(thisYear, thisMonth, s.day)
    // Skip jika tanggal sudah lewat atau invalid
    if (date.getMonth() !== thisMonth) continue

    await prisma.shift.upsert({
      where: { employeeId_date: { employeeId: s.employeeId, date } },
      update: {},
      create: {
        employeeId: s.employeeId,
        date, startTime: s.startTime, endTime: s.endTime, type: s.type,
      },
    })
  }

  console.info(`✅ Employees seeded: ${employees.length} karyawan (2 dengan PIN: 123456)`)


  // ── Phase 2: Outlet Settings & Business Hours ────────────────────────────

  await prisma.outletSettings.upsert({
    where: { outletId: outlet.id },
    update: {},
    create: {
      outletId:     outlet.id,
      taxRate:      11,
      taxName:      'PPN',
      serviceCharge: 0,
      rounding:     'NEAREST',
      roundingValue: 100,
      receiptFooter: 'Terima kasih telah berbelanja!\nKunjungi kami kembali.',
      currency:     'IDR',
      timezone:     'Asia/Jakarta',
    },
  })

  // Jam operasional: Senin-Jumat 08:00-22:00, Sabtu-Minggu 09:00-21:00
  const businessHours = [
    { dayOfWeek: 0, isOpen: true,  openTime: '09:00', closeTime: '21:00' }, // Minggu
    { dayOfWeek: 1, isOpen: true,  openTime: '08:00', closeTime: '22:00' }, // Senin
    { dayOfWeek: 2, isOpen: true,  openTime: '08:00', closeTime: '22:00' }, // Selasa
    { dayOfWeek: 3, isOpen: true,  openTime: '08:00', closeTime: '22:00' }, // Rabu
    { dayOfWeek: 4, isOpen: true,  openTime: '08:00', closeTime: '22:00' }, // Kamis
    { dayOfWeek: 5, isOpen: true,  openTime: '08:00', closeTime: '22:00' }, // Jumat
    { dayOfWeek: 6, isOpen: true,  openTime: '09:00', closeTime: '21:00' }, // Sabtu
  ]
  for (const bh of businessHours) {
    await prisma.outletBusinessHour.upsert({
      where: { outletId_dayOfWeek: { outletId: outlet.id, dayOfWeek: bh.dayOfWeek } },
      update: {},
      create: { ...bh, outletId: outlet.id },
    })
  }
  console.info('✅ Outlet settings & 7 business hours seeded')

  // ── Phase 2: Suppliers ────────────────────────────────────────────────────

  const suppliers = [
    {
      id: 'seed-sup-001', name: 'CV Sumber Bahan Utama', contactName: 'Pak Joko',
      phone: '021-55551111', email: 'pembelian@sumberbahan.com',
      address: 'Jl. Raya Pasar Minggu No. 45, Jakarta Selatan',
      notes: 'Supplier bahan baku utama — bayar NET30',
    },
    {
      id: 'seed-sup-002', name: 'PT Distribusi Kopi Nusantara', contactName: 'Bu Sari',
      phone: '021-55552222', email: 'order@kopinusantara.com',
      address: 'Jl. Gatot Subroto Kav. 12, Jakarta Selatan',
      notes: 'Supplier biji kopi dan perlengkapan minuman',
    },
    {
      id: 'seed-sup-003', name: 'UD Kemasan Jaya', contactName: 'Mas Rian',
      phone: '0274-556677',
      address: 'Jl. Malioboro No. 88, Yogyakarta',
      notes: 'Supplier kemasan dan packaging',
    },
  ]

  for (const sup of suppliers) {
    await prisma.supplier.upsert({
      where: { id: sup.id },
      update: {},
      create: { ...sup, outletId: outlet.id, isActive: true },
    })
  }
  console.info(`✅ Suppliers seeded: ${suppliers.length} supplier`)

  // ── Phase 2: Sample Purchase Orders ──────────────────────────────────────

  // Ambil beberapa produk untuk dimasukkan ke PO
  const poProducts = await prisma.product.findMany({
    where: { outletId: outlet.id, deletedAt: null },
    select: { id: true, sku: true, cost: true },
    take: 4,
  })

  if (poProducts.length > 0) {
    // PO-1: RECEIVED (sudah diterima)
    const po1 = await prisma.purchaseOrder.upsert({
      where: { orderNumber_outletId: { orderNumber: 'PO-20240101-0001', outletId: outlet.id } },
      update: {},
      create: {
        id:          'seed-po-001',
        outletId:    outlet.id,
        supplierId:  'seed-sup-001',
        orderNumber: 'PO-20240101-0001',
        status:      'RECEIVED',
        notes:       'PO pertama — stok awal',
        orderedAt:   new Date('2024-01-01'),
        expectedAt:  new Date('2024-01-05'),
        receivedAt:  new Date('2024-01-04'),
        totalAmount: 0,
        createdById: admin.id,
      },
    })

    let po1Total = 0
    for (let i = 0; i < Math.min(2, poProducts.length); i++) {
      const p = poProducts[i]!
      const qty = 50, cost = Number(p.cost)
      const total = qty * cost
      po1Total += total
      await prisma.purchaseOrderItem.upsert({
        where: { id: `seed-poi-001-${i}` },
        update: {},
        create: {
          id: `seed-poi-001-${i}`,
          purchaseOrderId: po1.id, productId: p.id,
          quantity: qty, unit: 'pcs',
          costPerUnit: cost, totalCost: total, receivedQuantity: qty,
        },
      })
    }
    await prisma.purchaseOrder.update({ where: { id: po1.id }, data: { totalAmount: po1Total } })

    // PO-2: ORDERED (sudah dipesan, belum diterima)
    const po2 = await prisma.purchaseOrder.upsert({
      where: { orderNumber_outletId: { orderNumber: 'PO-20241001-0002', outletId: outlet.id } },
      update: {},
      create: {
        id:          'seed-po-002',
        outletId:    outlet.id,
        supplierId:  'seed-sup-002',
        orderNumber: 'PO-20241001-0002',
        status:      'ORDERED',
        notes:       'Restock bahan minuman',
        orderedAt:   new Date(),
        expectedAt:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        totalAmount: 0,
        createdById: admin.id,
      },
    })

    let po2Total = 0
    for (let i = 2; i < Math.min(4, poProducts.length); i++) {
      const p = poProducts[i]!
      const qty = 100, cost = Number(p.cost)
      const total = qty * cost
      po2Total += total
      await prisma.purchaseOrderItem.upsert({
        where: { id: `seed-poi-002-${i}` },
        update: {},
        create: {
          id: `seed-poi-002-${i}`,
          purchaseOrderId: po2.id, productId: p.id,
          quantity: qty, unit: 'pcs',
          costPerUnit: cost, totalCost: total, receivedQuantity: 0,
        },
      })
    }
    await prisma.purchaseOrder.update({ where: { id: po2.id }, data: { totalAmount: po2Total } })

    // PO-3: DRAFT
    await prisma.purchaseOrder.upsert({
      where: { orderNumber_outletId: { orderNumber: 'PO-20241015-0003', outletId: outlet.id } },
      update: {},
      create: {
        id:          'seed-po-003',
        outletId:    outlet.id,
        supplierId:  'seed-sup-003',
        orderNumber: 'PO-20241015-0003',
        status:      'DRAFT',
        notes:       'Perlu review dulu sebelum dikirim',
        totalAmount: 0,
        createdById: admin.id,
      },
    })
    console.info('✅ Purchase Orders seeded: 3 PO (1 RECEIVED, 1 ORDERED, 1 DRAFT)')
  }

  // ── Phase 3.2: Discounts ──────────────────────────────────────────────────
  {
    // Ambil beberapa produk untuk diskon PER_ITEM
    const perItemProducts = await prisma.product.findMany({
      where:  { outletId: outlet.id, deletedAt: null, isActive: true },
      select: { id: true, sku: true, name: true },
      take:   3,
      orderBy: { createdAt: 'asc' },
    })

    const discounts = [
      // 1. Diskon weekend 10% — PER_BILL, PERCENTAGE, tanpa batas waktu
      {
        id:          'seed-disc-001',
        name:        'Diskon Weekend 10%',
        code:        'WEEKEND10',
        description: 'Diskon 10% untuk semua pembelian di akhir pekan',
        type:        'PERCENTAGE' as const,
        scope:       'PER_BILL'   as const,
        value:       10,
        minPurchase: 50000,
        maxDiscount: 30000,
        isActive:    true,
        productIds:  [] as string[],
      },
      // 2. Diskon Kemerdekaan Rp 17.000 — PER_BILL, FIXED_AMOUNT, dengan periode
      {
        id:          'seed-disc-002',
        name:        'Promo Kemerdekaan',
        code:        'MERDEKA17',
        description: 'Potongan Rp 17.000 untuk merayakan HUT RI',
        type:        'FIXED_AMOUNT' as const,
        scope:       'PER_BILL'     as const,
        value:       17000,
        minPurchase: 100000,
        maxDiscount: null,
        isActive:    true,
        startAt:     new Date('2025-08-01T00:00:00.000Z'),
        endAt:       new Date('2025-08-31T23:59:59.000Z'),
        productIds:  [] as string[],
      },
      // 3. Buy More Save More — PER_ITEM, PERCENTAGE (untuk produk tertentu)
      {
        id:          'seed-disc-003',
        name:        'Happy Hour Minuman 15%',
        code:        'HAPPYHOUR',
        description: 'Diskon 15% untuk produk minuman pilihan jam 14:00-17:00',
        type:        'PERCENTAGE' as const,
        scope:       'PER_ITEM'   as const,
        value:       15,
        minPurchase: null,
        maxDiscount: 20000,
        isActive:    true,
        productIds:  perItemProducts.slice(0, 2).map((p) => p.id),
      },
      // 4. Diskon nominal per item — FIXED_AMOUNT, PER_ITEM
      {
        id:          'seed-disc-004',
        name:        'Hemat Rp 5.000 per Item',
        code:        'ITEM5K',
        description: 'Potongan Rp 5.000 per item untuk produk pilihan',
        type:        'FIXED_AMOUNT' as const,
        scope:       'PER_ITEM'     as const,
        value:       5000,
        minPurchase: null,
        maxDiscount: null,
        isActive:    true,
        productIds:  perItemProducts.length > 0 ? [perItemProducts[0]!.id] : [],
      },
      // 5. Diskon non-aktif (untuk tes filter isActive=false)
      {
        id:          'seed-disc-005',
        name:        'Promo Tidak Aktif',
        code:        'INACTIVE99',
        description: 'Diskon yang sudah dinonaktifkan',
        type:        'PERCENTAGE' as const,
        scope:       'PER_BILL'   as const,
        value:       99,
        minPurchase: null,
        maxDiscount: null,
        isActive:    false,
        productIds:  [] as string[],
      },
    ]

    for (const disc of discounts) {
      const { productIds, startAt, endAt, ...rest } = disc as typeof disc & {
        startAt?: Date
        endAt?:   Date
      }

      await prisma.discount.upsert({
        where:  { id: disc.id },
        update: {},
        create: {
          ...rest,
          outletId: outlet.id,
          ...(startAt ? { startAt } : {}),
          ...(endAt   ? { endAt   } : {}),
          ...(productIds.length ? {
            products: { create: productIds.map((pid) => ({ productId: pid })) },
          } : {}),
        },
      })
    }

    console.info(`✅ Discounts seeded: ${discounts.length} diskon (4 aktif, 1 nonaktif)`)
    if (perItemProducts.length > 0) {
      console.info(`   PER_ITEM discounts berlaku untuk: ${perItemProducts.map(p => p.sku).join(', ')}`)
    }
  }

  // ── Phase 7: Sample Cart ───────────────────────────────────────────────────
  {
    // Ambil produk yang ada untuk dimasukkan ke sample cart
    const sampleProducts = await prisma.product.findMany({
      where:  { outletId: outlet.id, isActive: true, deletedAt: null },
      select: { id: true, name: true, price: true, type: true },
      take:   3,
      orderBy: { createdAt: 'asc' },
    })

    if (sampleProducts.length > 0) {
      const cashier = await prisma.user.findUnique({ where: { email: 'admin@pos.com' } })
      const settings = await prisma.outletSettings.findUnique({
        where:  { outletId: outlet.id },
        select: { taxRate: true, serviceCharge: true },
      })

      const cartId = 'seed-cart-001'
      const cart   = await prisma.cart.upsert({
        where:  { id: cartId },
        update: {},
        create: {
          id:       cartId,
          outletId: outlet.id,
          userId:   cashier!.id,
          notes:    'Meja 5 - sample cart dari seed',
          status:   'ACTIVE',
        },
      })

      // Hapus item lama agar upsert idempoten
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })

      // Tambahkan item dari produk yang tersedia
      for (let i = 0; i < sampleProducts.length; i++) {
        const p = sampleProducts[i]!
        await prisma.cartItem.create({
          data: {
            id:        `seed-cartitem-00${i + 1}`,
            cartId:    cart.id,
            productId: p.id,
            quantity:  i === 0 ? 2 : 1,
            unitPrice: Number(p.price),
          },
        })
      }

      const itemCount = sampleProducts.length
      console.info(`✅ Sample Cart seeded: 1 cart ACTIVE (${itemCount} item)`)
    }
  }

  console.info('\n🎉 Seed completed!\n')
  console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.info('  Login:')
  console.info('    Super Admin : admin@pos.com  / Admin@123')
  console.info('    Owner       : owner@pos.com  / Owner@123')
  console.info('  Employee PIN (Budi & Dewi): 123456')
  console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
