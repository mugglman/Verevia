# 0008 – Turnierspiele erweitern das bestehende FootballMatch statt eines eigenen Modells

## Status

**ACCEPTED** (2026-08-28)

## Kontext

Phase 10 hat `FootballMatch` bewusst asymmetrisch modelliert: `teamSeasonId` (verpflichtend, die eigene Mannschaft) + `opponentName` (Freitext, der Gegner) — passend für den normalen Vereinsspielbetrieb, bei dem der Gegner in aller Regel kein Verevia-Mandant ist.

Phase 11 führt `TournamentParticipant` ein — einen Turnierteilnehmer, der entweder eine interne `TeamSeason` **oder** einen externen `externalName` referenziert (nie beides, nie keines). Ein Turnierspiel muss zwei Teilnehmer gegeneinander stellen, die in jeder Kombination auftreten können: intern-vs-intern, intern-vs-extern, extern-vs-extern. Das bestehende `teamSeasonId + opponentName`-Paar kann diese Fälle nicht abbilden — insbesondere nicht "zwei externe Gastmannschaften spielen im eigenen Turnier gegeneinander", ein bei Jugendturnieren mit mehreren Gastmannschaften realistischer Fall.

Der Auftrag verlangt ausdrücklich: **kein** paralleles `TournamentMatch`-Modell, das bestehende `FootballMatch` bleibt die einzige Quelle für Spiele — ein künftiger Spielplangenerator (Phase 12) soll auf genau einem Modell aufsetzen.

## Entscheidung

`FootballMatch` wird um vier neue, **nullable** Spalten erweitert: `tournamentId?`, `tournamentGroupId?`, `homeParticipantId?`, `awayParticipantId?`. `teamSeasonId` wird von **verpflichtend auf optional** geändert (rückwärtskompatible Lockerung — bestehende Zeilen sind bereits befüllt, keine Datenmigration nötig).

Ein `FootballMatch` befindet sich damit in genau einem von zwei sich gegenseitig ausschließenden Modi, erzwungen durch einen einzigen DB-`CHECK`-Constraint (`football_match_mode_consistency`):

- **Vereinsmatch-Modus** (unverändertes Phase-10-Verhalten): `teamSeasonId` gesetzt, `opponentName` gesetzt, `tournamentId`/`tournamentGroupId`/`homeParticipantId`/`awayParticipantId` alle `NULL`.
- **Turniermatch-Modus**: `tournamentId` gesetzt, `homeParticipantId` **und** `awayParticipantId` gesetzt (und paarweise verschieden — zusätzlicher CHECK), `teamSeasonId`/`opponentName` beide `NULL`. `tournamentGroupId` optional (Gruppenspiel vs. K.-o.-Spiel, siehe Auftrag Abschnitt 17).

Damit werden alle vier geforderten Fälle abgebildet: normales Vereinsspiel (Modus 1, unverändert), internes Team vs. internes Team / internes Team vs. externe Mannschaft / zwei externe Mannschaften (alle drei über Modus 2 — der Unterschied liegt einzig darin, ob der jeweils referenzierte `TournamentParticipant` selbst `teamSeasonId` oder `externalName` trägt, `FootballMatch` selbst muss diese Unterscheidung nicht kennen).

`type = TOURNAMENT` ist **nicht** gleichbedeutend mit "gehört zu einem Verevia-`FootballTournament`" (Auftrag Abschnitt 16): ein Verein kann ein Spiel als `type: TOURNAMENT` erfassen, ohne dass dafür in Verevia ein eigenes Turnier existiert (z. B. Teilnahme an einem fremden, extern organisierten Turnier) — das bleibt ein normaler Vereinsmatch-Modus-Datensatz mit `tournamentId = NULL`. Umgekehrt erzwingt ein gesetztes `tournamentId` zusätzlich `type = TOURNAMENT` (weiterer CHECK) — ein Verevia-Turnierspiel kann nicht gleichzeitig als `FRIENDLY`/`LEAGUE`/`CUP` erfasst sein.

