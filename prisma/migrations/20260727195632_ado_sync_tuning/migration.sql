-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdoConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "orgUrl" TEXT,
    "pat" TEXT,
    "email" TEXT,
    "projects" TEXT NOT NULL DEFAULT '',
    "includeDone" BOOLEAN NOT NULL DEFAULT false,
    "pollMinutes" INTEGER NOT NULL DEFAULT 2,
    "mentionLookbackDays" INTEGER NOT NULL DEFAULT 14,
    "lastSyncedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AdoConfig" ("createdAt", "email", "id", "includeDone", "lastError", "lastSyncedAt", "orgUrl", "pat", "projects", "updatedAt") SELECT "createdAt", "email", "id", "includeDone", "lastError", "lastSyncedAt", "orgUrl", "pat", "projects", "updatedAt" FROM "AdoConfig";
DROP TABLE "AdoConfig";
ALTER TABLE "new_AdoConfig" RENAME TO "AdoConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
