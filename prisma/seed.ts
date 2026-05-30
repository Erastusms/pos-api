import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ─── Roles ────────────────────────────────────────────────────────────────────

const ROLES = [
  {
    id: 1,
    name: 'SUPER_ADMIN',
    displayName: 'Super Admin',
    description: 'Akses penuh ke seluruh sistem',
  },
  {
    id: 2,
    name: 'OWNER',
    displayName: 'Owner',
    description: 'Pemilik bisnis, akses penuh ke outlet yang dimiliki',
  },
  {
    id: 3,
    name: 'MANAGER',
    displayName: 'Manager',
    description: 'Manajer outlet, akses operasional penuh',
  },
  {
    id: 4,
    name: 'CASHIER',
    displayName: 'Kasir',
    description: 'Staf kasir, hanya akses transaksi',
  },
]

// ─── Permissions ──────────────────────────────────────────────────────────────

const PERMISSIONS = [
  { resource: 'user', action: 'create' },
  { resource: 'user', action: 'read' },
  { resource: 'user', action: 'update' },
  { resource: 'user', action: 'delete' },
  { resource: 'outlet', action: 'create' },
  { resource: 'outlet', action: 'read' },
  { resource: 'outlet', action: 'update' },
  { resource: 'outlet', action: 'delete' },
  { resource: 'category', action: 'create' },
  { resource: 'category', action: 'read' },
  { resource: 'category', action: 'update' },
  { resource: 'category', action: 'delete' },
  { resource: 'product', action: 'create' },
  { resource: 'product', action: 'read' },
  { resource: 'product', action: 'update' },
  { resource: 'product', action: 'delete' },
  { resource: 'inventory', action: 'create' },
  { resource: 'inventory', action: 'read' },
  { resource: 'inventory', action: 'update' },
  { resource: 'transaction', action: 'create' },
  { resource: 'transaction', action: 'read' },
  { resource: 'transaction', action: 'void' },
  { resource: 'customer', action: 'create' },
  { resource: 'customer', action: 'read' },
  { resource: 'customer', action: 'update' },
  { resource: 'customer', action: 'delete' },
  { resource: 'employee', action: 'create' },
  { resource: 'employee', action: 'read' },
  { resource: 'employee', action: 'update' },
  { resource: 'employee', action: 'delete' },
  { resource: 'discount', action: 'create' },
  { resource: 'discount', action: 'read' },
  { resource: 'discount', action: 'update' },
  { resource: 'discount', action: 'delete' },
  { resource: 'report', action: 'read' },
  { resource: 'report', action: 'export' },
  { resource: 'supplier', action: 'create' },
  { resource: 'supplier', action: 'read' },
  { resource: 'supplier', action: 'update' },
  { resource: 'supplier', action: 'delete' },
  { resource: 'cart', action: 'create' },
  { resource: 'cart', action: 'read' },
  { resource: 'cart', action: 'update' },
  { resource: 'cart', action: 'delete' },
]

type PermRef = { resource: string; action: string }
const all = PERMISSIONS as PermRef[]

