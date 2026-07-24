-- AlterTable
ALTER TABLE "AdoConfig" ADD COLUMN "lastError" TEXT;
ALTER TABLE "AdoConfig" ADD COLUMN "lastSyncedAt" DATETIME;

-- AlterTable
ALTER TABLE "CalendarConfig" ADD COLUMN "lastError" TEXT;
ALTER TABLE "CalendarConfig" ADD COLUMN "lastSyncedAt" DATETIME;

-- AlterTable
ALTER TABLE "GithubAuth" ADD COLUMN "lastError" TEXT;
ALTER TABLE "GithubAuth" ADD COLUMN "lastSyncedAt" DATETIME;
