-- Phase 10: Spielstätten + Spiel-/Match-Grundmodell — siehe
-- docs/PHASE_10_MATCH_FOUNDATION_REPORT.md.
--
-- Adds: `venue` (tenant-scoped, sportartenübergreifend — bewusst NICHT an
-- eine Fußball-Abteilung gekoppelt), `football_match` (referenziert
-- `team_season`, nicht `team` direkt — der Fußball-only-Guardrail aus
-- Phase 9 gilt dadurch strukturell mit, ohne eigene Prüfung). Kein
-- redundantes `seasonId`-Feld auf `football_match` — die Saison ist über
-- `teamSeasonId` → `team_season.seasonId` eindeutig ableitbar, siehe
-- Schema-Kommentar am Modell.

-- CreateEnum
CREATE TYPE "VenueStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('LEAGUE', 'FRIENDLY', 'TOURNAMENT', 'CUP');

-- CreateEnum
CREATE TYPE "MatchHomeAway" AS ENUM ('HOME', 'AWAY', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'POSTPONED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "venue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "countryCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "status" "VenueStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "football_match" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teamSeasonId" TEXT NOT NULL,
    "venueId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "type" "MatchType" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeAway" "MatchHomeAway" NOT NULL,
    "opponentName" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "football_match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venue_tenantId_idx" ON "venue"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "venue_tenantId_name_key" ON "venue"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "venue_tenantId_id_key" ON "venue"("tenantId", "id");

-- CreateIndex
CREATE INDEX "football_match_tenantId_idx" ON "football_match"("tenantId");

-- CreateIndex
CREATE INDEX "football_match_teamSeasonId_idx" ON "football_match"("teamSeasonId");

-- CreateIndex
CREATE INDEX "football_match_venueId_idx" ON "football_match"("venueId");

-- CreateIndex
CREATE INDEX "football_match_startsAt_idx" ON "football_match"("startsAt");

-- CreateIndex
-- Ergänzt in Phase 10 als Composite-Unique-Ziel für
-- football_match.teamSeasonId (gleiches Muster wie department/team/season/
-- age_group) — team_season hatte bisher kein eigenes (tenantId, id)-Unique,
-- da bislang nichts per Composite-FK darauf zeigte.
CREATE UNIQUE INDEX "team_season_tenantId_id_key" ON "team_season"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "venue" ADD CONSTRAINT "venue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "football_match" ADD CONSTRAINT "football_match_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Composite FK (tenantId, teamSeasonId) → team_season(tenantId, id) —
-- verhindert auf DB-Ebene, dass ein Match mit tenantId=A eine TeamSeason
-- mit tenantId=B referenziert. Strukturell auch der Fußball-only-Guardrail
-- (siehe Schema-Kommentar am Modell).
ALTER TABLE "football_match" ADD CONSTRAINT "football_match_tenantId_teamSeasonId_fkey" FOREIGN KEY ("tenantId", "teamSeasonId") REFERENCES "team_season"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Composite FK (tenantId, venueId) → venue(tenantId, id), nullable (venueId
-- optional) — verhindert auf DB-Ebene, dass ein Match mit tenantId=A eine
-- Venue mit tenantId=B referenziert.
ALTER TABLE "football_match" ADD CONSTRAINT "football_match_tenantId_venueId_fkey" FOREIGN KEY ("tenantId", "venueId") REFERENCES "venue"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: ein Ergebnis (homeScore/awayScore) darf nur gesetzt
-- sein, wenn das Spiel COMPLETED ist (siehe Auftrag Abschnitt 17). Kein
-- Trigger nötig — ein einfacher spaltenbasierter CHECK reicht.
-- ---------------------------------------------------------------------------

ALTER TABLE "football_match"
ADD CONSTRAINT football_match_score_requires_completed CHECK (
  ("homeScore" IS NULL AND "awayScore" IS NULL) OR "status" = 'COMPLETED'
);

-- ---------------------------------------------------------------------------
-- Row-Level-Security (gleiches Muster wie
-- 20260817150231_add_rls_and_scope_constraint / Phase 9). Beide neuen
-- Tabellen sind tenant-gebunden und erhalten RLS.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['venue', 'football_match']
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
