-- CreateTable
CREATE TABLE "AdoIteration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "AdoIteration_project_idx" ON "AdoIteration"("project");

-- CreateIndex
CREATE UNIQUE INDEX "AdoIteration_project_path_key" ON "AdoIteration"("project", "path");
