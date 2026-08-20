-- Cross-Tenant-FK-Konsistenz, zweite Runde (Phase 3, ergänzt
-- 20260820080847_add_cross_tenant_fk_consistency, siehe dort für den
-- allgemeinen Hintergrund: PostgreSQL MATCH-SIMPLE-FK auf (tenantId, id)
-- statt nur (id), damit ein Cross-Tenant-Verweis auf Datenbankebene
-- unmöglich ist, nicht nur durch Anwendungsdisziplin vermieden).
--
-- Deckt hier ab: role_assignment.personId → person und
-- person_relationship.fromPersonId/toPersonId → person. Die attributiven
-- Felder role_assignment.grantedByPersonId und
-- person_relationship.verifiedByPersonId bleiben bewusst einfache
-- (nicht-composite) Foreign Keys mit ON DELETE SET NULL — Prisma warnt vor
-- SetNull auf einer Composite-FK mit NOT-NULL-Spalte (tenantId), und diese
-- Felder sind rein informativ/attributiv (immer serverseitig aus
-- validiertem Tenant-Kontext gesetzt, nie Client-Input), nicht Teil der
-- strukturellen Zeilenbedeutung wie personId/fromPersonId/toPersonId.

-- DropForeignKey
ALTER TABLE "person_relationship" DROP CONSTRAINT "person_relationship_fromPersonId_fkey";

-- DropForeignKey
ALTER TABLE "person_relationship" DROP CONSTRAINT "person_relationship_toPersonId_fkey";

-- DropForeignKey
ALTER TABLE "role_assignment" DROP CONSTRAINT "role_assignment_personId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "person_tenantId_id_key" ON "person"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_tenantId_personId_fkey" FOREIGN KEY ("tenantId", "personId") REFERENCES "person"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relationship" ADD CONSTRAINT "person_relationship_tenantId_fromPersonId_fkey" FOREIGN KEY ("tenantId", "fromPersonId") REFERENCES "person"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relationship" ADD CONSTRAINT "person_relationship_tenantId_toPersonId_fkey" FOREIGN KEY ("tenantId", "toPersonId") REFERENCES "person"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
