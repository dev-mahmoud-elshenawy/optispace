/*
  Warnings:

  - You are about to drop the column `accessToken` on the `GraphAuth` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `GraphAuth` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `GraphAuth` table. All the data in the column will be lost.
  - You are about to drop the column `scope` on the `GraphAuth` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GraphAuth" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "clientId" TEXT,
    "homeAccountId" TEXT,
    "account" TEXT,
    "cache" TEXT,
    "lastSyncedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_GraphAuth" ("account", "clientId", "createdAt", "id", "lastError", "lastSyncedAt", "updatedAt") SELECT "account", "clientId", "createdAt", "id", "lastError", "lastSyncedAt", "updatedAt" FROM "GraphAuth";
DROP TABLE "GraphAuth";
ALTER TABLE "new_GraphAuth" RENAME TO "GraphAuth";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
