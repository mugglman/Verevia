-- Phase 19: Anwesenheit (Zu-/Absagen und tatsächliche Anwesenheit) — siehe
-- docs/PHASE_19_ATTENDANCE_REPORT.md und docs/database/Database.md, Entität
-- "Attendance (Anwesenheit)".
--
-- Adds: `attendance`, verknüpft eine `person` mit einem `event` (Phase 18).
-- Zwei fachlich unterschiedliche Zustände in einer Zeile: `rsvpStatus`
-- (vorab, von der Person selbst oder ihrem verifizierten
-- Erziehungsberechtigten gesetzt) und `attended` (im Nachhinein, von einer
-- Person mit Verwaltungsrecht auf das Event gesetzt). Höchstens eine Zeile
-- pro (event, person) — siehe `attendance_eventId_personId_key`.
--
-- `event` erhält zusätzlich einen `@@unique([tenantId, id])`-Index (gleiches
-- Muster wie `venue_tenantId_id_key`), da `attendance` das erste Modell ist,
-- das `event` über einen Composite Foreign Key referenziert.

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "rsvpStatus" "RsvpStatus" NOT NULL DEFAULT 'PENDING',
    "rsvpNote" TEXT,
    "respondedByPersonId" TEXT,
    "attended" BOOLEAN,
    "recordedByPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_tenantId_idx" ON "attendance"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_eventId_idx" ON "attendance"("eventId");

-- CreateIndex
CREATE INDEX "attendance_personId_idx" ON "attendance"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_eventId_personId_key" ON "attendance"("eventId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "event_tenantId_id_key" ON "event"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenantId_eventId_fkey" FOREIGN KEY ("tenantId", "eventId") REFERENCES "event"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenantId_personId_fkey" FOREIGN KEY ("tenantId", "personId") REFERENCES "person"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_respondedByPersonId_fkey" FOREIGN KEY ("respondedByPersonId") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level-Security (gleiches Muster wie 20260901120000_add_event_calendar).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  EXECUTE 'ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY';

  EXECUTE 'CREATE POLICY tenant_isolation_select ON "attendance" FOR SELECT USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
  EXECUTE 'CREATE POLICY tenant_isolation_insert ON "attendance" FOR INSERT WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
  EXECUTE 'CREATE POLICY tenant_isolation_update ON "attendance" FOR UPDATE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
  EXECUTE 'CREATE POLICY tenant_isolation_delete ON "attendance" FOR DELETE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
END $$;
