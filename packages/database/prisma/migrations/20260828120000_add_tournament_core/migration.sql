-- Phase 11: Fußball-Turnier-Grundfundament — siehe
-- docs/PHASE_11_TOURNAMENT_CORE_REPORT.md und
-- docs/architecture/adr/0008-tournament-match-model.md.
--
-- Adds: `football_tournament`, `tournament_participant` (interne
-- TeamSeason ODER externer Freitextname, nie beides), `tournament_venue`
-- (bestehende Venue-Zuordnung, kein neues Pitch-Modell), `tournament_group`
-- (manuell angelegt, keine Autoverteilung). Erweitert `football_match` um
-- vier nullable Spalten (tournamentId/tournamentGroupId/home-/
-- awayParticipantId) und lockert teamSeasonId/opponentName von
-- verpflichtend auf optional — ein FootballMatch ist entweder ein
-- Vereinsmatch (teamSeasonId+opponentName) ODER ein Turniermatch
-- (tournamentId+home-/awayParticipantId), nie beides gemischt, erzwungen
-- per CHECK-Constraint. Siehe ADR 0008 für die ausführliche Begründung.

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentMode" AS ENUM ('GROUPS', 'KNOCKOUT', 'GROUPS_AND_KNOCKOUT');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "football_match" ADD COLUMN     "awayParticipantId" TEXT,
ADD COLUMN     "homeParticipantId" TEXT,
ADD COLUMN     "tournamentGroupId" TEXT,
ADD COLUMN     "tournamentId" TEXT,
ALTER COLUMN "teamSeasonId" DROP NOT NULL,
ALTER COLUMN "opponentName" DROP NOT NULL;

-- CreateTable
CREATE TABLE "football_tournament" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "seasonId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "TournamentMode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "football_tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_participant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamSeasonId" TEXT,
    "externalName" TEXT,
    "groupId" TEXT,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "seed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_venue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_group" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "football_tournament_tenantId_idx" ON "football_tournament"("tenantId");

-- CreateIndex
CREATE INDEX "football_tournament_departmentId_idx" ON "football_tournament"("departmentId");

-- CreateIndex
CREATE INDEX "football_tournament_seasonId_idx" ON "football_tournament"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "football_tournament_tenantId_id_key" ON "football_tournament"("tenantId", "id");

-- CreateIndex
CREATE INDEX "tournament_participant_tenantId_idx" ON "tournament_participant"("tenantId");

-- CreateIndex
CREATE INDEX "tournament_participant_tournamentId_idx" ON "tournament_participant"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_participant_teamSeasonId_idx" ON "tournament_participant"("teamSeasonId");

-- CreateIndex
CREATE INDEX "tournament_participant_groupId_idx" ON "tournament_participant"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_participant_tenantId_tournamentId_id_key" ON "tournament_participant"("tenantId", "tournamentId", "id");

-- CreateIndex
CREATE INDEX "tournament_venue_tenantId_idx" ON "tournament_venue"("tenantId");

-- CreateIndex
CREATE INDEX "tournament_venue_tournamentId_idx" ON "tournament_venue"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_venue_venueId_idx" ON "tournament_venue"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_venue_tournamentId_venueId_key" ON "tournament_venue"("tournamentId", "venueId");

-- CreateIndex
CREATE INDEX "tournament_group_tenantId_idx" ON "tournament_group"("tenantId");

-- CreateIndex
CREATE INDEX "tournament_group_tournamentId_idx" ON "tournament_group"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_group_tenantId_tournamentId_id_key" ON "tournament_group"("tenantId", "tournamentId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_group_tournamentId_name_key" ON "tournament_group"("tournamentId", "name");

-- CreateIndex
-- Ergänzt in Phase 11 als Composite-Unique-Ziel für
-- FootballTournament.seasonId — erzwingt, dass die referenzierte Season
-- zur selben Department gehört wie das Turnier.
CREATE UNIQUE INDEX "season_tenantId_departmentId_id_key" ON "season"("tenantId", "departmentId", "id");

-- CreateIndex
CREATE INDEX "football_match_tournamentId_idx" ON "football_match"("tournamentId");

