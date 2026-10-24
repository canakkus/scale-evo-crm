-- Additive migration for planned cold calls and the personal calendar feed.
-- Does not UPDATE or DELETE existing lead rows.
--
-- prisma/migrations/ is gitignored in this repo. Apply once, either with:
--   npx prisma db execute --file prisma/sql/20261023_add_planned_calls.sql
-- or:
--   npx prisma db push
-- Do not run both against a database that already has these objects.

-- CreateEnum
CREATE TYPE "PlannedCallType" AS ENUM ('COLD_CALL', 'MEETING', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "PlannedCallStatus" AS ENUM ('PLANNED', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "calendarFeedToken" TEXT;

-- CreateTable
CREATE TABLE "PlannedCall" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 15,
    "reminderMinutes" INTEGER NOT NULL DEFAULT 15,
    "type" "PlannedCallType" NOT NULL DEFAULT 'COLD_CALL',
    "status" "PlannedCallStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannedCall_userId_startsAt_idx" ON "PlannedCall"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "PlannedCall_leadId_startsAt_idx" ON "PlannedCall"("leadId", "startsAt");

-- CreateIndex
CREATE INDEX "PlannedCall_userId_status_idx" ON "PlannedCall"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_calendarFeedToken_key" ON "User"("calendarFeedToken");

-- AddForeignKey
ALTER TABLE "PlannedCall" ADD CONSTRAINT "PlannedCall_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedCall" ADD CONSTRAINT "PlannedCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
