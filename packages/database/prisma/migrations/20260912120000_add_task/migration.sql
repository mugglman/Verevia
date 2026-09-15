-- Phase 20: Aufgaben (Tasks) — siehe docs/PHASE_20_TASK_TRACKING_REPORT.md und
-- docs/database/Database.md, Entität "Task (Aufgabe)".
--
-- Adds: `task`, gehört zu genau einem `team` ODER genau einer `person` (nie
-- beides, nie keines, per CHECK-Constraint erzwungen — gleiches XOR-Muster
-- wie `event_scope_xor`, ADR 0014/0008).

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teamId" TEXT,
    "personId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_tenantId_idx" ON "task"("tenantId");

-- CreateIndex
CREATE INDEX "task_teamId_idx" ON "task"("teamId");

-- CreateIndex
CREATE INDEX "task_personId_idx" ON "task"("personId");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_tenantId_teamId_fkey" FOREIGN KEY ("tenantId", "teamId") REFERENCES "team"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_tenantId_personId_fkey" FOREIGN KEY ("tenantId", "personId") REFERENCES "person"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: eine Task gehört zu genau einem Team ODER genau einer
-- Person, nie beides, nie keines — gleiches XOR-Muster wie event_scope_xor.
-- ---------------------------------------------------------------------------

ALTER TABLE "task"
ADD CONSTRAINT task_assignee_xor CHECK (
  ("teamId" IS NOT NULL AND "personId" IS NULL)
  OR
  ("teamId" IS NULL AND "personId" IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- Row-Level-Security (gleiches Muster wie 20260901120000_add_event_calendar).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  EXECUTE 'ALTER TABLE "task" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE "task" FORCE ROW LEVEL SECURITY';

  EXECUTE 'CREATE POLICY tenant_isolation_select ON "task" FOR SELECT USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
  EXECUTE 'CREATE POLICY tenant_isolation_insert ON "task" FOR INSERT WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
  EXECUTE 'CREATE POLICY tenant_isolation_update ON "task" FOR UPDATE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
  EXECUTE 'CREATE POLICY tenant_isolation_delete ON "task" FOR DELETE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))';
END $$;
