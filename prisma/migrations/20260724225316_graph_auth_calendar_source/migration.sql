-- CreateTable
CREATE TABLE "GraphAuth" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "scope" TEXT,
    "account" TEXT,
    "lastSyncedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "location" TEXT,
    "meetingUrl" TEXT,
    "organizer" TEXT,
    "attendees" TEXT NOT NULL DEFAULT '[]',
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'ics',
    "externalId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_CalendarEvent" ("allDay", "attendees", "dedupeKey", "deletedAt", "end", "fingerprint", "id", "location", "meetingUrl", "organizer", "start", "title", "updatedAt") SELECT "allDay", "attendees", "dedupeKey", "deletedAt", "end", "fingerprint", "id", "location", "meetingUrl", "organizer", "start", "title", "updatedAt" FROM "CalendarEvent";
DROP TABLE "CalendarEvent";
ALTER TABLE "new_CalendarEvent" RENAME TO "CalendarEvent";
CREATE UNIQUE INDEX "CalendarEvent_dedupeKey_key" ON "CalendarEvent"("dedupeKey");
CREATE INDEX "CalendarEvent_start_idx" ON "CalendarEvent"("start");
CREATE INDEX "CalendarEvent_source_idx" ON "CalendarEvent"("source");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
