/*
  Warnings:

  - You are about to drop the column `code` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `gender` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `isMember` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `lastTransactionAt` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `totalPoints` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `totalSpent` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `totalTransactions` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the `customer_loyalty_histories` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[phone,outletId]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email,outletId]` on the table `customers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'EXPIRE', 'ADJUST', 'REFUND');

-- DropForeignKey
ALTER TABLE "customer_loyalty_histories" DROP CONSTRAINT "customer_loyalty_histories_customerId_fkey";

-- DropForeignKey
ALTER TABLE "customer_loyalty_histories" DROP CONSTRAINT "customer_loyalty_histories_orderId_fkey";

-- DropIndex
DROP INDEX "customers_code_outletId_key";

-- DropIndex
DROP INDEX "customers_email_idx";

-- DropIndex
DROP INDEX "customers_phone_idx";

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "code",
DROP COLUMN "gender",
DROP COLUMN "isMember",
DROP COLUMN "lastTransactionAt",
DROP COLUMN "totalPoints",
DROP COLUMN "totalSpent",
DROP COLUMN "totalTransactions",
ADD COLUMN     "address" TEXT;

-- DropTable
DROP TABLE "customer_loyalty_histories";

-- DropEnum
DROP TYPE "LoyaltyPointType";

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Program Loyalitas',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerRupiah" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "minimumSpend" DECIMAL(15,2) NOT NULL DEFAULT 10000,
    "pointValue" DECIMAL(10,4) NOT NULL DEFAULT 100,
    "minimumRedeemPoints" INTEGER NOT NULL DEFAULT 100,
    "pointExpiryDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "pointsBefore" INTEGER NOT NULL,
    "pointsAfter" INTEGER NOT NULL,
    "rupiah" DECIMAL(15,2),
    "description" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_programs_outletId_key" ON "loyalty_programs"("outletId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_customerId_idx" ON "loyalty_transactions"("customerId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_outletId_idx" ON "loyalty_transactions"("outletId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_orderId_idx" ON "loyalty_transactions"("orderId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_type_idx" ON "loyalty_transactions"("type");

-- CreateIndex
CREATE INDEX "loyalty_transactions_createdAt_idx" ON "loyalty_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "loyalty_transactions_expiresAt_idx" ON "loyalty_transactions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_outletId_key" ON "customers"("phone", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_outletId_key" ON "customers"("email", "outletId");

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
