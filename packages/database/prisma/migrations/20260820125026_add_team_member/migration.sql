-- Phase 4: fachliche Mannschaftszugehörigkeit ("wer gehört zu welcher
-- Mannschaft"), bewusst getrennt von `membership` (Login-Zuordnung) und
-- `role_assignment` (Berechtigung) — siehe schema.prisma-Kommentar am
-- Modell `TeamMember` und docs/database/Database.md.

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "team_member" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_member_tenantId_idx" ON "team_member"("tenantId");

-- CreateIndex
CREATE INDEX "team_member_personId_idx" ON "team_member"("personId");

-- CreateIndex
CREATE INDEX "team_member_teamId_idx" ON "team_member"("teamId");

-- AddForeignKey
-- Cross-Tenant-Konsistenz nach demselben Muster wie RoleAssignment/
-- PersonRelationship (Phase 3): (tenantId, personId)/(tenantId, teamId)
-- referenzieren jeweils (tenantId, id) der Zieltabelle statt nur (id),
-- PostgreSQL MATCH SIMPLE — ein TeamMember mit tenantId=A kann dadurch auf
-- DB-Ebene nie eine Person oder ein Team mit tenantId=B referenzieren.
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_tenantId_personId_fkey" FOREIGN KEY ("tenantId", "personId") REFERENCES "person"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_tenantId_teamId_fkey" FOREIGN KEY ("tenantId", "teamId") REFERENCES "team"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Partieller Unique-Index: keine doppelte AKTIVE Zuordnung derselben Person
-- zur selben Mannschaft. Bewusst NICHT `@@unique([personId, teamId])` (das
-- hätte Prisma deklarativ ausdrücken können) — ein einfacher Unique-Index
-- würde verhindern, dass eine einmal deaktivierte Person (status=INACTIVE,
-- z. B. Spieler, der die Mannschaft verlässt) derselben Mannschaft später
-- erneut hinzugefügt wird. Prisma 6 unterstützt partielle Indizes nicht
-- deklarativ, daher hier per Hand.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "team_member_active_person_team_key"
  ON "team_member" ("personId", "teamId")
  WHERE "status" = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Row-Level-Security (gleiches Muster wie
-- 20260817150231_add_rls_and_scope_constraint, siehe dort für die
-- ausführliche Begründung von FORCE ROW LEVEL SECURITY und den
-- fail-closed-Policies).
-- ---------------------------------------------------------------------------

ALTER TABLE "team_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_member" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON "team_member" FOR SELECT USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), ''));
CREATE POLICY tenant_isolation_insert ON "team_member" FOR INSERT WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), ''));
CREATE POLICY tenant_isolation_update ON "team_member" FOR UPDATE USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), ''));
CREATE POLICY tenant_isolation_delete ON "team_member" FOR DELETE USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), ''));