Referenzielle Konsistenz von `tournamentGroupId` und den beiden Participant-Feldern zum jeweils richtigen `tournamentId` wird **nicht** per Trigger, sondern durch eine Erweiterung des bereits etablierten Composite-FK-Musters erzwungen: `TournamentGroup` und `TournamentParticipant` erhalten je ein zusätzliches Drei-Spalten-Unique `(tenantId, tournamentId, id)`, sodass `football_match.tournamentGroupId`/`.homeParticipantId`/`.awayParticipantId` jeweils über `(tenantId, tournamentId, X) → (tenantId, tournamentId, id)` referenzieren — die Datenbank verweigert damit strukturell jede Gruppe/jeden Teilnehmer, die/der nicht zum referenzierten Turnier gehört, ohne eigene Trigger-Logik.

Nicht per CHECK-Constraint abgesichert (referenziert eine weitere Tabelle, für PostgreSQL-CHECKs nicht ausdrückbar): dass ein gesetztes `venueId` tatsächlich zum `TournamentVenue`-Set des Turniers gehört (Auftrag Abschnitt 20). Das bleibt eine anwendungsseitige Prüfung in `MatchesService`, dokumentiert und durch einen dedizierten Test abgesichert — dasselbe etablierte Muster wie der Fußball-only-Guardrail aus Phase 9.

## Verworfene Alternativen

- **Eigenes `TournamentMatch`-Modell** (paralleles Spielmodell): vom Auftrag explizit ausgeschlossen — ein künftiger Spielplangenerator müsste dann zwei Modelle kennen, Ergebnis-/Statuslogik würde dupliziert.
- **Polymorphe `participantId`/`participantType`-Spalten** direkt auf `FootballMatch` (statt zweier fester `home`/`away`-FKs): abgelehnt — genau die Art "unnötig polymorpher Strukturen", die der Auftrag ausdrücklich vermeiden will (siehe auch bestehende Projektkonvention gegen generische `scopeId`, ADR 0004). Zwei feste, benannte FKs (`homeParticipantId`/`awayParticipantId`) sind einfacher zu validieren, zu indizieren und per Composite-FK abzusichern.
- **`teamSeasonId` verpflichtend belassen und Turniermatches über eine separate Zuordnungstabelle abbilden** (`FootballMatch` bliebe unverändert, eine neue `TournamentMatchParticipants`-Tabelle würde Matches mit Teilnehmern verknüpfen): verworfen, weil dann ein Turniermatch zwischen zwei externen Mannschaften weiterhin ein erfundenes/leeres `teamSeasonId` bräuchte — keine saubere Lösung, verschiebt das Problem nur.

## Konsequenzen

- Bestehender Code, der `FootballMatch.teamSeasonId` als garantiert vorhanden voraussetzt (Authorization, DTOs, UI), muss für Turniermatch-Zeilen einen zweiten Pfad kennen — siehe `MatchesService`/`canOnMatch`-Aufrufstellen (Autorisierung für Turniermatches läuft über die Turnier-/Abteilungsebene, nicht über `canOnMatch`s team-basierte Logik, da kein `teamSeasonId` vorhanden ist).
- `MatchDto`/Web-UI müssen für Turniermatches andere Anzeigefelder verwenden (`homeParticipant`/`awayParticipant` statt `teamName`/`opponentName`) — im MVP-Scope von Phase 11 nicht zwingend in der bestehenden Spieleübersicht (`/fussball/spiele`) dargestellt, siehe [PHASE_11_TOURNAMENT_CORE_REPORT.md](../../PHASE_11_TOURNAMENT_CORE_REPORT.md).
- Ein künftiger Spielplangenerator (Phase 12) kann direkt `FootballMatch`-Zeilen mit `tournamentId`/`tournamentGroupId`/`homeParticipantId`/`awayParticipantId` erzeugen, ohne ein neues Modell oder eine Migration bestehender Daten zu benötigen.

## Bezug

- [PHASE_9_FOOTBALL_SEASON_REPORT.md](../../PHASE_9_FOOTBALL_SEASON_REPORT.md) (TeamSeason-Modell, Fußball-only-Guardrail-Muster)
- [PHASE_10_MATCH_FOUNDATION_REPORT.md](../../PHASE_10_MATCH_FOUNDATION_REPORT.md) (ursprüngliches `FootballMatch`-Modell)
- [PHASE_11_TOURNAMENT_CORE_REPORT.md](../../PHASE_11_TOURNAMENT_CORE_REPORT.md)
- [0004 – Scoped RBAC](./0004-scoped-rbac-role-assignment.md) (Begründung gegen polymorphe `scopeId`, hier analog angewendet)