-- CreateIndex
CREATE INDEX "football_match_tournamentGroupId_idx" ON "football_match"("tournamentGroupId");

-- CreateIndex
CREATE INDEX "football_match_homeParticipantId_idx" ON "football_match"("homeParticipantId");

-- CreateIndex
CREATE INDEX "football_match_awayParticipantId_idx" ON "football_match"("awayParticipantId");

-- AddForeignKey
ALTER TABLE "football_match" ADD CONSTRAINT "football_match_tenantId_tournamentId_fkey" FOREIGN KEY ("tenantId", "tournamentId") REFERENCES "football_tournament"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Drei-Spalten-Composite-FK — erzwingt zugleich, dass die Gruppe zu GENAU
-- diesem Turnier gehört (ADR 0008).
ALTER TABLE "football_match" ADD CONSTRAINT "football_match_tenantId_tournamentId_tournamentGroupId_fkey" FOREIGN KEY ("tenantId", "tournamentId", "tournamentGroupId") REFERENCES "tournament_group"("tenantId", "tournamentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Drei-Spalten-Composite-FK — erzwingt zugleich, dass der Heim-Teilnehmer
-- zu GENAU diesem Turnier gehört (ADR 0008).
ALTER TABLE "football_match" ADD CONSTRAINT "football_match_tenantId_tournamentId_homeParticipantId_fkey" FOREIGN KEY ("tenantId", "tournamentId", "homeParticipantId") REFERENCES "tournament_participant"("tenantId", "tournamentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Drei-Spalten-Composite-FK — erzwingt zugleich, dass der Auswärts-Teilnehmer
-- zu GENAU diesem Turnier gehört (ADR 0008).
ALTER TABLE "football_match" ADD CONSTRAINT "football_match_tenantId_tournamentId_awayParticipantId_fkey" FOREIGN KEY ("tenantId", "tournamentId", "awayParticipantId") REFERENCES "tournament_participant"("tenantId", "tournamentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "football_tournament" ADD CONSTRAINT "football_tournament_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "football_tournament" ADD CONSTRAINT "football_tournament_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "department"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Composite FK über (tenantId, departmentId, seasonId) — erzwingt, dass
-- die Season zur selben Department gehört wie das Turnier.
ALTER TABLE "football_tournament" ADD CONSTRAINT "football_tournament_tenantId_departmentId_seasonId_fkey" FOREIGN KEY ("tenantId", "departmentId", "seasonId") REFERENCES "season"("tenantId", "departmentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_participant" ADD CONSTRAINT "tournament_participant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_participant" ADD CONSTRAINT "tournament_participant_tenantId_tournamentId_fkey" FOREIGN KEY ("tenantId", "tournamentId") REFERENCES "football_tournament"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_participant" ADD CONSTRAINT "tournament_participant_tenantId_teamSeasonId_fkey" FOREIGN KEY ("tenantId", "teamSeasonId") REFERENCES "team_season"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Bewusst RESTRICT statt SetNull: bei dieser Composite-FK sind
-- tenantId/tournamentId (Teil des FK) selbst NOT NULL — SetNull würde
-- versuchen, auch diese Pflichtspalten zu leeren und liefe auf einen
-- NOT-NULL-Verstoß hinaus. RESTRICT ist zudem fachlich korrekt: eine
-- Gruppe mit zugeordneten Teilnehmern darf nicht gelöscht werden.
ALTER TABLE "tournament_participant" ADD CONSTRAINT "tournament_participant_tenantId_tournamentId_groupId_fkey" FOREIGN KEY ("tenantId", "tournamentId", "groupId") REFERENCES "tournament_group"("tenantId", "tournamentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_venue" ADD CONSTRAINT "tournament_venue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_venue" ADD CONSTRAINT "tournament_venue_tenantId_tournamentId_fkey" FOREIGN KEY ("tenantId", "tournamentId") REFERENCES "football_tournament"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_venue" ADD CONSTRAINT "tournament_venue_tenantId_venueId_fkey" FOREIGN KEY ("tenantId", "venueId") REFERENCES "venue"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_group" ADD CONSTRAINT "tournament_group_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_group" ADD CONSTRAINT "tournament_group_tenantId_tournamentId_fkey" FOREIGN KEY ("tenantId", "tournamentId") REFERENCES "football_tournament"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: ein FootballMatch ist entweder ein Vereinsmatch
-- (teamSeasonId+opponentName, keine Turnierfelder) ODER ein Turniermatch
-- (tournamentId+home-/awayParticipantId, kein teamSeasonId/opponentName),
-- nie eine Mischung — siehe ADR 0008. Ein Teilnehmer kann außerdem nicht
-- gegen sich selbst spielen (homeParticipantId <> awayParticipantId).
-- ---------------------------------------------------------------------------

ALTER TABLE "football_match"
ADD CONSTRAINT football_match_mode_consistency CHECK (
  (
    "tournamentId" IS NULL
    AND "tournamentGroupId" IS NULL
    AND "homeParticipantId" IS NULL
    AND "awayParticipantId" IS NULL
    AND "teamSeasonId" IS NOT NULL
    AND "opponentName" IS NOT NULL
  )
  OR
  (
    "tournamentId" IS NOT NULL
    AND "homeParticipantId" IS NOT NULL
    AND "awayParticipantId" IS NOT NULL
    AND "homeParticipantId" <> "awayParticipantId"
    AND "teamSeasonId" IS NULL
    AND "opponentName" IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: ein Turniermatch (tournamentId gesetzt) muss
-- type = TOURNAMENT sein. Die Umkehrung gilt NICHT (ein normales
-- Vereinsmatch darf type = TOURNAMENT tragen, ohne einem Verevia-Turnier
-- zugeordnet zu sein — z. B. Teilnahme an einem extern organisierten
-- Turnier), siehe ADR 0008 / Auftrag Abschnitt 16.
-- ---------------------------------------------------------------------------

ALTER TABLE "football_match"
ADD CONSTRAINT football_match_tournament_requires_type CHECK (
  "tournamentId" IS NULL OR "type" = 'TOURNAMENT'
);

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: ein Turnierteilnehmer hat GENAU eine Quelle — eine
-- interne TeamSeason ODER einen externen Freitextnamen, nie beides, nie
-- keines.
-- ---------------------------------------------------------------------------

ALTER TABLE "tournament_participant"
ADD CONSTRAINT tournament_participant_source_xor CHECK (
  ("teamSeasonId" IS NOT NULL AND "externalName" IS NULL)
  OR
  ("teamSeasonId" IS NULL AND "externalName" IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- Partielle Unique-Indizes: Duplikatschutz für Teilnehmer. Dieselbe interne
-- TeamSeason darf pro Turnier nur einmal Teilnehmer sein; derselbe externe
-- Name (case-insensitiv) ebenfalls nur einmal. Prisma 6 bildet weder
-- WHERE-Klauseln noch Ausdrucks-Indizes deklarativ ab.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "tournament_participant_internal_unique"
  ON "tournament_participant" ("tournamentId", "teamSeasonId")
  WHERE "teamSeasonId" IS NOT NULL;

CREATE UNIQUE INDEX "tournament_participant_external_unique"
  ON "tournament_participant" ("tournamentId", lower("externalName"))
  WHERE "externalName" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: ein Turnier-Enddatum (sofern gesetzt) darf nicht vor
-- dem Startdatum liegen.
-- ---------------------------------------------------------------------------

ALTER TABLE "football_tournament"
ADD CONSTRAINT football_tournament_valid_date_range CHECK (
  "endsAt" IS NULL OR "endsAt" >= "startsAt"
);

-- ---------------------------------------------------------------------------
-- Row-Level-Security (gleiches Muster wie
-- 20260817150231_add_rls_and_scope_constraint / Phase 9/10). Alle vier
-- neuen Tabellen sind tenant-gebunden und erhalten RLS. `football_match`
-- hat bereits seit Phase 10 RLS — die neuen Spalten brauchen keine
-- erneute Aktivierung.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['football_tournament', 'tournament_participant', 'tournament_venue', 'tournament_group']
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
