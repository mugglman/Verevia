-- Phase 9: Fußball-Grundstruktur und Saisonverwaltung — siehe
-- docs/PHASE_9_FOOTBALL_SEASON_REPORT.md.
--
-- Adds: `sportType` on `department` (generic classifier, not a
-- football-specific field — Department/Team stay sport-neutral),
-- `season` (department-scoped, sport-neutral), `age_group`
-- (tenant-scoped, configurable — deliberately NOT a hardcoded German
-- youth-category enum), `team_season` (season-specific attachment of an
-- existing, persistent `team` to a `season`+`age_group`).

-- CreateEnum
CREATE TYPE "SportType" AS ENUM ('FOOTBALL', 'TENNIS', 'STOCK_SPORT', 'CYCLING', 'OTHER');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TeamSeasonStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "department" ADD COLUMN     "sportType" "SportType" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "season" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "age_group" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "age_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_season" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "ageGroupId" TEXT NOT NULL,
    "displayName" TEXT,
    "status" "TeamSeasonStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_season_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "season_tenantId_idx" ON "season"("tenantId");

-- CreateIndex
CREATE INDEX "season_departmentId_idx" ON "season"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "season_departmentId_name_key" ON "season"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "season_tenantId_id_key" ON "season"("tenantId", "id");

-- CreateIndex
CREATE INDEX "age_group_tenantId_idx" ON "age_group"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "age_group_tenantId_name_key" ON "age_group"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "age_group_tenantId_id_key" ON "age_group"("tenantId", "id");

-- CreateIndex
CREATE INDEX "team_season_tenantId_idx" ON "team_season"("tenantId");

-- CreateIndex
CREATE INDEX "team_season_teamId_idx" ON "team_season"("teamId");

-- CreateIndex
CREATE INDEX "team_season_seasonId_idx" ON "team_season"("seasonId");

-- CreateIndex
CREATE INDEX "team_season_ageGroupId_idx" ON "team_season"("ageGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "team_season_teamId_seasonId_key" ON "team_season"("teamId", "seasonId");

-- AddForeignKey
ALTER TABLE "season" ADD CONSTRAINT "season_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Composite FK (tenantId, departmentId) → department(tenantId, id), gleiches
-- Muster wie team → department: verhindert auf DB-Ebene, dass eine Season
-- mit tenantId=A eine Department mit tenantId=B referenziert.
ALTER TABLE "season" ADD CONSTRAINT "season_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "department"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "age_group" ADD CONSTRAINT "age_group_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Composite FKs (tenantId, teamId)/(tenantId, seasonId)/(tenantId, ageGroupId)
-- → jeweils (tenantId, id) der Zieltabelle, statt nur (id) — dasselbe
-- gehärtete Muster wie RoleAssignment/PersonRelationship/TeamMember
-- (Phase 3/4): verhindert auf DB-Ebene, dass eine TeamSeason ein Team,
-- eine Season oder eine AgeGroup eines ANDEREN Tenants referenziert.
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_tenantId_teamId_fkey" FOREIGN KEY ("tenantId", "teamId") REFERENCES "team"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_tenantId_seasonId_fkey" FOREIGN KEY ("tenantId", "seasonId") REFERENCES "season"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_tenantId_ageGroupId_fkey" FOREIGN KEY ("tenantId", "ageGroupId") REFERENCES "age_group"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: eine Season muss einen gültigen Zeitraum haben.
-- Überschneidungen zwischen Seasons desselben Departments werden bewusst
-- NICHT verboten (siehe Auftrag: legitime Übergänge zwischen PLANNED und
-- ACTIVE Seasons, z. B. Vorbereitung der nächsten Saison, während die
-- aktuelle noch läuft).
-- ---------------------------------------------------------------------------

ALTER TABLE "season"
ADD CONSTRAINT season_valid_date_range CHECK ("startsAt" < "endsAt");

-- ---------------------------------------------------------------------------
-- Partieller Unique-Index: höchstens eine ACTIVE Season pro Department
-- gleichzeitig. Gleiches Muster wie team_member_active_person_team_key
-- (Phase 4) / account_invitation_pending_person_key (Phase 6) — Prisma 6
-- bildet WHERE-Klauseln in `@@unique` nicht deklarativ ab.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "season_active_department_key"
  ON "season" ("departmentId")
  WHERE "status" = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Row-Level-Security (gleiches Muster wie
-- 20260817150231_add_rls_and_scope_constraint, siehe dort für die
-- ausführliche Begründung von FORCE ROW LEVEL SECURITY und den
-- fail-closed-Policies). Alle drei neuen Tabellen sind tenant-gebunden und
-- erhalten RLS — anders als `account_invitation` (Phase 6) gibt es hier
-- kein Henne-Ei-Problem, der Tenant ist in jedem Aufrufkontext bereits
-- bekannt.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['season', 'age_group', 'team_season']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

    EXECUTE format(
      'CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      tbl
    );
  END LOOP;
END $$;
