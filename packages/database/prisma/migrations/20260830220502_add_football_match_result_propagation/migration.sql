-- Phase 14: TournamentMatchSlot-Auflösung nach Spielabschluss — siehe
-- docs/PHASE_14_TOURNAMENT_MATCH_SLOT_RESOLUTION_REPORT.md und
-- docs/architecture/adr/0011-propagated-result-immutability.md.
--
-- Eine einzelne neue, nullable Spalte: `football_match.resultPropagatedAt`.
-- Wird gesetzt, sobald ein Spiel (als Quelle eines WINNER_OF_MATCH/
-- LOSER_OF_MATCH-Slots) mindestens einen abhängigen TournamentMatchSlot
-- aufgelöst hat. Der Slot-Datensatz selbst wird bei Auflösung gelöscht
-- (ADR 0010) — ohne dieses Feld gäbe es danach keine durable Spur mehr
-- davon, dass bereits propagiert wurde, und ein nachträglich geändertes
-- Ergebnis könnte unbemerkt inkonsistent zu bereits weitergegebenen
-- Teilnehmern in Folgespielen werden. Keine neue Tabelle, keine neue RLS-
-- Policy nötig — die bestehende football_match-Policy deckt die neue
-- Spalte automatisch mit ab.

ALTER TABLE "football_match" ADD COLUMN "resultPropagatedAt" TIMESTAMP(3);
