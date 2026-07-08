-- AlterTable: external-source linkage for synced tasks (e.g. Azure DevOps)
ALTER TABLE "Task" ADD COLUMN "source" TEXT;
ALTER TABLE "Task" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Task" ADD COLUMN "externalUrl" TEXT;

-- CreateIndex: dedupe synced items by (source, externalId). SQLite treats NULLs
-- as distinct, so in-app tasks (source NULL) are unaffected.
CREATE UNIQUE INDEX "Task_source_externalId_key" ON "Task"("source", "externalId");
