/*
  Warnings:

  - You are about to drop the column `rating` on the `ProjectFeedback` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProjectFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "from" TEXT,
    "release" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "ProjectFeedback_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProjectFeedback" ("createdAt", "deletedAt", "from", "id", "message", "projectId") SELECT "createdAt", "deletedAt", "from", "id", "message", "projectId" FROM "ProjectFeedback";
DROP TABLE "ProjectFeedback";
ALTER TABLE "new_ProjectFeedback" RENAME TO "ProjectFeedback";
CREATE INDEX "ProjectFeedback_projectId_idx" ON "ProjectFeedback"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
