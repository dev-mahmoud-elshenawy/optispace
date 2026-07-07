-- AlterTable
ALTER TABLE "Leave" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "deletedAt" DATETIME;
