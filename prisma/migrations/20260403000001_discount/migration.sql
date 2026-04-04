-- CreateEnum
CREATE TYPE "DiscountType"  AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
CREATE TYPE "DiscountScope" AS ENUM ('PER_ITEM', 'PER_BILL');

-- CreateTable: discounts
CREATE TABLE "discounts" (
    "id"          TEXT          NOT NULL,
    "outletId"    TEXT          NOT NULL,
    "name"        TEXT          NOT NULL,
    "code"        TEXT,
    "description" TEXT,
    "type"        "DiscountType"  NOT NULL,
    "scope"       "DiscountScope" NOT NULL,
    "value"       DECIMAL(10,2)   NOT NULL,
    "minPurchase" DECIMAL(15,2),
    "maxDiscount" DECIMAL(15,2),
    "isActive"    BOOLEAN       NOT NULL DEFAULT true,
    "startAt"     TIMESTAMP(3),
    "endAt"       TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)  NOT NULL,
    "deletedAt"   TIMESTAMP(3),

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: discount_products (junction)
CREATE TABLE "discount_products" (
    "discountId" TEXT NOT NULL,
    "productId"  TEXT NOT NULL,

    CONSTRAINT "discount_products_pkey" PRIMARY KEY ("discountId", "productId")
);

-- AlterTable: add discountId to carts
ALTER TABLE "carts" ADD COLUMN "discountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "discounts_code_outletId_key"    ON "discounts"("code", "outletId");
CREATE INDEX "discounts_outletId_isActive_idx"       ON "discounts"("outletId", "isActive");
CREATE INDEX "discounts_code_idx"                    ON "discounts"("code");
CREATE INDEX "discount_products_discountId_idx"      ON "discount_products"("discountId");
CREATE INDEX "discount_products_productId_idx"       ON "discount_products"("productId");
CREATE INDEX "carts_discountId_idx"                  ON "carts"("discountId");

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_outletId_fkey"
    FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_discountId_fkey"
    FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "carts" ADD CONSTRAINT "carts_discountId_fkey"
    FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
