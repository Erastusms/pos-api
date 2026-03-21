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
  // User management
  { resource: 'user', action: 'create', description: 'Buat user baru' },
  { resource: 'user', action: 'read', description: 'Lihat data user' },
  { resource: 'user', action: 'update', description: 'Edit data user' },
  { resource: 'user', action: 'delete', description: 'Hapus user' },

  // Outlet management
  { resource: 'outlet', action: 'create', description: 'Buat outlet baru' },
  { resource: 'outlet', action: 'read', description: 'Lihat data outlet' },
  { resource: 'outlet', action: 'update', description: 'Edit data outlet' },
  { resource: 'outlet', action: 'delete', description: 'Hapus outlet' },

  // Product catalog
  { resource: 'product', action: 'create', description: 'Tambah produk' },
  { resource: 'product', action: 'read', description: 'Lihat produk' },
  { resource: 'product', action: 'update', description: 'Edit produk' },
  { resource: 'product', action: 'delete', description: 'Hapus produk' },

  // Inventory
  { resource: 'inventory', action: 'create', description: 'Tambah stok' },
  { resource: 'inventory', action: 'read', description: 'Lihat stok' },
  { resource: 'inventory', action: 'update', description: 'Sesuaikan stok' },

  // Transaction
  { resource: 'transaction', action: 'create', description: 'Buat transaksi baru' },
  { resource: 'transaction', action: 'read', description: 'Lihat riwayat transaksi' },
  { resource: 'transaction', action: 'void', description: 'Batalkan transaksi' },

  // Customer (CRM)
  { resource: 'customer', action: 'create', description: 'Tambah pelanggan' },
  { resource: 'customer', action: 'read', description: 'Lihat data pelanggan' },
  { resource: 'customer', action: 'update', description: 'Edit data pelanggan' },
  { resource: 'customer', action: 'delete', description: 'Hapus pelanggan' },

  // Employee
  { resource: 'employee', action: 'create', description: 'Tambah karyawan' },
  { resource: 'employee', action: 'read', description: 'Lihat data karyawan' },
  { resource: 'employee', action: 'update', description: 'Edit data karyawan' },
  { resource: 'employee', action: 'delete', description: 'Hapus karyawan' },

  // Discount & Promo
  { resource: 'discount', action: 'create', description: 'Buat diskon/promo' },
  { resource: 'discount', action: 'read', description: 'Lihat diskon/promo' },
  { resource: 'discount', action: 'update', description: 'Edit diskon/promo' },
  { resource: 'discount', action: 'delete', description: 'Hapus diskon/promo' },

  // Reports
  { resource: 'report', action: 'read', description: 'Lihat laporan' },
  { resource: 'report', action: 'export', description: 'Ekspor laporan' },
]

// ─── Role → Permission mapping ────────────────────────────────────────────────

type PermissionRef = { resource: string; action: string }

const allPermissions: PermissionRef[] = PERMISSIONS

const ROLE_PERMISSIONS: Record<string, PermissionRef[]> = {
  SUPER_ADMIN: allPermissions,
  OWNER: allPermissions,
  MANAGER: [
    // Product
    { resource: 'product', action: 'create' },
    { resource: 'product', action: 'read' },
    { resource: 'product', action: 'update' },
    // Inventory
    { resource: 'inventory', action: 'create' },
    { resource: 'inventory', action: 'read' },
    { resource: 'inventory', action: 'update' },
    // Transaction
    { resource: 'transaction', action: 'create' },
    { resource: 'transaction', action: 'read' },
    { resource: 'transaction', action: 'void' },
    // Customer
    { resource: 'customer', action: 'create' },
    { resource: 'customer', action: 'read' },
    { resource: 'customer', action: 'update' },
    // Employee (read only)
    { resource: 'employee', action: 'read' },
    // Discount
    { resource: 'discount', action: 'create' },
    { resource: 'discount', action: 'read' },
    { resource: 'discount', action: 'update' },
    // Report
    { resource: 'report', action: 'read' },
    { resource: 'report', action: 'export' },
  ],
  CASHIER: [
    // Product (read only — for display at POS)
    { resource: 'product', action: 'read' },
    // Transaction (cashier's core job)
    { resource: 'transaction', action: 'create' },
    { resource: 'transaction', action: 'read' },
    // Customer (register & identify)
    { resource: 'customer', action: 'create' },
    { resource: 'customer', action: 'read' },
    // Discount (apply existing discounts)
    { resource: 'discount', action: 'read' },
  ],
}

// ─── Main seed function ───────────────────────────────────────────────────────

async function main() {
  console.info('🌱 Starting database seed...\n')

  // 1. Seed roles
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: { displayName: role.displayName, description: role.description },
      create: role,
    })
  }
  console.info(`✅ Roles seeded: ${ROLES.map((r) => r.name).join(', ')}`)

  // 2. Seed permissions
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { resource_action: { resource: perm.resource, action: perm.action } },
      update: { description: perm.description },
      create: perm,
    })
  }
  console.info(`✅ Permissions seeded: ${PERMISSIONS.length} permissions`)

  // 3. Assign permissions to roles
  const dbPermissions = await prisma.permission.findMany()

  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } })
    if (!role) continue

    let assigned = 0
    for (const perm of perms) {
      const permission = dbPermissions.find(
        (p) => p.resource === perm.resource && p.action === perm.action,
      )
      if (!permission) continue

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      })
      assigned++
    }
    console.info(`   ${roleName}: ${assigned} permissions assigned`)
  }
  console.info('✅ Role permissions seeded')

  // 4. Create default outlet
  const defaultOutlet = await prisma.outlet.upsert({
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
  console.info(`✅ Default outlet: "${defaultOutlet.name}"`)

  // 5. Create super admin user
  const adminPassword = await bcrypt.hash('Admin@123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@pos.com' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'admin@pos.com',
      password: adminPassword,
      roleId: 1, // SUPER_ADMIN
      outletId: defaultOutlet.id,
      isActive: true,
    },
  })
  console.info(`✅ Super admin created: ${admin.email}`)

  // 6. Create sample owner user
  const ownerPassword = await bcrypt.hash('Owner@123', 12)
  await prisma.user.upsert({
    where: { email: 'owner@pos.com' },
    update: {},
    create: {
      name: 'Demo Owner',
      email: 'owner@pos.com',
      password: ownerPassword,
      roleId: 2, // OWNER
      outletId: defaultOutlet.id,
      isActive: true,
    },
  })
  console.info('✅ Demo owner created: owner@pos.com')

  console.info('\n🎉 Seed completed successfully!\n')
  console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.info('  Test credentials:')
  console.info('  Super Admin : admin@pos.com  / Admin@123')
  console.info('  Owner       : owner@pos.com  / Owner@123')
  console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
