-- Phase 13: Turnier-Knockout-/Finalrunden-Grundfundament — siehe
-- docs/PHASE_13_TOURNAMENT_KNOCKOUT_GENERATOR_REPORT.md und
-- docs/architecture/adr/0010-knockout-pending-match-slots.md.
--
-- Neue Tabelle `tournament_match_slot`: beschreibt, woher der Heim-/
-- Auswärts-Teilnehmer eines noch nicht aufgelösten KO-Spiels kommen wird
-- (Gruppenplatzierung, Sieger/Verlierer eines Vorgängerspiels) — NUR für
-- Seiten ohne bereits bekannten Teilnehmer. `football_match_mode_consistency`
-- wird dafür gelockert: `homeParticipantId`/`awayParticipantId` dürfen im
-- Turniermatch-Modus jetzt NULL sein (einzeln oder beide), solange — falls
-- beide gesetzt sind — sie weiterhin verschieden sein müssen. Siehe ADR
-- 0010 für die ausführliche Begründung.

-- CreateEnum
CREATE TYPE "MatchSlotSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "MatchSlotSourceType" AS ENUM ('GROUP_POSITION', 'WINNER_OF_MATCH', 'LOSER_OF_MATCH');

-- CreateTable
CREATE TABLE "tournament_match_slot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "side" "MatchSlotSide" NOT NULL,
    "sourceType" "MatchSlotSourceType" NOT NULL,
    "groupId" TEXT,
    "groupPosition" INTEGER,
    "sourceMatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_match_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournament_match_slot_tenantId_idx" ON "tournament_match_slot"("tenantId");

-- CreateIndex
CREATE INDEX "tournament_match_slot_tournamentId_idx" ON "tournament_match_slot"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_match_slot_matchId_idx" ON "tournament_match_slot"("matchId");

-- CreateIndex
CREATE INDEX "tournament_match_slot_groupId_idx" ON "tournament_match_slot"("groupId");

-- CreateIndex
CREATE INDEX "tournament_match_slot_sourceMatchId_idx" ON "tournament_match_slot"("sourceMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_match_slot_tenantId_matchId_side_key" ON "tournament_match_slot"("tenantId", "matchId", "side");

-- CreateIndex
-- Composite-FK-Ziel für tournament_match_slot.matchId/sourceMatchId — siehe
-- unten. Funktioniert trotz nullable tournamentId auf football_match
-- (Vereinsmatch-Modus): Postgres behandelt NULL in Unique-Indizes als
-- paarweise verschieden, mehrere Vereinsmatches mit tournamentId=NULL
-- kollidieren also nicht.
CREATE UNIQUE INDEX "football_match_tenantId_tournamentId_id_key" ON "football_match"("tenantId", "tournamentId", "id");

-- AddForeignKey
ALTER TABLE "tournament_match_slot" ADD CONSTRAINT "tournament_match_slot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match_slot" ADD CONSTRAINT "tournament_match_slot_tenantId_tournamentId_fkey" FOREIGN KEY ("tenantId", "tournamentId") REFERENCES "football_tournament"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Der Slot gehört zu GENAU dem Spiel/Turnier, das er beschreibt.
-- ON DELETE CASCADE: wird ein Spiel gelöscht (aktuell nie der Fall — kein
-- DELETE-Endpunkt für FootballMatch), verlieren auch seine Slot-Zeilen
-- jeden Sinn.
ALTER TABLE "tournament_match_slot" ADD CONSTRAINT "tournament_match_slot_tenantId_tournamentId_matchId_fkey" FOREIGN KEY ("tenantId", "tournamentId", "matchId") REFERENCES "football_match"("tenantId", "tournamentId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match_slot" ADD CONSTRAINT "tournament_match_slot_tenantId_tournamentId_groupId_fkey" FOREIGN KEY ("tenantId", "tournamentId", "groupId") REFERENCES "tournament_group"("tenantId", "tournamentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Bewusst RESTRICT: das Vorgängerspiel eines KO-Slots darf nicht
-- verschwinden können, während der Slot noch darauf verweist (ohnehin kein
-- DELETE-Endpunkt für FootballMatch vorhanden).
ALTER TABLE "tournament_match_slot" ADD CONSTRAINT "tournament_match_slot_tenantId_tournamentId_sourceMatchId_fkey" FOREIGN KEY ("tenantId", "tournamentId", "sourceMatchId") REFERENCES "football_match"("tenantId", "tournamentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- football_match_mode_consistency lockern (Phase 13 / ADR 0010): im
-- Turniermatch-Modus dürfen homeParticipantId/awayParticipantId jetzt
-- NULL sein (einzeln oder beide) — für ein KO-Spiel, dessen Teilnehmer noch
-- nicht feststeht. Sind beide gesetzt, müssen sie weiterhin verschieden
-- sein (kein Selbstspiel). Der Vereinsmatch-Modus (erste Alternative) ist
-- unverändert.
-- ---------------------------------------------------------------------------

ALTER TABLE "football_match" DROP CONSTRAINT "football_match_mode_consistency";

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
    AND "teamSeasonId" IS NULL
    AND "opponentName" IS NULL
    AND (
      "homeParticipantId" IS NULL
      OR "awayParticipantId" IS NULL
      OR "homeParticipantId" <> "awayParticipantId"
    )
  )
);

-- ---------------------------------------------------------------------------
-- Row-Level-Security (gleiches Muster wie alle vorherigen RLS-Migrationen).
-- Nur die eine neue Tabelle dieser Phase.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['tournament_match_slot']
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
