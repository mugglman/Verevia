-- Phase 6: Account-Einladungen (Person ↔ neuer/bestehender User), siehe
-- schema.prisma-Kommentar an AccountInvitation.

-- CreateEnum
CREATE TYPE "AccountInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "account_invitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "AccountInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_invitation_tokenHash_key" ON "account_invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "account_invitation_tenantId_idx" ON "account_invitation"("tenantId");

-- CreateIndex
CREATE INDEX "account_invitation_personId_idx" ON "account_invitation"("personId");

-- CreateIndex
CREATE INDEX "account_invitation_email_idx" ON "account_invitation"("email");

-- AddForeignKey
-- Cross-Tenant-Konsistenz nach demselben Muster wie in Phase 3-5:
-- (tenantId, personId) referenziert (tenantId, id) der Person-Tabelle,
-- nicht nur (id) — verhindert auf DB-Ebene, dass eine Einladung mit
-- tenantId=A eine Person mit tenantId=B referenziert.
ALTER TABLE "account_invitation" ADD CONSTRAINT "account_invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_invitation" ADD CONSTRAINT "account_invitation_tenantId_personId_fkey" FOREIGN KEY ("tenantId", "personId") REFERENCES "person"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- invitedByUserId bleibt bewusst eine EINFACHE (nicht-composite) FK, exakt
-- dieselbe Begründung wie RoleAssignment.grantedByPersonId/
-- PersonRelationship.verifiedByPersonId (Phase 3/4): rein attributives
-- Feld ("wer hat eingeladen"), immer serverseitig aus dem validierten
-- Tenant-Kontext des Aufrufers gesetzt, nie aus Client-Input. `User` ist
-- zudem die globale Identitätsebene ohne eigenes tenantId, ein
-- Composite-FK wäre hier technisch gar nicht möglich.
ALTER TABLE "account_invitation" ADD CONSTRAINT "account_invitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Partieller Unique-Index: höchstens eine PENDING-Einladung pro Person
-- gleichzeitig — dasselbe Muster wie TeamMember (Phase 4). Ein erneutes
-- Versenden widerruft zuerst die alte PENDING-Zeile (siehe
-- InvitationsService), dann erst kann eine neue PENDING-Zeile entstehen;
-- dieser Index ist die DB-seitige Garantie dafür, nicht nur eine
-- Anwendungskonvention.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "account_invitation_pending_person_key"
  ON "account_invitation" ("personId")
  WHERE "status" = 'PENDING';

-- ---------------------------------------------------------------------------
-- BEWUSST KEINE Row-Level-Security auf dieser Tabelle — anders als die
-- übrigen tenant-gebundenen Tabellen, exakt aus demselben Grund wie
-- `tenant` selbst (siehe 20260817150231_add_rls_and_scope_constraint,
-- Abschlusskommentar "Explizit KEINE RLS auf: tenant ..."): der
-- öffentliche Annahme-Flow kennt den Tenant naturgemäß noch nicht — er
-- wird erst über den Token ermittelt. Die Sicherheitsgrenze ist hier der
-- Besitz des rohen Tokens (256 Bit Entropie, siehe tokenHash-Unique-Index
-- oben), nicht die Tenant-Zugehörigkeit. Ausführliche Begründung im
-- schema.prisma-Kommentar an AccountInvitation. Verwaltende Operationen
-- (TENANT_ADMIN: anlegen/auflisten/widerrufen) filtern weiterhin explizit
-- nach tenantId in InvitationsService (Application-Layer-Schutz), und die
-- Composite-FK oben verhindert weiterhin auf DB-Ebene jede Cross-Tenant-
-- Referenz einer Einladung auf eine fremde Person.
-- ---------------------------------------------------------------------------
