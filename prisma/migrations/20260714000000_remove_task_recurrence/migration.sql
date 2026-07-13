-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "dueDate" DATETIME,
    "source" TEXT,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "workItemType" TEXT,
    "adoPriority" INTEGER,
    "iterationPath" TEXT,
    "effort" REAL,
    "changedDate" DATETIME,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("adoPriority", "changedDate", "createdAt", "deletedAt", "description", "dueDate", "effort", "externalId", "externalUrl", "id", "iterationPath", "order", "priority", "projectId", "source", "status", "title", "updatedAt", "workItemType") SELECT "adoPriority", "changedDate", "createdAt", "deletedAt", "description", "dueDate", "effort", "externalId", "externalUrl", "id", "iterationPath", "order", "priority", "projectId", "source", "status", "title", "updatedAt", "workItemType" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE UNIQUE INDEX "Task_source_externalId_key" ON "Task"("source", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
