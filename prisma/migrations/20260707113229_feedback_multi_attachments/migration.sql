/*
  Warnings:

  - You are about to drop the column `fileData` on the `ProjectFeedback` table. All the data in the column will be lost.
  - You are about to drop the column `fileMime` on the `ProjectFeedback` table. All the data in the column will be lost.
  - You are about to drop the column `fileName` on the `ProjectFeedback` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "FeedbackAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feedbackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackAttachment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "ProjectFeedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
INSERT INTO "new_ProjectFeedback" ("createdAt", "deletedAt", "from", "id", "message", "projectId", "release") SELECT "createdAt", "deletedAt", "from", "id", "message", "projectId", "release" FROM "ProjectFeedback";
DROP TABLE "ProjectFeedback";
ALTER TABLE "new_ProjectFeedback" RENAME TO "ProjectFeedback";
CREATE INDEX "ProjectFeedback_projectId_idx" ON "ProjectFeedback"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FeedbackAttachment_feedbackId_idx" ON "FeedbackAttachment"("feedbackId");
