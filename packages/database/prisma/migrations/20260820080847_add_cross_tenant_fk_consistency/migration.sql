-- Cross-Tenant-FK-Konsistenz (Phase 3, nicht optional — siehe
-- docs/PHASE_2_CORE_REPORT.md, Abschnitt 20/21 und
-- docs/PHASE_3_CORE_HARDENING_REPORT.md).
--
-- Bisher garantierten weder "team.departmentId → department.id" noch
-- "role_assignment.departmentId/teamId → department/team.id" auf
-- Datenbankebene, dass die referenzierte Department/Team tatsächlich
-- demselben Tenant angehört wie die referenzierende Zeile selbst. Row-Level-
-- Security isoliert weiterhin korrekt NACH tenantId, aber ein Datensatz mit
-- z. B. role_assignment.tenantId = A und role_assignment.departmentId, das
-- auf eine Department mit tenantId = B zeigt, wäre bislang speicherbar
-- gewesen — fachlich inkonsistent, auch wenn RLS die Zeile selbst weiterhin
-- nur für Tenant A sichtbar macht.
--
-- Lösung: Composite Foreign Keys, die (tenantId, departmentId) gegen
-- department(tenantId, id) referenzieren (analog für team), statt nur
-- (departmentId) gegen department(id). PostgreSQL wendet dabei MATCH SIMPLE
-- an: Ist eine der referenzierenden Spalten NULL (z. B. departmentId bei
-- TENANT-Scope-RoleAssignments), gilt der Constraint automatisch als
-- erfüllt. Ist departmentId gesetzt, muss eine Department mit exakt diesem
-- id UND demselben tenantId existieren — ein Cross-Tenant-Verweis ist damit
-- auf Datenbankebene unmöglich, nicht nur durch Anwendungsdisziplin
-- vermieden.
--
-- Team wird aus demselben Grund mit repariert: team.departmentId →
-- department.id hatte exakt dasselbe Konsistenzproblem (ein Team könnte
-- bislang eine Department eines anderen Tenants referenzieren).

-- DropForeignKey
ALTER TABLE "role_assignment" DROP CONSTRAINT "role_assignment_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "role_assignment" DROP CONSTRAINT "role_assignment_teamId_fkey";

-- DropForeignKey
ALTER TABLE "team" DROP CONSTRAINT "team_departmentId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "department_tenantId_id_key" ON "department"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "team_tenantId_id_key" ON "team"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "department"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "department"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_tenantId_teamId_fkey" FOREIGN KEY ("tenantId", "teamId") REFERENCES "team"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
