PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Une ancienne cave pouvait contenir les bouteilles de plusieurs comptes. On clone donc
-- chaque casier (et ses slots) une fois par propriétaire rencontré, puis on remappe chaque
-- bouteille vers sa copie. La migration reste sûre même hors du réamorçage prévu.
CREATE TEMP TABLE "_RackOwnerMap" (
    "oldRackId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "newRackId" TEXT NOT NULL,
    PRIMARY KEY ("oldRackId", "ownerId")
);

INSERT INTO "_RackOwnerMap" ("oldRackId", "ownerId", "newRackId")
SELECT DISTINCT
    r."id",
    b."addedById",
    r."id" || '__owner__' || b."addedById"
FROM "Rack" r
JOIN "Slot" s ON s."rackId" = r."id"
JOIN "Bottle" b ON b."slotId" = s."id";

-- Les casiers vides historiques reviennent au premier administrateur (ou premier compte).
INSERT INTO "_RackOwnerMap" ("oldRackId", "ownerId", "newRackId")
SELECT
    r."id",
    u."id",
    r."id" || '__owner__' || u."id"
FROM "Rack" r
JOIN "User" u ON u."id" = (
    SELECT candidate."id"
    FROM "User" candidate
    ORDER BY CASE WHEN candidate."role" = 'ADMIN' THEN 0 ELSE 1 END, candidate."createdAt" ASC
    LIMIT 1
)
WHERE NOT EXISTS (
    SELECT 1 FROM "_RackOwnerMap" mapping WHERE mapping."oldRackId" = r."id"
);

CREATE TABLE "new_Rack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "numbering" TEXT NOT NULL DEFAULT 'ROW_MAJOR',
    "startNumber" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rack_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Rack" ("id", "ownerId", "name", "rows", "cols", "numbering", "startNumber", "position", "createdAt")
SELECT
    mapping."newRackId", mapping."ownerId", r."name", r."rows", r."cols",
    r."numbering", r."startNumber", r."position", r."createdAt"
FROM "_RackOwnerMap" mapping
JOIN "Rack" r ON r."id" = mapping."oldRackId";

-- Tout compte historique qui ne possédait aucune bouteille reçoit aussi sa cave 6 × 10.
INSERT INTO "new_Rack" ("id", "ownerId", "name", "rows", "cols", "numbering", "startNumber", "position")
SELECT
    '__personal_default__' || u."id",
    u."id",
    'Ma cave',
    6,
    10,
    'ROW_MAJOR',
    1,
    COALESCE((SELECT MAX(existing."position") + 1 FROM "new_Rack" existing WHERE existing."ownerId" = u."id"), 0)
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "new_Rack" existing WHERE existing."ownerId" = u."id");

CREATE TABLE "new_Slot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rackId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    CONSTRAINT "Slot_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Slot" ("id", "rackId", "number", "row", "col")
SELECT
    s."id" || '__owner__' || mapping."ownerId",
    mapping."newRackId",
    s."number",
    s."row",
    s."col"
FROM "Slot" s
JOIN "_RackOwnerMap" mapping ON mapping."oldRackId" = s."rackId";

WITH RECURSIVE slot_number(n) AS (
    SELECT 0
    UNION ALL
    SELECT n + 1 FROM slot_number WHERE n < 59
)
INSERT INTO "new_Slot" ("id", "rackId", "number", "row", "col")
SELECT
    rack."id" || '__slot__' || slot_number.n,
    rack."id",
    slot_number.n + 1,
    CAST(slot_number.n / 10 AS INTEGER),
    slot_number.n % 10
FROM "new_Rack" rack
JOIN slot_number
WHERE rack."id" GLOB '__personal_default__*';

CREATE TABLE "new_Bottle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wineId" TEXT NOT NULL,
    "slotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_CELLAR',
    "ownerId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "drunkAt" DATETIME,
    "personalNote" TEXT,
    "personalRating" REAL,
    "purchasePrice" REAL,
    "labelPhotoPath" TEXT,
    CONSTRAINT "Bottle_wineId_fkey" FOREIGN KEY ("wineId") REFERENCES "Wine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bottle_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bottle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Bottle" ("id", "wineId", "slotId", "status", "ownerId", "addedAt", "drunkAt", "personalNote", "personalRating", "purchasePrice", "labelPhotoPath")
SELECT
    b."id",
    b."wineId",
    CASE
        WHEN b."slotId" IS NULL THEN NULL
        ELSE b."slotId" || '__owner__' || b."addedById"
    END,
    b."status",
    b."addedById",
    b."addedAt",
    b."drunkAt",
    b."personalNote",
    b."personalRating",
    b."purchasePrice",
    b."labelPhotoPath"
FROM "Bottle" b;

DROP TABLE "Bottle";
DROP TABLE "Slot";
DROP TABLE "Rack";
ALTER TABLE "new_Rack" RENAME TO "Rack";
ALTER TABLE "new_Slot" RENAME TO "Slot";
ALTER TABLE "new_Bottle" RENAME TO "Bottle";
DROP TABLE "_RackOwnerMap";

CREATE INDEX "Rack_ownerId_idx" ON "Rack"("ownerId");
CREATE INDEX "Slot_rackId_idx" ON "Slot"("rackId");
CREATE UNIQUE INDEX "Slot_rackId_number_key" ON "Slot"("rackId", "number");
CREATE UNIQUE INDEX "Slot_rackId_row_col_key" ON "Slot"("rackId", "row", "col");
CREATE INDEX "Bottle_wineId_idx" ON "Bottle"("wineId");
CREATE INDEX "Bottle_slotId_idx" ON "Bottle"("slotId");
CREATE INDEX "Bottle_ownerId_idx" ON "Bottle"("ownerId");
CREATE INDEX "Bottle_status_idx" ON "Bottle"("status");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
