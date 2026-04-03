-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CHECKED_OUT', 'ABANDONED');

-- CreateTable
CREATE TABLE "carts" (
    "id"        TEXT         NOT NULL,
    "outletId"  TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "notes"     TEXT,
    "status"    "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id"        TEXT         NOT NULL,
    "cartId"    TEXT         NOT NULL,
    "productId" TEXT         NOT NULL,
    "variantId" TEXT,
    "quantity"  DECIMAL(10,3) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_modifiers" (
    "id"         TEXT          NOT NULL,
    "cartItemId" TEXT          NOT NULL,
    "modifierId" TEXT          NOT NULL,
    "name"       TEXT          NOT NULL,
    "price"      DECIMAL(15,2) NOT NULL,

    CONSTRAINT "cart_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carts_outletId_userId_status_idx" ON "carts"("outletId", "userId", "status");
CREATE INDEX "carts_userId_idx"                  ON "carts"("userId");
CREATE INDEX "cart_items_cartId_idx"             ON "cart_items"("cartId");
CREATE INDEX "cart_items_productId_idx"          ON "cart_items"("productId");
CREATE INDEX "cart_item_modifiers_cartItemId_idx" ON "cart_item_modifiers"("cartItemId");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_outletId_fkey"
    FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "carts" ADD CONSTRAINT "carts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey"
    FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cart_item_modifiers" ADD CONSTRAINT "cart_item_modifiers_cartItemId_fkey"
    FOREIGN KEY ("cartItemId") REFERENCES "cart_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_item_modifiers" ADD CONSTRAINT "cart_item_modifiers_modifierId_fkey"
    FOREIGN KEY ("modifierId") REFERENCES "product_modifiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
