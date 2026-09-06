-- Phase 18: Kalender/Termine-Grundfundament — siehe
-- docs/PHASE_18_CALENDAR_EVENTS_REPORT.md und docs/database/Database.md,
-- Entität "Event (Termin)".
--
-- Adds: `event`, sportneutral und nicht unter `football/` modelliert
-- (gleiches Muster wie `venue`, Phase 10). Gehört zu genau einem `team`
-- ODER genau einer `department` (nie beides, nie keines, per
-- CHECK-Constraint erzwungen — gleiches Muster wie
-- `tournament_participant_source_xor`, ADR 0008), optional einer `season`
-- und einem `venue` zugeordnet. Bewusst OHNE Attendance/Task/Notification
-- — eigenständige, weiterhin nicht implementierte Entitäten.

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TRAINING', 'MEETING', 'OTHER');

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT,
    "teamId" TEXT,
    "seasonId" TEXT,
    "venueId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "EventType" NOT NULL DEFAULT 'OTHER',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_tenantId_idx" ON "event"("tenantId");

-- CreateIndex
CREATE INDEX "event_departmentId_idx" ON "event"("departmentId");

-- CreateIndex
CREATE INDEX "event_teamId_idx" ON "event"("teamId");

-- CreateIndex
CREATE INDEX "event_seasonId_idx" ON "event"("seasonId");

-- CreateIndex
CREATE INDEX "event_venueId_idx" ON "event"("venueId");

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "department"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_tenantId_teamId_fkey" FOREIGN KEY ("tenantId", "teamId") REFERENCES "team"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_tenantId_seasonId_fkey" FOREIGN KEY ("tenantId", "seasonId") REFERENCES "season"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_tenantId_venueId_fkey" FOREIGN KEY ("tenantId", "venueId") REFERENCES "venue"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: ein Event gehört zu genau einem Team ODER genau einer
-- Department, nie beides, nie keines (Database.md: "Ein Event gehört zu
-- einem Team oder Department") — gleiches XOR-Muster wie
-- tournament_participant_source_xor.
-- ---------------------------------------------------------------------------

ALTER TABLE "event"
ADD CONSTRAINT event_scope_xor CHECK (
  ("teamId" IS NOT NULL AND "departmentId" IS NULL)
  OR
  ("teamId" IS NULL AND "departmentId" IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: ein Termin-Enddatum darf nicht vor dem Startdatum
-- liegen (anders als football_tournament_valid_date_range ist endsAt hier
-- verpflichtend, kein optionales Feld).
-- ---------------------------------------------------------------------------

ALTER TABLE "event"
ADD CONSTRAINT event_valid_date_range CHECK (
  "endsAt" >= "startsAt"
);

-- ---------------------------------------------------------------------------
-- Row-Level-Security (gleiches Muster wie 20260828120000_add_tournament_core).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  EXECUTE 'ALTER TABLE "event" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE "event" FORCE ROW LEVEL SECURITY';

  EXECUTE 'CREATE POLICY tenant_isolation_select ON "event" FOR SELECT USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
  EXECUTE 'CREATE POLICY tenant_isolation_insert ON "event" FOR INSERT WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
  EXECUTE 'CREATE POLICY tenant_isolation_update ON "event" FOR UPDATE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
  EXECUTE 'CREATE POLICY tenant_isolation_delete ON "event" FOR DELETE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
END $$;