const ROLE_PERMISSIONS: Record<string, PermRef[]> = {
  SUPER_ADMIN: all,
  OWNER: all,
  MANAGER: [
    { resource: 'category', action: 'create' },
    { resource: 'category', action: 'read' },
    { resource: 'category', action: 'update' },
    { resource: 'category', action: 'delete' },
    { resource: 'product', action: 'create' },
    { resource: 'product', action: 'read' },
    { resource: 'product', action: 'update' },
    { resource: 'inventory', action: 'create' },
    { resource: 'inventory', action: 'read' },
    { resource: 'inventory', action: 'update' },
    { resource: 'transaction', action: 'create' },
    { resource: 'transaction', action: 'read' },
    { resource: 'transaction', action: 'void' },
    { resource: 'customer', action: 'create' },
    { resource: 'customer', action: 'read' },
    { resource: 'customer', action: 'update' },
    { resource: 'employee', action: 'read' },
    { resource: 'discount', action: 'create' },
    { resource: 'discount', action: 'read' },
    { resource: 'discount', action: 'update' },
    { resource: 'supplier', action: 'create' },
    { resource: 'supplier', action: 'read' },
    { resource: 'supplier', action: 'update' },
    { resource: 'report', action: 'read' },
    { resource: 'report', action: 'export' },
    { resource: 'cart', action: 'create' },
    { resource: 'cart', action: 'read' },
    { resource: 'cart', action: 'update' },
    { resource: 'cart', action: 'delete' },
  ],
  CASHIER: [
    { resource: 'category', action: 'read' },
    { resource: 'product', action: 'read' },
    { resource: 'inventory', action: 'read' },
    { resource: 'transaction', action: 'create' },
    { resource: 'transaction', action: 'read' },
    { resource: 'customer', action: 'create' },
    { resource: 'customer', action: 'read' },
    { resource: 'discount', action: 'read' },
    { resource: 'cart', action: 'create' },
    { resource: 'cart', action: 'read' },
    { resource: 'cart', action: 'update' },
    { resource: 'cart', action: 'delete' },
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
    create: {
      name: 'Super Admin',
      email: 'admin@pos.com',
      password: adminPw,
      roleId: 1,
      outletId: outlet.id,
    },
  })
  const ownerPw = await bcrypt.hash('Owner@123', 12)
  await prisma.user.upsert({
    where: { email: 'owner@pos.com' },
    update: {},
    create: {
      name: 'Demo Owner',
      email: 'owner@pos.com',
      password: ownerPw,
      roleId: 2,
      outletId: outlet.id,
    },
  })
  console.info('✅ Users seeded: admin@pos.com, owner@pos.com')

  // ── Phase 2: Categories ───────────────────────────────────────────────────

  const catMakanan = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'makanan', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Makanan',
      slug: 'makanan',
      description: 'Semua produk makanan',
      outletId: outlet.id,
      sortOrder: 1,
    },
  })
  const catMinuman = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'minuman', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Minuman',
      slug: 'minuman',
      description: 'Semua produk minuman',
      outletId: outlet.id,
      sortOrder: 2,
    },
  })
  const catSnack = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'snack', outletId: outlet.id } },
    update: {},
    create: { name: 'Snack & Cemilan', slug: 'snack', outletId: outlet.id, sortOrder: 3 },
  })
  const catNasiMie = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'nasi-mie', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Nasi & Mie',
      slug: 'nasi-mie',
      parentId: catMakanan.id,
      outletId: outlet.id,
      sortOrder: 1,
    },
  })
  const catRoti = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'roti-kue', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Roti & Kue',
      slug: 'roti-kue',
      parentId: catMakanan.id,
      outletId: outlet.id,
      sortOrder: 2,
    },
  })
  const catKopi = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'kopi', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Kopi',
      slug: 'kopi',
      parentId: catMinuman.id,
      outletId: outlet.id,
      sortOrder: 1,
    },
  })
  const catJus = await prisma.category.upsert({
    where: { slug_outletId: { slug: 'jus-minuman-segar', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Jus & Minuman Segar',
      slug: 'jus-minuman-segar',
      parentId: catMinuman.id,
      outletId: outlet.id,
      sortOrder: 2,
    },
  })
  console.info('✅ Categories seeded: 7 kategori (3 root + 4 sub)')

  // ── Phase 2: Products ─────────────────────────────────────────────────────

  // 1. Nasi Goreng Spesial (SINGLE)
  const prodNasiGoreng = await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MKN-001', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Nasi Goreng Spesial',
      sku: 'MKN-001',
      type: 'SINGLE',
      price: 35000,
      cost: 15000,
      categoryId: catNasiMie.id,
      outletId: outlet.id,
      description: 'Nasi goreng dengan telur dan ayam suwir',
    },
  })

  // 2. Mie Ayam Bakso (SINGLE)
  await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MKN-002', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Mie Ayam Bakso',
      sku: 'MKN-002',
      type: 'SINGLE',
      price: 28000,
      cost: 12000,
      categoryId: catNasiMie.id,
      outletId: outlet.id,
    },
  })

  // 3. Roti Bakar (VARIANT — plain/coklat/keju)
  const prodRoti = await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MKN-003', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Roti Bakar',
      sku: 'MKN-003',
      type: 'VARIANT',
      price: 15000,
      cost: 7000,
      categoryId: catRoti.id,
      outletId: outlet.id,
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
      name: 'Es Kopi Susu',
      sku: 'MNM-001',
      type: 'VARIANT',
      price: 25000,
      cost: 8000,
      categoryId: catKopi.id,
      outletId: outlet.id,
      description: 'Espresso blend dengan susu segar dan es batu',
    },
  })

  // Variants for Es Kopi Susu
  const kopiVariants = [
    { name: 'Regular (250ml)', sku: 'MNM-001-REG', price: 25000, cost: 8000, sortOrder: 0 },
    { name: 'Large (400ml)', sku: 'MNM-001-LRG', price: 32000, cost: 11000, sortOrder: 1 },
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
      name: 'Level Gula',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 0,
    },
  })
  const gulaOptions = ['25%', '50%', 'Normal (75%)', 'Extra (100%)']
  for (let i = 0; i < gulaOptions.length; i++) {
    await prisma.productModifier.upsert({
      where: { id: `seed-mod-gula-${i}` },
      update: {},
      create: {
        id: `seed-mod-gula-${i}`,
        modifierGroupId: modGroupGula.id,
        name: gulaOptions[i]!,
        price: 0,
        sortOrder: i,
      },
    })
  }

  // Modifier: Suhu untuk Es Kopi Susu
  const modGroupSuhu = await prisma.productModifierGroup.upsert({
    where: { id: 'seed-modgroup-suhu' },
    update: {},
    create: {
      id: 'seed-modgroup-suhu',
      productId: prodKopi.id,
      name: 'Suhu',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 1,
    },
  })
  for (const [i, opt] of [
    ['Es', 0],
    ['Panas', 0],
  ].entries()) {
    await prisma.productModifier.upsert({
      where: { id: `seed-mod-suhu-${i}` },
      update: {},
      create: {
        id: `seed-mod-suhu-${i}`,
        modifierGroupId: modGroupSuhu.id,
        name: String(opt),
        price: 0,
        sortOrder: i,
      },
    })
  }

  // 5. Americano (SINGLE + modifier)
  const prodAmericano = await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MNM-002', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Americano',
      sku: 'MNM-002',
      type: 'SINGLE',
      price: 22000,
      cost: 6000,
      categoryId: catKopi.id,
      outletId: outlet.id,
    },
  })
  // Americano juga punya modifier suhu
  const modGroupAmericanoSuhu = await prisma.productModifierGroup.upsert({
    where: { id: 'seed-modgroup-americano-suhu' },
    update: {},
    create: {
      id: 'seed-modgroup-americano-suhu',
      productId: prodAmericano.id,
      name: 'Suhu',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 0,
    },
  })
  for (const [i, name] of ['Es', 'Panas'].entries()) {
    await prisma.productModifier.upsert({
      where: { id: `seed-mod-americano-suhu-${i}` },
      update: {},
      create: {
        id: `seed-mod-americano-suhu-${i}`,
        modifierGroupId: modGroupAmericanoSuhu.id,
        name,
        price: 0,
        sortOrder: i,
      },
    })
  }

  // 6. Jus Alpukat (SINGLE)
  await prisma.product.upsert({
    where: { sku_outletId: { sku: 'MNM-003', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Jus Alpukat',
      sku: 'MNM-003',
      type: 'SINGLE',
      price: 20000,
      cost: 7000,
      categoryId: catJus.id,
      outletId: outlet.id,
    },
  })

  // 7. Keripik Kentang (SINGLE)
  await prisma.product.upsert({
    where: { sku_outletId: { sku: 'SNK-001', outletId: outlet.id } },
    update: {},
    create: {
      name: 'Keripik Kentang',
      sku: 'SNK-001',
      type: 'SINGLE',
      price: 12000,
      cost: 4500,
      categoryId: catSnack.id,
      outletId: outlet.id,
    },
  })

  console.info('✅ Products seeded: 7 produk (2 VARIANT dengan variants & modifier, 5 SINGLE)')

  // ── Phase 2: Inventory ────────────────────────────────────────────────────

  const products = await prisma.product.findMany({
    where: { outletId: outlet.id, deletedAt: null },
    select: { id: true, sku: true },
  })

  const stockData: Record<string, { qty: number; cost: number; unit: string }> = {
    'MKN-001': { qty: 100, cost: 15000, unit: 'porsi' },
    'MKN-002': { qty: 80, cost: 12000, unit: 'porsi' },
    'MKN-003': { qty: 50, cost: 7000, unit: 'buah' },
    'MNM-001': { qty: 200, cost: 8000, unit: 'gelas' },
    'MNM-002': { qty: 150, cost: 6000, unit: 'gelas' },
    'MNM-003': { qty: 120, cost: 7000, unit: 'gelas' },
    'SNK-001': { qty: 300, cost: 4500, unit: 'bungkus' },
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
        quantityIn: s.qty,
        quantityLeft: s.qty,
        costPerUnit: s.cost,
      },
    })

    await prisma.inventoryAdjustment.upsert({
      where: { id: `seed-adj-${product.sku}` },
      update: {},
      create: {
        id: `seed-adj-${product.sku}`,
        inventoryItemId: item.id,
        type: 'INITIAL',
        quantity: s.qty,
        quantityBefore: 0,
        quantityAfter: s.qty,
        costPerUnit: s.cost,
        totalCost: s.qty * s.cost,
        notes: 'Stok awal dari seed',
        userId: admin.id,
      },
    })
  }
  console.info(`✅ Inventory seeded: ${Object.keys(stockData).length} produk dengan stok awal`)

  // ── Phase 2: Employees ────────────────────────────────────────────────────

  const employees = [
    {
      id: 'seed-emp-001',
      name: 'Siti Rahayu',
      position: 'Manager',
      employmentStatus: 'ACTIVE' as const,
      hireDate: new Date('2023-01-15'),
      salary: 6500000,
      email: 'siti@pos.com',
      phone: '081111111111',
    },
    {
      id: 'seed-emp-002',
      name: 'Budi Santoso',
      position: 'Kasir',
      employmentStatus: 'ACTIVE' as const,
      hireDate: new Date('2023-03-01'),
      salary: 4000000,
      email: 'budi@pos.com',
      phone: '082222222222',
    },
    {
      id: 'seed-emp-003',
      name: 'Dewi Lestari',
      position: 'Kasir',
      employmentStatus: 'ACTIVE' as const,
      hireDate: new Date('2023-06-15'),
      salary: 4000000,
      phone: '083333333333',
    },
    {
      id: 'seed-emp-004',
      name: 'Agus Priyanto',
      position: 'Barista',
      employmentStatus: 'ACTIVE' as const,
      hireDate: new Date('2024-01-02'),
      salary: 4500000,
      phone: '084444444444',
    },
    {
      id: 'seed-emp-005',
      name: 'Rina Kusuma',
      position: 'Kasir',
      employmentStatus: 'INACTIVE' as const,
      hireDate: new Date('2022-08-01'),
      salary: 4000000,
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
    {
      employeeId: 'seed-emp-002',
      day: 1,
      startTime: '08:00',
      endTime: '16:00',
      type: 'MORNING' as const,
    },
    {
      employeeId: 'seed-emp-002',
      day: 2,
      startTime: '08:00',
      endTime: '16:00',
      type: 'MORNING' as const,
    },
    {
      employeeId: 'seed-emp-002',
      day: 3,
      startTime: '08:00',
      endTime: '16:00',
      type: 'MORNING' as const,
    },
    // Dewi: shift siang
    {
      employeeId: 'seed-emp-003',
      day: 1,
      startTime: '14:00',
      endTime: '22:00',
      type: 'AFTERNOON' as const,
    },
    {
      employeeId: 'seed-emp-003',
      day: 2,
      startTime: '14:00',
      endTime: '22:00',
      type: 'AFTERNOON' as const,
    },
    {
      employeeId: 'seed-emp-003',
      day: 3,
      startTime: '14:00',
      endTime: '22:00',
      type: 'AFTERNOON' as const,
    },
    // Agus: shift penuh
    {
      employeeId: 'seed-emp-004',
      day: 5,
      startTime: '09:00',
      endTime: '17:00',
      type: 'FULL_DAY' as const,
    },
    {
      employeeId: 'seed-emp-004',
      day: 6,
      startTime: '09:00',
      endTime: '17:00',
      type: 'FULL_DAY' as const,
    },
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
        date,
        startTime: s.startTime,
        endTime: s.endTime,
        type: s.type,
      },
    })
  }

  console.info(`✅ Employees seeded: ${employees.length} karyawan (2 dengan PIN: 123456)`)

  // ── Phase 2: Outlet Settings & Business Hours ────────────────────────────

  await prisma.outletSettings.upsert({
    where: { outletId: outlet.id },
    update: {},
    create: {
      outletId: outlet.id,
      taxRate: 11,
      taxName: 'PPN',
      serviceCharge: 0,
      rounding: 'NEAREST',
      roundingValue: 100,
      receiptFooter: 'Terima kasih telah berbelanja!\nKunjungi kami kembali.',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
    },
  })

  // Jam operasional: Senin-Jumat 08:00-22:00, Sabtu-Minggu 09:00-21:00
  const businessHours = [
    { dayOfWeek: 0, isOpen: true, openTime: '09:00', closeTime: '21:00' }, // Minggu
    { dayOfWeek: 1, isOpen: true, openTime: '08:00', closeTime: '22:00' }, // Senin
    { dayOfWeek: 2, isOpen: true, openTime: '08:00', closeTime: '22:00' }, // Selasa
    { dayOfWeek: 3, isOpen: true, openTime: '08:00', closeTime: '22:00' }, // Rabu
    { dayOfWeek: 4, isOpen: true, openTime: '08:00', closeTime: '22:00' }, // Kamis
    { dayOfWeek: 5, isOpen: true, openTime: '08:00', closeTime: '22:00' }, // Jumat
    { dayOfWeek: 6, isOpen: true, openTime: '09:00', closeTime: '21:00' }, // Sabtu
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
      id: 'seed-sup-001',
      name: 'CV Sumber Bahan Utama',
      contactName: 'Pak Joko',
      phone: '021-55551111',
      email: 'pembelian@sumberbahan.com',
      address: 'Jl. Raya Pasar Minggu No. 45, Jakarta Selatan',
      notes: 'Supplier bahan baku utama — bayar NET30',
    },
    {
      id: 'seed-sup-002',
      name: 'PT Distribusi Kopi Nusantara',
      contactName: 'Bu Sari',
      phone: '021-55552222',
      email: 'order@kopinusantara.com',
      address: 'Jl. Gatot Subroto Kav. 12, Jakarta Selatan',
      notes: 'Supplier biji kopi dan perlengkapan minuman',
    },
    {
      id: 'seed-sup-003',
      name: 'UD Kemasan Jaya',
      contactName: 'Mas Rian',
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
        id: 'seed-po-001',
        outletId: outlet.id,
        supplierId: 'seed-sup-001',
        orderNumber: 'PO-20240101-0001',
        status: 'RECEIVED',
        notes: 'PO pertama — stok awal',
        orderedAt: new Date('2024-01-01'),
        expectedAt: new Date('2024-01-05'),
        receivedAt: new Date('2024-01-04'),
        totalAmount: 0,
        createdById: admin.id,
      },
    })

    let po1Total = 0
    for (let i = 0; i < Math.min(2, poProducts.length); i++) {
      const p = poProducts[i]!
      const qty = 50,
        cost = Number(p.cost)
      const total = qty * cost
      po1Total += total
      await prisma.purchaseOrderItem.upsert({
        where: { id: `seed-poi-001-${i}` },
        update: {},
        create: {
          id: `seed-poi-001-${i}`,
          purchaseOrderId: po1.id,
          productId: p.id,
          quantity: qty,
          unit: 'pcs',
          costPerUnit: cost,
          totalCost: total,
          receivedQuantity: qty,
        },
      })
    }
    await prisma.purchaseOrder.update({ where: { id: po1.id }, data: { totalAmount: po1Total } })

    // PO-2: ORDERED (sudah dipesan, belum diterima)
    const po2 = await prisma.purchaseOrder.upsert({
      where: { orderNumber_outletId: { orderNumber: 'PO-20241001-0002', outletId: outlet.id } },
      update: {},
      create: {
        id: 'seed-po-002',
        outletId: outlet.id,
        supplierId: 'seed-sup-002',
        orderNumber: 'PO-20241001-0002',
        status: 'ORDERED',
        notes: 'Restock bahan minuman',
        orderedAt: new Date(),
        expectedAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        totalAmount: 0,
        createdById: admin.id,
      },
    })

    let po2Total = 0
    for (let i = 2; i < Math.min(4, poProducts.length); i++) {
      const p = poProducts[i]!
      const qty = 100,
        cost = Number(p.cost)
      const total = qty * cost
      po2Total += total
      await prisma.purchaseOrderItem.upsert({
        where: { id: `seed-poi-002-${i}` },
        update: {},
        create: {
          id: `seed-poi-002-${i}`,
          purchaseOrderId: po2.id,
          productId: p.id,
          quantity: qty,
          unit: 'pcs',
          costPerUnit: cost,
          totalCost: total,
          receivedQuantity: 0,
        },
      })
    }
    await prisma.purchaseOrder.update({ where: { id: po2.id }, data: { totalAmount: po2Total } })

    // PO-3: DRAFT
    await prisma.purchaseOrder.upsert({
      where: { orderNumber_outletId: { orderNumber: 'PO-20241015-0003', outletId: outlet.id } },
      update: {},
      create: {
        id: 'seed-po-003',
        outletId: outlet.id,
        supplierId: 'seed-sup-003',
        orderNumber: 'PO-20241015-0003',
        status: 'DRAFT',
        notes: 'Perlu review dulu sebelum dikirim',
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
      where: { outletId: outlet.id, deletedAt: null, isActive: true },
      select: { id: true, sku: true, name: true },
      take: 3,
      orderBy: { createdAt: 'asc' },
    })

    const discounts = [
      // 1. Diskon weekend 10% — PER_BILL, PERCENTAGE, tanpa batas waktu
      {
        id: 'seed-disc-001',
        name: 'Diskon Weekend 10%',
        code: 'WEEKEND10',
        description: 'Diskon 10% untuk semua pembelian di akhir pekan',
        type: 'PERCENTAGE' as const,
        scope: 'PER_BILL' as const,
        value: 10,
        minPurchase: 50000,
        maxDiscount: 30000,
        isActive: true,
        productIds: [] as string[],
      },
      // 2. Diskon Kemerdekaan Rp 17.000 — PER_BILL, FIXED_AMOUNT, dengan periode
      {
        id: 'seed-disc-002',
        name: 'Promo Kemerdekaan',
        code: 'MERDEKA17',
        description: 'Potongan Rp 17.000 untuk merayakan HUT RI',
        type: 'FIXED_AMOUNT' as const,
        scope: 'PER_BILL' as const,
        value: 17000,
        minPurchase: 100000,
        maxDiscount: null,
        isActive: true,
        startAt: new Date('2025-08-01T00:00:00.000Z'),
        endAt: new Date('2025-08-31T23:59:59.000Z'),
        productIds: [] as string[],
      },
      // 3. Buy More Save More — PER_ITEM, PERCENTAGE (untuk produk tertentu)
      {
        id: 'seed-disc-003',
        name: 'Happy Hour Minuman 15%',
        code: 'HAPPYHOUR',
        description: 'Diskon 15% untuk produk minuman pilihan jam 14:00-17:00',
        type: 'PERCENTAGE' as const,
        scope: 'PER_ITEM' as const,
        value: 15,
        minPurchase: null,
        maxDiscount: 20000,
        isActive: true,
        productIds: perItemProducts.slice(0, 2).map((p) => p.id),
      },
      // 4. Diskon nominal per item — FIXED_AMOUNT, PER_ITEM
      {
        id: 'seed-disc-004',
        name: 'Hemat Rp 5.000 per Item',
        code: 'ITEM5K',
        description: 'Potongan Rp 5.000 per item untuk produk pilihan',
        type: 'FIXED_AMOUNT' as const,
        scope: 'PER_ITEM' as const,
        value: 5000,
        minPurchase: null,
        maxDiscount: null,
        isActive: true,
        productIds: perItemProducts.length > 0 ? [perItemProducts[0]!.id] : [],
      },
      // 5. Diskon non-aktif (untuk tes filter isActive=false)
      {
        id: 'seed-disc-005',
        name: 'Promo Tidak Aktif',
        code: 'INACTIVE99',
        description: 'Diskon yang sudah dinonaktifkan',
        type: 'PERCENTAGE' as const,
        scope: 'PER_BILL' as const,
        value: 99,
        minPurchase: null,
        maxDiscount: null,
        isActive: false,
        productIds: [] as string[],
      },
    ]

    for (const disc of discounts) {
      const { productIds, startAt, endAt, ...rest } = disc as typeof disc & {
        startAt?: Date
        endAt?: Date
      }

      await prisma.discount.upsert({
        where: { id: disc.id },
        update: {},
        create: {
          ...rest,
          outletId: outlet.id,
          ...(startAt ? { startAt } : {}),
          ...(endAt ? { endAt } : {}),
          ...(productIds.length
            ? {
                products: { create: productIds.map((pid) => ({ productId: pid })) },
              }
            : {}),
        },
      })
    }

    console.info(`✅ Discounts seeded: ${discounts.length} diskon (4 aktif, 1 nonaktif)`)
    if (perItemProducts.length > 0) {
      console.info(
        `   PER_ITEM discounts berlaku untuk: ${perItemProducts.map((p) => p.sku).join(', ')}`,
      )
    }
  }

  // ── Phase 7: Sample Cart ───────────────────────────────────────────────────
  {
    // Ambil produk yang ada untuk dimasukkan ke sample cart
    const sampleProducts = await prisma.product.findMany({
      where: { outletId: outlet.id, isActive: true, deletedAt: null },
      select: { id: true, name: true, price: true, type: true },
      take: 3,
      orderBy: { createdAt: 'asc' },
    })

    if (sampleProducts.length > 0) {
      const cashier = await prisma.user.findUnique({ where: { email: 'admin@pos.com' } })
      const settings = await prisma.outletSettings.findUnique({
        where: { outletId: outlet.id },
        select: { taxRate: true, serviceCharge: true },
      })

      const cartId = 'seed-cart-001'
      const cart = await prisma.cart.upsert({
        where: { id: cartId },
        update: {},
        create: {
          id: cartId,
          outletId: outlet.id,
          userId: cashier!.id,
          notes: 'Meja 5 - sample cart dari seed',
          status: 'ACTIVE',
        },
      })

      // Hapus item lama agar upsert idempoten
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })

      // Tambahkan item dari produk yang tersedia
      for (let i = 0; i < sampleProducts.length; i++) {
        const p = sampleProducts[i]!
        await prisma.cartItem.create({
          data: {
            id: `seed-cartitem-00${i + 1}`,
            cartId: cart.id,
            productId: p.id,
            quantity: i === 0 ? 2 : 1,
            unitPrice: Number(p.price),
          },
        })
      }

      const itemCount = sampleProducts.length
      console.info(`✅ Sample Cart seeded: 1 cart ACTIVE (${itemCount} item)`)
    }
  }

  // ── Phase 3.3: Sample Orders ──────────────────────────────────────────────
  {
    // Ambil produk untuk di-snapshot ke order
    const orderProducts = await prisma.product.findMany({
      where: { outletId: outlet.id, isActive: true, deletedAt: null },
      select: { id: true, name: true, sku: true, price: true },
      take: 4,
      orderBy: { createdAt: 'asc' },
    })

    if (orderProducts.length >= 2) {
      // ── Order 1: PAID (sudah dibayar) ────────────────────────────────────
      const order1 = await prisma.order.upsert({
        where: { id: 'seed-order-001' },
        update: {},
        create: {
          id: 'seed-order-001',
          orderNumber: 'TRX-20260101-0001',
          outletId: outlet.id,
          userId: admin.id,
          status: 'PAID',
          subtotal: 70000,
          discountAmount: 0,
          discountedSubtotal: 70000,
          serviceChargeAmount: 0,
          taxAmount: 7700,
          roundingAmount: 300,
          total: 78000,
          notes: 'Order contoh — sudah dibayar',
          paidAt: new Date('2026-01-01T10:00:00.000Z'),
        },
      })

      // Items order 1
      const p1 = orderProducts[0]!
      const p2 = orderProducts[1]!
      await prisma.orderItem.upsert({
        where: { id: 'seed-oi-001-1' },
        update: {},
        create: {
          id: 'seed-oi-001-1',
          orderId: order1.id,
          productId: p1.id,
          productName: p1.name,
          productSku: p1.sku,
          quantity: 1,
          unitPrice: Number(p1.price),
          lineTotal: Number(p1.price),
        },
      })
      await prisma.orderItem.upsert({
        where: { id: 'seed-oi-001-2' },
        update: {},
        create: {
          id: 'seed-oi-001-2',
          orderId: order1.id,
          productId: p2.id,
          productName: p2.name,
          productSku: p2.sku,
          quantity: 1,
          unitPrice: Number(p2.price),
          lineTotal: Number(p2.price),
        },
      })

      // ── Order 2: DONE (selesai) ────────────────────────────────────────
      const order2 = await prisma.order.upsert({
        where: { id: 'seed-order-002' },
        update: {},
        create: {
          id: 'seed-order-002',
          orderNumber: 'TRX-20260101-0002',
          outletId: outlet.id,
          userId: admin.id,
          status: 'DONE',
          discountId: 'seed-disc-001',
          discountName: 'Diskon Weekend 10%',
          discountCode: 'WEEKEND10',
          discountType: 'PERCENTAGE',
          discountScope: 'PER_BILL',
          discountValue: 10,
          subtotal: 100000,
          discountAmount: 10000,
          discountedSubtotal: 90000,
          serviceChargeAmount: 0,
          taxAmount: 9900,
          roundingAmount: 100,
          total: 100000,
          notes: 'Order dengan diskon WEEKEND10',
          paidAt: new Date('2026-01-01T11:00:00.000Z'),
          completedAt: new Date('2026-01-01T11:30:00.000Z'),
        },
      })
      if (orderProducts[2]) {
        const p3 = orderProducts[2]
        await prisma.orderItem.upsert({
          where: { id: 'seed-oi-002-1' },
          update: {},
          create: {
            id: 'seed-oi-002-1',
            orderId: order2.id,
            productId: p3.id,
            productName: p3.name,
            productSku: p3.sku,
            quantity: 2,
            unitPrice: Number(p3.price),
            lineTotal: Number(p3.price) * 2,
          },
        })
      }

      // ── Order 3: VOID (dibatalkan) ────────────────────────────────────
      await prisma.order.upsert({
        where: { id: 'seed-order-003' },
        update: {},
        create: {
          id: 'seed-order-003',
          orderNumber: 'TRX-20260102-0001',
          outletId: outlet.id,
          userId: admin.id,
          status: 'VOID',
          subtotal: 35000,
          discountAmount: 0,
          discountedSubtotal: 35000,
          serviceChargeAmount: 0,
          taxAmount: 3850,
          roundingAmount: 150,
          total: 39000,
          notes: 'Order dibatalkan pelanggan',
          voidReason: 'Pelanggan membatalkan pesanan',
          voidedAt: new Date('2026-01-02T09:00:00.000Z'),
          voidedById: admin.id,
        },
      })

      // ── Order 4: PENDING (menunggu pembayaran) ──────────────────────
      const order4 = await prisma.order.upsert({
        where: { id: 'seed-order-004' },
        update: {},
        create: {
          id: 'seed-order-004',
          orderNumber: 'TRX-20260103-0001',
          outletId: outlet.id,
          userId: admin.id,
          status: 'PENDING',
          subtotal: 63000,
          discountAmount: 0,
          discountedSubtotal: 63000,
          serviceChargeAmount: 0,
          taxAmount: 6930,
          roundingAmount: 70,
          total: 70000,
          notes: 'Order menunggu pembayaran',
        },
      })
      if (orderProducts[0]) {
        await prisma.orderItem.upsert({
          where: { id: 'seed-oi-004-1' },
          update: {},
          create: {
            id: 'seed-oi-004-1',
            orderId: order4.id,
            productId: orderProducts[0].id,
            productName: orderProducts[0].name,
            productSku: orderProducts[0].sku,
            quantity: 2,
            unitPrice: Number(orderProducts[0].price),
            lineTotal: Number(orderProducts[0].price) * 2,
          },
        })
      }

      console.info('✅ Orders seeded: 4 order (1 PENDING, 1 PAID, 1 DONE, 1 VOID)')
    }
  }

  // ── Phase 3.4: Sample Receipts ────────────────────────────────────────────
  {
    // Receipt untuk seed-order-001 (PAID) — status READY (simulasi sudah selesai)
    await prisma.receipt.upsert({
      where: { orderId: 'seed-order-001' },
      update: {},
      create: {
        id: 'seed-receipt-001',
        orderId: 'seed-order-001',
        outletId: outlet.id,
        status: 'READY',
        pdfUrl: '/uploads/receipts/receipt-TRX-20260101-0001-seed.pdf',
        jobId: 'seed-job-001',
        attempts: 1,
      },
    })

    // Receipt untuk seed-order-002 (DONE) — status READY
    await prisma.receipt.upsert({
      where: { orderId: 'seed-order-002' },
      update: {},
      create: {
        id: 'seed-receipt-002',
        orderId: 'seed-order-002',
        outletId: outlet.id,
        status: 'READY',
        pdfUrl: '/uploads/receipts/receipt-TRX-20260101-0002-seed.pdf',
        jobId: 'seed-job-002',
        attempts: 1,
      },
    })

    // Receipt untuk seed-order-003 (VOID) — status FAILED (simulasi generate gagal)
    await prisma.receipt.upsert({
      where: { orderId: 'seed-order-003' },
      update: {},
      create: {
        id: 'seed-receipt-003',
        orderId: 'seed-order-003',
        outletId: outlet.id,
        status: 'FAILED',
        jobId: 'seed-job-003',
        errorMessage: 'Simulated failure for seed data',
        attempts: 3,
      },
    })

    // seed-order-004 (PENDING) — belum ada receipt (belum di-request)

    console.info('✅ Receipts seeded: 3 receipt (2 READY, 1 FAILED)')
  }

  // ── Phase 3.5: Sample Payments ────────────────────────────────────────────
  {
    // Payment untuk seed-order-001 (PAID) — status SETTLEMENT
    await prisma.payment.upsert({
      where: { orderId: 'seed-order-001' },
      update: {},
      create: {
        id: 'seed-payment-001',
        orderId: 'seed-order-001',
        outletId: outlet.id,
        midtransOrderId: 'TRX-20260101-0001-1735689600000',
        midtransTransactionId: 'seed-midtrans-txn-001',
        paymentType: 'bank_transfer',
        bankName: 'bca',
        vaNumber: '1234567890123456',
        grossAmount: 78000,
        status: 'SETTLEMENT',
        midtransTransactionTime: new Date('2026-01-01T03:00:00.000Z'),
        midtransSettlementTime: new Date('2026-01-01T03:05:00.000Z'),
        paidAt: new Date('2026-01-01T03:05:00.000Z'),
      },
    })

    // Payment untuk seed-order-002 (DONE) — status SETTLEMENT
    await prisma.payment.upsert({
      where: { orderId: 'seed-order-002' },
      update: {},
      create: {
        id: 'seed-payment-002',
        orderId: 'seed-order-002',
        outletId: outlet.id,
        midtransOrderId: 'TRX-20260101-0002-1735693200000',
        midtransTransactionId: 'seed-midtrans-txn-002',
        paymentType: 'bank_transfer',
        bankName: 'bni',
        vaNumber: '9876543210987654',
        grossAmount: 100000,
        status: 'SETTLEMENT',
        midtransTransactionTime: new Date('2026-01-01T04:00:00.000Z'),
        midtransSettlementTime: new Date('2026-01-01T04:10:00.000Z'),
        paidAt: new Date('2026-01-01T04:10:00.000Z'),
      },
    })

    // Payment untuk seed-order-004 (PENDING) — status PENDING, menunggu pembayaran
    await prisma.payment.upsert({
      where: { orderId: 'seed-order-004' },
      update: {},
      create: {
        id: 'seed-payment-004',
        orderId: 'seed-order-004',
        outletId: outlet.id,
        midtransOrderId: 'TRX-20260103-0001-1735862400000',
        paymentType: 'bank_transfer',
        bankName: 'bri',
        vaNumber: '5555666677778888',
        grossAmount: 70000,
        status: 'PENDING',
        midtransTransactionTime: new Date('2026-01-03T02:00:00.000Z'),
        midtransExpireTime: new Date('2026-01-04T02:00:00.000Z'),
      },
    })

    // seed-order-003 (VOID) — tidak punya payment (dibatalkan sebelum bayar)

    console.info('✅ Payments seeded: 3 payment (2 SETTLEMENT, 1 PENDING)')
  }

  // ── Phase 4.1: Loyalty Program ────────────────────────────────────────────
  {
    await prisma.loyaltyProgram.upsert({
      where: { outletId: outlet.id },
      update: {},
      create: {
        outletId: outlet.id,
        name: 'Poin Setia',
        description: 'Kumpulkan poin dari setiap transaksi dan tukarkan dengan diskon belanja.',
        isActive: true,
        pointsPerRupiah: 1, // 1 poin per Rp 1
        minimumSpend: 10000, // minimal transaksi Rp 10.000
        pointValue: 100, // 1 poin = Rp 100
        minimumRedeemPoints: 50, // minimal redeem 50 poin
        pointExpiryDays: 365, // poin expired dalam 1 tahun
      },
    })
    console.info('✅ Loyalty Program seeded: "Poin Setia"')
  }

  // ── Phase 4.2: Sample Customers ───────────────────────────────────────────
  {
    const customers = [
      {
        id: 'seed-cust-001',
        name: 'Andi Wijaya',
        email: 'andi.wijaya@email.com',
        phone: '081234567801',
        birthDate: new Date('1990-03-15'),
        address: 'Jl. Sudirman No. 10, Jakarta Pusat',
        notes: 'Pelanggan VIP, suka kopi tanpa gula',
        isActive: true,
      },
      {
        id: 'seed-cust-002',
        name: 'Sari Dewi',
        email: 'sari.dewi@email.com',
        phone: '081234567802',
        birthDate: new Date('1995-08-22'),
        address: 'Jl. Thamrin No. 5, Jakarta Pusat',
        notes: 'Alergi susu sapi',
        isActive: true,
      },
      {
        id: 'seed-cust-003',
        name: 'Budi Hartono',
        email: 'budi.hartono@email.com',
        phone: '081234567803',
        birthDate: new Date('1985-12-01'),
        isActive: true,
      },
      {
        id: 'seed-cust-004',
        name: 'Maya Sari',
        phone: '081234567804',
        birthDate: new Date('2000-06-17'),
        isActive: true,
      },
      {
        id: 'seed-cust-005',
        name: 'Rizky Pratama',
        email: 'rizky.pratama@email.com',
        phone: '081234567805',
        isActive: false,
        notes: 'Akun dinonaktifkan atas permintaan customer',
      },
    ]

    for (const cust of customers) {
      await prisma.customer.upsert({
        where: { id: cust.id },
        update: {},
        create: { ...cust, outletId: outlet.id },
      })
    }
    console.info(`✅ Customers seeded: ${customers.length} customer (4 aktif, 1 nonaktif)`)
  }

  // ── Phase 4.3: Sample Loyalty Transactions ────────────────────────────────
  {
    // Helper: hitung expiry dari sekarang + 365 hari
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 365)

    const loyaltyTxs = [
      // ── Andi Wijaya (seed-cust-001) — punya banyak poin ──────────────────
      {
        id: 'seed-ltx-001',
        customerId: 'seed-cust-001',
        type: 'EARN' as const,
        points: 780,
        pointsBefore: 0,
        pointsAfter: 780,
        rupiah: 78000,
        description: 'Poin dari transaksi TRX-20260101-0001',
        orderId: 'seed-order-001',
        expiresAt,
      },
      {
        id: 'seed-ltx-002',
        customerId: 'seed-cust-001',
        type: 'EARN' as const,
        points: 1000,
        pointsBefore: 780,
        pointsAfter: 1780,
        rupiah: 100000,
        description: 'Poin dari transaksi TRX-20260101-0002',
        orderId: 'seed-order-002',
        expiresAt,
      },
      {
        id: 'seed-ltx-003',
        customerId: 'seed-cust-001',
        type: 'REDEEM' as const,
        points: -200,
        pointsBefore: 1780,
        pointsAfter: 1580,
        rupiah: 20000,
        description: 'Redeem 200 poin = Rp 20.000',
      },
      {
        id: 'seed-ltx-004',
        customerId: 'seed-cust-001',
        type: 'ADJUST' as const,
        points: 100,
        pointsBefore: 1580,
        pointsAfter: 1680,
        description: 'Penyesuaian manual — bonus ulang tahun',
      },

      // ── Sari Dewi (seed-cust-002) — poin moderat ─────────────────────────
      {
        id: 'seed-ltx-005',
        customerId: 'seed-cust-002',
        type: 'EARN' as const,
        points: 390,
        pointsBefore: 0,
        pointsAfter: 390,
        rupiah: 39000,
        description: 'Poin pertama dari transaksi',
        expiresAt,
      },
      {
        id: 'seed-ltx-006',
        customerId: 'seed-cust-002',
        type: 'REDEEM' as const,
        points: -100,
        pointsBefore: 390,
        pointsAfter: 290,
        rupiah: 10000,
        description: 'Redeem 100 poin = Rp 10.000',
      },

      // ── Budi Hartono (seed-cust-003) — baru bergabung ────────────────────
      {
        id: 'seed-ltx-007',
        customerId: 'seed-cust-003',
        type: 'EARN' as const,
        points: 700,
        pointsBefore: 0,
        pointsAfter: 700,
        rupiah: 70000,
        description: 'Poin dari transaksi perdana',
        expiresAt,
      },

      // ── Maya Sari (seed-cust-004) — poin expired simulation ───────────────
      {
        id: 'seed-ltx-008',
        customerId: 'seed-cust-004',
        type: 'EARN' as const,
        points: 500,
        pointsBefore: 0,
        pointsAfter: 500,
        rupiah: 50000,
        description: 'Poin dari transaksi lama',
        expiresAt: new Date('2025-01-01'), // sudah expired
      },
      {
        id: 'seed-ltx-009',
        customerId: 'seed-cust-004',
        type: 'EXPIRE' as const,
        points: -500,
        pointsBefore: 500,
        pointsAfter: 0,
        description: 'Poin expired otomatis',
      },
    ]

    for (const tx of loyaltyTxs) {
      const { orderId, expiresAt: ea, ...rest } = tx
      await prisma.loyaltyTransaction.upsert({
        where: { id: tx.id },
        update: {},
        create: {
          ...rest,
          outletId: outlet.id,
          ...(orderId ? { orderId } : {}),
          ...(ea ? { expiresAt: ea } : {}),
        },
      })
    }

    console.info(`✅ Loyalty Transactions seeded: ${loyaltyTxs.length} transaksi poin`)
    console.info('   Saldo poin:')
    console.info('     Andi Wijaya  : 1.680 poin')
    console.info('     Sari Dewi    :   290 poin')
    console.info('     Budi Hartono :   700 poin')
    console.info('     Maya Sari    :     0 poin (expired)')
    console.info('     Rizky Pratama:     0 poin (nonaktif)')
  }

  // ── Phase 4.4: Link sample orders ke customers ────────────────────────────
  {
    // seed-order-001 → Andi Wijaya
    await prisma.order.updateMany({
      where: { id: 'seed-order-001' },
      data: { customerId: 'seed-cust-001' },
    })
    // seed-order-002 → Andi Wijaya
    await prisma.order.updateMany({
      where: { id: 'seed-order-002' },
      data: { customerId: 'seed-cust-001' },
    })
    // seed-order-004 → Sari Dewi
    await prisma.order.updateMany({
      where: { id: 'seed-order-004' },
      data: { customerId: 'seed-cust-002' },
    })
    console.info('✅ Sample orders linked ke customers')
  }

  {
    // Ambil product IDs dari seed yang sudah ada untuk PER_ITEM vouchers
    const kopiProduct = await prisma.product.findFirst({
      where: { sku: 'MNM-001', outletId: outlet.id },
      select: { id: true },
    })
    const rotiProduct = await prisma.product.findFirst({
      where: { sku: 'MKN-003', outletId: outlet.id },
      select: { id: true },
    })

    // Tanggal bantu
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    const yesterday = new Date(now.getTime() - 86400000)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const vouchers = [
      // ── 1. WELCOME10: Welcome discount 10% untuk member baru ──────────────
      {
        id: 'seed-vch-001',
        name: 'Welcome Discount 10%',
        code: 'WELCOME10',
        description: 'Diskon 10% untuk pembelian pertama member baru. Berlaku sekali per customer.',
        type: 'PERCENTAGE' as const,
        scope: 'PER_BILL' as const,
        value: 10,
        minPurchase: 50000,
        maxDiscount: 25000,
        usageLimit: null, // total tidak terbatas
        usageLimitPerCustomer: 1, // hanya sekali per customer
        autoApply: false,
        priority: 0,
        isActive: true,
        startAt: startOfMonth,
        endAt: nextMonth,
        productIds: [] as string[],
      },

      // ── 2. FLAT20K: Potongan langsung Rp 20.000 ───────────────────────────
      {
        id: 'seed-vch-002',
        name: 'Hemat Rp 20.000',
        code: 'FLAT20K',
        description: 'Potongan langsung Rp 20.000 untuk pembelian di atas Rp 100.000.',
        type: 'FIXED_AMOUNT' as const,
        scope: 'PER_BILL' as const,
        value: 20000,
        minPurchase: 100000,
        maxDiscount: null,
        usageLimit: 500, // max 500 kali total
        usageLimitPerCustomer: null,
        autoApply: false,
        priority: 0,
        isActive: true,
        startAt: null,
        endAt: null,
        productIds: [] as string[],
      },

      // ── 3. HAPPYHOUR: Auto-apply 15% saat spend >= Rp 75.000 ──────────────
      {
        id: 'seed-vch-003',
        name: 'Happy Hour 15%',
        code: null, // auto-apply, tidak butuh kode
        description:
          'Diskon 15% otomatis jika total belanja mencapai Rp 75.000. Berlaku hari ini saja.',
        type: 'PERCENTAGE' as const,
        scope: 'PER_BILL' as const,
        value: 15,
        minPurchase: 75000,
        maxDiscount: 30000,
        usageLimit: null,
        usageLimitPerCustomer: null,
        autoApply: true, // ← auto-apply tanpa kode
        priority: 10, // prioritas lebih tinggi dari default
        isActive: true,
        startAt: startOfMonth,
        endAt: nextMonth,
        productIds: [] as string[],
      },

      // ── 4. KOPI15: Diskon 15% khusus produk kopi (PER_ITEM) ───────────────
      {
        id: 'seed-vch-004',
        name: 'Diskon Kopi 15%',
        code: 'KOPI15',
        description: 'Diskon 15% untuk produk Es Kopi Susu dan Americano.',
        type: 'PERCENTAGE' as const,
        scope: 'PER_ITEM' as const,
        value: 15,
        minPurchase: null,
        maxDiscount: 20000,
        usageLimit: 200,
        usageLimitPerCustomer: 3,
        autoApply: false,
        priority: 0,
        isActive: true,
        startAt: null,
        endAt: nextMonth,
        productIds: [kopiProduct?.id].filter(Boolean) as string[],
      },

      // ── 5. Voucher spesifik untuk Budi Hartono (seed-cust-003) ─────────────
      {
        id: 'seed-vch-005',
        name: 'Voucher Spesial Budi',
        code: 'BUDI500',
        description: 'Voucher eksklusif Rp 5.000 untuk Budi Hartono. Sekali pakai.',
        type: 'FIXED_AMOUNT' as const,
        scope: 'PER_BILL' as const,
        value: 5000,
        minPurchase: null,
        maxDiscount: null,
        usageLimit: 1,
        usageLimitPerCustomer: 1,
        autoApply: false,
        priority: 0,
        customerId: 'seed-cust-003', // khusus Budi
        isActive: true,
        startAt: null,
        endAt: nextMonth,
        productIds: [] as string[],
      },

      // ── 6. ROTIBAKAR: Diskon Rp 3.000 per item Roti Bakar ─────────────────
      {
        id: 'seed-vch-006',
        name: 'Promo Roti Bakar -3K',
        code: 'ROTIBAKAR',
        description: 'Potongan Rp 3.000 per item Roti Bakar dalam satu transaksi.',
        type: 'FIXED_AMOUNT' as const,
        scope: 'PER_ITEM' as const,
        value: 3000,
        minPurchase: null,
        maxDiscount: null,
        usageLimit: null,
        usageLimitPerCustomer: null,
        autoApply: false,
        priority: 0,
        isActive: true,
        startAt: null,
        endAt: null,
        productIds: [rotiProduct?.id].filter(Boolean) as string[],
      },

      // ── 7. Auto-apply Rp 10.000 untuk spend >= Rp 150.000 ─────────────────
      {
        id: 'seed-vch-007',
        name: 'Cashback Rp 10.000',
        code: null,
        description: 'Hemat otomatis Rp 10.000 jika belanja minimal Rp 150.000.',
        type: 'FIXED_AMOUNT' as const,
        scope: 'PER_BILL' as const,
        value: 10000,
        minPurchase: 150000,
        maxDiscount: null,
        usageLimit: null,
        usageLimitPerCustomer: null,
        autoApply: true,
        priority: 5, // prioritas lebih rendah dari HAPPYHOUR
        isActive: true,
        startAt: null,
        endAt: null,
        productIds: [] as string[],
      },

      // ── 8. EXPIRED: Voucher yang sudah kadaluarsa ─────────────────────────
      {
        id: 'seed-vch-008',
        name: 'Flash Sale Kemarin',
        code: 'FLASHSALE',
        description: 'Voucher flash sale yang sudah berakhir.',
        type: 'PERCENTAGE' as const,
        scope: 'PER_BILL' as const,
        value: 25,
        minPurchase: null,
        maxDiscount: 50000,
        usageLimit: 100,
        usageLimitPerCustomer: 1,
        autoApply: false,
        priority: 0,
        isActive: false, // tidak aktif
        startAt: lastMonth,
        endAt: yesterday, // sudah expired
        productIds: [] as string[],
      },

      // ── 9. LIMIT1: Voucher yang usage limit-nya hampir habis ──────────────
      {
        id: 'seed-vch-009',
        name: 'Limited Promo 20%',
        code: 'LIMITED20',
        description: 'Voucher terbatas! Tersisa beberapa penggunaan.',
        type: 'PERCENTAGE' as const,
        scope: 'PER_BILL' as const,
        value: 20,
        minPurchase: 80000,
        maxDiscount: 40000,
        usageLimit: 5,
        usageLimitPerCustomer: 1,
        usageCount: 4, // sudah 4 dari 5 dipakai
        autoApply: false,
        priority: 0,
        isActive: true,
        startAt: null,
        endAt: nextMonth,
        productIds: [] as string[],
      },
    ]

    for (const vch of vouchers) {
      const {
        productIds,
        usageCount = 0,
        customerId,
        startAt,
        endAt,
        ...rest
      } = vch as typeof vch & {
        usageCount?: number
        customerId?: string
        startAt?: Date | null
        endAt?: Date | null
      }

      await prisma.voucher.upsert({
        where: { id: vch.id },
        update: {},
        create: {
          ...rest,
          usageCount,
          ...(customerId ? { customerId } : {}),
          ...(startAt ? { startAt } : {}),
          ...(endAt ? { endAt } : {}),
          outletId: outlet.id,
          ...(productIds.length
            ? { products: { create: productIds.map((pid) => ({ productId: pid })) } }
            : {}),
        },
      })
    }

    console.info(`✅ Vouchers seeded: ${vouchers.length} voucher`)
    console.info('   Breakdown:')
    console.info('     WELCOME10  — 10% PER_BILL, limit 1x/customer, periode bulanan')
    console.info('     FLAT20K    — -Rp20k PER_BILL, min Rp100k, max 500 penggunaan')
    console.info('     (auto)     — 15% PER_BILL auto-apply, min Rp75k, priority 10')
    console.info('     KOPI15     — 15% PER_ITEM khusus kopi, limit 3x/customer')
    console.info('     BUDI500    — -Rp5k khusus Budi Hartono, sekali pakai')
    console.info('     ROTIBAKAR  — -Rp3k PER_ITEM per roti bakar')
    console.info('     (auto)     — -Rp10k PER_BILL auto-apply, min Rp150k, priority 5')
    console.info('     FLASHSALE  — expired/inactive (untuk testing)')
    console.info('     LIMITED20  — 20% PER_BILL, sisa 1 penggunaan dari 5')
  }

  // ── Phase 4.1: Sample Voucher Redemptions ─────────────────────────────────
  {
    // Andi Wijaya sudah pakai WELCOME10 di order-001
    await prisma.voucherRedemption.upsert({
      where: { id: 'seed-vrd-001' },
      update: {},
      create: {
        id: 'seed-vrd-001',
        voucherId: 'seed-vch-001',
        outletId: outlet.id,
        customerId: 'seed-cust-001',
        orderId: 'seed-order-001',
        discountAmount: 7800, // 10% dari 78000
        redeemedAt: new Date('2026-01-01T10:00:00.000Z'),
      },
    })
    // Update usageCount WELCOME10 jadi 1
    await prisma.voucher.update({
      where: { id: 'seed-vch-001' },
      data: { usageCount: 1 },
    })

    // Sari Dewi pakai FLAT20K di order-004
    await prisma.voucherRedemption.upsert({
      where: { id: 'seed-vrd-002' },
      update: {},
      create: {
        id: 'seed-vrd-002',
        voucherId: 'seed-vch-002',
        outletId: outlet.id,
        customerId: 'seed-cust-002',
        orderId: 'seed-order-004',
        discountAmount: 20000,
        redeemedAt: new Date('2026-01-03T02:00:00.000Z'),
      },
    })
    // Update usageCount FLAT20K
    await prisma.voucher.update({
      where: { id: 'seed-vch-002' },
      data: { usageCount: 1 },
    })

    // Link order-001 ke voucher WELCOME10 (update snapshot di order)
    await prisma.order.updateMany({
      where: { id: 'seed-order-001' },
      data: {
        voucherId: 'seed-vch-001',
        voucherCode: 'WELCOME10',
        voucherName: 'Welcome Discount 10%',
        voucherType: 'PERCENTAGE',
        voucherScope: 'PER_BILL',
        voucherValue: 10,
        voucherDiscountAmount: 7800,
      },
    })

    console.info('✅ Voucher Redemptions seeded: 2 redemption')
    console.info('   WELCOME10 dipakai Andi Wijaya di order-001 (-Rp 7.800)')
    console.info('   FLAT20K   dipakai Sari Dewi di order-004 (-Rp 20.000)')
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
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
