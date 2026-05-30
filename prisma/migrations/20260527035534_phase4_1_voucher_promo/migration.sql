-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "VoucherScope" AS ENUM ('PER_BILL', 'PER_ITEM');

-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "voucherId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "voucherCode" TEXT,
ADD COLUMN     "voucherDiscountAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "voucherId" TEXT,
ADD COLUMN     "voucherName" TEXT,
ADD COLUMN     "voucherScope" TEXT,
ADD COLUMN     "voucherType" TEXT,
ADD COLUMN     "voucherValue" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "type" "VoucherType" NOT NULL,
    "scope" "VoucherScope" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "minPurchase" DECIMAL(15,2),
    "maxDiscount" DECIMAL(15,2),
    "usageLimit" INTEGER,
    "usageLimitPerCustomer" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "autoApply" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "customerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_products" (
    "voucherId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "voucher_products_pkey" PRIMARY KEY ("voucherId","productId")
);

-- CreateTable
CREATE TABLE "voucher_redemptions" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "customerId" TEXT,
    "orderId" TEXT,
    "discountAmount" DECIMAL(15,2) NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vouchers_outletId_isActive_idx" ON "vouchers"("outletId", "isActive");

-- CreateIndex
CREATE INDEX "vouchers_outletId_autoApply_isActive_idx" ON "vouchers"("outletId", "autoApply", "isActive");

-- CreateIndex
CREATE INDEX "vouchers_code_idx" ON "vouchers"("code");

-- CreateIndex
CREATE INDEX "vouchers_customerId_idx" ON "vouchers"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_outletId_key" ON "vouchers"("code", "outletId");

-- CreateIndex
CREATE INDEX "voucher_products_voucherId_idx" ON "voucher_products"("voucherId");

-- CreateIndex
CREATE INDEX "voucher_products_productId_idx" ON "voucher_products"("productId");

-- CreateIndex
CREATE INDEX "voucher_redemptions_voucherId_idx" ON "voucher_redemptions"("voucherId");

-- CreateIndex
CREATE INDEX "voucher_redemptions_customerId_idx" ON "voucher_redemptions"("customerId");

-- CreateIndex
CREATE INDEX "voucher_redemptions_orderId_idx" ON "voucher_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "voucher_redemptions_outletId_idx" ON "voucher_redemptions"("outletId");

-- CreateIndex
CREATE INDEX "voucher_redemptions_redeemedAt_idx" ON "voucher_redemptions"("redeemedAt");

-- CreateIndex
CREATE INDEX "carts_voucherId_idx" ON "carts"("voucherId");

-- CreateIndex
CREATE INDEX "orders_voucherId_idx" ON "orders"("voucherId");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_products" ADD CONSTRAINT "voucher_products_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_products" ADD CONSTRAINT "voucher_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
