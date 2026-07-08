-- AlterTable: track the ADO iteration/sprint path on synced tasks
ALTER TABLE "Task" ADD COLUMN "iterationPath" TEXT;
