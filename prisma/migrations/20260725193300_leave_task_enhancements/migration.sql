-- AlterTable
ALTER TABLE "Task" ADD COLUMN "recurrence" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Leave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Leave" ("createdAt", "deletedAt", "endDate", "id", "notes", "startDate", "type", "updatedAt") SELECT "createdAt", "deletedAt", "endDate", "id", "notes", "startDate", "type", "updatedAt" FROM "Leave";
DROP TABLE "Leave";
ALTER TABLE "new_Leave" RENAME TO "Leave";
CREATE INDEX "Leave_startDate_idx" ON "Leave"("startDate");
CREATE TABLE "new_LeaveAllowance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "totalDays" REAL NOT NULL,
    "carryOverDays" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_LeaveAllowance" ("createdAt", "id", "totalDays", "updatedAt", "year") SELECT "createdAt", "id", "totalDays", "updatedAt", "year" FROM "LeaveAllowance";
DROP TABLE "LeaveAllowance";
ALTER TABLE "new_LeaveAllowance" RENAME TO "LeaveAllowance";
CREATE UNIQUE INDEX "LeaveAllowance_year_key" ON "LeaveAllowance"("year");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
