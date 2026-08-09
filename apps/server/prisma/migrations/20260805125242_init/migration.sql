-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "numbering" TEXT NOT NULL DEFAULT 'ROW_MAJOR',
    "startNumber" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rackId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    CONSTRAINT "Slot_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Wine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "producer" TEXT,
    "vintage" INTEGER,
    "color" TEXT,
    "country" TEXT,
    "region" TEXT,
    "appellation" TEXT,
    "grapes" TEXT NOT NULL DEFAULT '[]',
    "abv" REAL,
    "description" TEXT,
    "producerUrl" TEXT,
    "imageUrl" TEXT,
    "vivinoId" TEXT,
    "vivinoUrl" TEXT,
    "vivinoRating" REAL,
    "vivinoRatingCount" INTEGER,
    "priceAvg" REAL,
    "structure" TEXT NOT NULL DEFAULT '{}',
    "flavors" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dedupeKey" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "FoodTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "WineFoodTag" (
    "wineId" TEXT NOT NULL,
    "foodTagId" TEXT NOT NULL,

    PRIMARY KEY ("wineId", "foodTagId"),
    CONSTRAINT "WineFoodTag_wineId_fkey" FOREIGN KEY ("wineId") REFERENCES "Wine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WineFoodTag_foodTagId_fkey" FOREIGN KEY ("foodTagId") REFERENCES "FoodTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bottle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wineId" TEXT NOT NULL,
    "slotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_CELLAR',
    "addedById" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "drunkAt" DATETIME,
    "personalNote" TEXT,
    "personalRating" REAL,
    "purchasePrice" REAL,
    "labelPhotoPath" TEXT,
    CONSTRAINT "Bottle_wineId_fkey" FOREIGN KEY ("wineId") REFERENCES "Wine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bottle_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bottle_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiQuery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScrapeCache" (
    "url" TEXT NOT NULL PRIMARY KEY,
    "payload" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Slot_rackId_idx" ON "Slot"("rackId");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_rackId_number_key" ON "Slot"("rackId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_rackId_row_col_key" ON "Slot"("rackId", "row", "col");

-- CreateIndex
CREATE UNIQUE INDEX "Wine_vivinoId_key" ON "Wine"("vivinoId");

-- CreateIndex
CREATE UNIQUE INDEX "Wine_dedupeKey_key" ON "Wine"("dedupeKey");

-- CreateIndex
CREATE INDEX "Wine_color_idx" ON "Wine"("color");

-- CreateIndex
CREATE INDEX "Wine_region_idx" ON "Wine"("region");

-- CreateIndex
CREATE INDEX "Wine_vintage_idx" ON "Wine"("vintage");

-- CreateIndex
CREATE UNIQUE INDEX "FoodTag_slug_key" ON "FoodTag"("slug");

-- CreateIndex
CREATE INDEX "WineFoodTag_foodTagId_idx" ON "WineFoodTag"("foodTagId");

-- CreateIndex
CREATE INDEX "Bottle_wineId_idx" ON "Bottle"("wineId");

-- CreateIndex
CREATE INDEX "Bottle_slotId_idx" ON "Bottle"("slotId");

-- CreateIndex
CREATE INDEX "Bottle_status_idx" ON "Bottle"("status");

-- CreateIndex
CREATE INDEX "AiQuery_userId_createdAt_idx" ON "AiQuery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScrapeCache_fetchedAt_idx" ON "ScrapeCache"("fetchedAt");
