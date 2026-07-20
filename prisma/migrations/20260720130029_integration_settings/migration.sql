-- CreateTable
CREATE TABLE "AdoConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "orgUrl" TEXT,
    "pat" TEXT,
    "email" TEXT,
    "projects" TEXT NOT NULL DEFAULT '',
    "includeDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CalendarConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "icsUrl" TEXT,
    "reminderMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
