# Phase 21 – Einfache Statistiken

## 1. Ausgangslage

Phase 20 (`feat: add task tracking`, Branch `feat/task-tracking`, Endcommit `acfba0d`, PR #24) und Phase 19 (`feat: add attendance tracking`, Branch `feat/attendance-tracking`, Endcommit `108fbec`, PR #23) waren zu Beginn dieses Arbeitspakets beide OPEN/MERGEABLE/CLEAN. **Weder PR #23 noch PR #24 wurden in dieser Phase gemergt** — beide blieben während der gesamten Phase-21-Arbeit unverändert offen (siehe Abschnitt 12). `main` blieb bei `d4a3865` (Phase 18).

## 2. Scope-Herleitung

Der Arbeitsauftrag selbst löste die Scope-Frage bereits explizit auf ("Der Scope wurde nach Prüfung der vorhandenen Roadmap und Produktdokumentation bewusst konkretisiert. Phase 21 ist damit freigegeben.") — kein eigener Investigations-Schritt nötig. Einfache Statistiken sind der letzte verbleibende, im MVP-Scope explizit benannte Punkt, der ohne neue Infrastruktur (Redis/BullMQ/externe Dienste) umsetzbar ist; Push-Mitteilungen bleiben aus genau diesem Grund weiterhin blockiert (siehe ADR 0016 und der vorangegangene BLOCKED-Bericht).

## 3. Bewusst nicht im Scope

- Spieler-/Individualstatistiken (Torschützenliste, Assists, Karten, Vorlagen, Minuten, individuelle Torquote, Expected Goals, komplexe Rankings) — kein vollständiges Ereignis-Tracking dafür im bestehenden Datenmodell, kein künstliches Modell dafür eingeführt.
- Jede neue Statistik-Infrastruktur: kein Redis, kein BullMQ, kein externer Analytics-/Statistik-Anbieter, keine zusätzliche Queue, keine zusätzliche Datenbank, keine zusätzliche Worker-Infrastruktur.
- Push-Mitteilungen (bleiben Gegenstand eines späteren Arbeitspakets, siehe ADR 0016).
- Jede Form von Redundanzspeicherung berechenbarer Statistikwerte.

## 4. Architektur

**Keine neue Authorization Engine, keine zweite Anwesenheitslogik, keine zweite Spielergebnis-Definition.** Der komplette Datenzugriff läuft über bereits existierende, unveränderte Services:

- `EventsService.list({ teamId, from, to })` (Phase 18) liefert die relevanten Termine.
- `AttendancesService.list(eventId)` (Phase 19) liefert die Anwesenheitszeilen je Termin — **inklusive** seiner bereits etablierten Roster-Synthese (ein aktives `TeamMember` ohne eigene `Attendance`-Zeile erscheint dort bereits korrekt als `PENDING`/`attended: null`). Diese Wiederverwendung war essenziell, um "offene Antworten" nicht zu unterzählen.
- `AuthorizationService.canOnMatch` (unverändert, dieselbe Regel wie für `FootballMatch`/`Event`-Sichtbarkeit) ist die einzige Berechtigungsprüfung des neuen Endpunkts.
- `db.footballMatch.findMany({ where: { teamSeasonId, status: "COMPLETED" } })` — dieselbe RLS-geschützte, tenant-partitionierte Prisma-Instanz (`getTenantPrisma`) wie überall sonst im Projekt.

Die eigentliche Berechnung ist als reine, DB-freie Funktion ausgelagert (`apps/api/src/statistics/statistics.calculations.ts`, `computeMatchStatistics`/`computeAttendanceStatistics`) — gleiches Muster wie `group-standings.ts` (Phase 16) — getrennt vom DB-/Authorization-anfassenden `StatisticsService`, für vollständig isolierte Unit-Tests ohne Prisma-/NestJS-Mocking.

Kleine additive Änderung: `AttendancesModule` exportierte `AttendancesService` bislang nicht (im Gegensatz zu `EventsModule`) — ergänzt, um die Injektion in `StatisticsModule` zu ermöglichen. Rein additiv, keine Verhaltensänderung an Phase 19.

## 5. Datenmodell / Migration

**Migration: Nein.** Alle benötigten Werte sind aus bestehenden Tabellen (`FootballMatch`, `Event`, `Attendance`, `TeamSeason`, `TeamMember`) berechenbar; nichts davon wird redundant gespeichert. `prisma migrate status` gegen eine frische temporäre PostgreSQL-17-Instanz (siehe Abschnitt 11): alle 15 Migrationen (unverändert seit Phase 19) sauber angewendet, **Drift: 0**, `prisma validate` grün.

## 6. Berechnungsdefinitionen

Explizit dokumentiert, wie im Arbeitsauftrag gefordert:

- **Gespielt/"played"**: ein `FootballMatch` mit `teamSeasonId = <angefragte TeamSeason>` und `status = COMPLETED` — dieselbe, bereits etablierte Definition von "abgeschlossen" aus dem Match-Modell (keine zweite, parallele Definition). Zukünftige, geplante (`SCHEDULED`) oder anderweitig unvollständige Spiele zählen nicht.
- **Sieg/Unentschieden/Niederlage, Tore/Gegentore**: perspektivisch aus `homeAway` aufgelöst — `AWAY` vertauscht Heim-/Auswärtstore, `HOME`/`NEUTRAL` behandelt gleich (identische Konvention wie die bestehende `matchup()`-Hilfsfunktion in `matches-overview.tsx`, hier nicht dupliziert, sondern eigenständig für die Aggregation nachgebildet, da dort nur die Anzeige, nicht die Summierung stattfindet).
- **Relevante Termine für Team+Saison**: `Event` trägt bewusst keine `teamSeasonId` (sportneutrales Modell, siehe Phase-18-Modellkommentar) und `seasonId` ist optional/nicht garantiert gesetzt. Daher: alle `Event`-Zeilen mit `teamId = <Team der TeamSeason>` und `startsAt` innerhalb `[Season.startsAt, Season.endsAt]` der zugehörigen Saison. Eine bewusste, hier dokumentierte Abgrenzungsentscheidung — keine stille Annahme.
- **Anwesenheitsquote**: `Anwesenheitsquote = anwesend / (anwesend + abwesend)`, basierend auf dem faktischen `Attendance.attended`-Feld (`true`/`false`/`null`), NICHT auf `rsvpStatus`. Offene/nicht erfasste Einträge (`attended: null`, egal ob `rsvpStatus` `PENDING`, `ACCEPTED` oder `DECLINED` ist) fließen **nicht** in den Nenner ein und verschlechtern die Quote damit nicht künstlich. Ohne jede erfasste tatsächliche Anwesenheit ist die Quote `null` (nicht `0`), um "keine Daten" von "0 % Anwesenheit" zu unterscheiden.
- **RSVP- vs. Anwesenheitsdimension**: Der Arbeitsauftrag benennt in Abschnitt 3.1 die RSVP-Dimension (Zusagen/Absagen/offene Antworten) und in Abschnitt 12 die faktische Anwesenheitsdimension (Anwesend/Abwesend/Offen) — beide sind tatsächlich unterschiedliche, im Modell seit Phase 19 getrennte Felder (`rsvpStatus` vs. `attended`). Statt eines davon zu unterschlagen, liefert die API beide (`accepted`/`declined`/`pending` UND `attended`/`notAttended`/`notRecorded`); die UI (Abschnitt 12) zeigt primär die Anwesenheitsdimension, ergänzt um die RSVP-Zahlen.

## 7. Authorization

Die in Abschnitt 16 des Arbeitsauftrags geforderte Prüfreihenfolge wird vollständig, ohne Umgehung über direkte SQL-Abfragen, durchlaufen:

1. Tenant-Existenz: implizit über `getTenantContext()`/`TenantContextInterceptor` (fail-closed ohne aktiven Tenant-Kontext, `UnauthorizedException`).
2. TeamSeason-Existenz: `db.teamSeason.findUnique(...)` → `NotFoundException` (404), falls nicht vorhanden.
3. Tenant-Zugehörigkeit: implizit durch RLS — die Query auf der tenant-partitionierten Prisma-Instanz kann fremde TeamSeasons strukturell nicht zurückliefern (siehe Abschnitt 8).
4./5. Sichtbarkeit der Mannschaft und der zugrundeliegenden Match-/Event-/Attendance-Daten: eine einzige `canOnMatch(assignments, "read", { teamId, departmentId })`-Prüfung — dieselbe Regel, die bereits `EventsService.canAccess`/`AttendancesService`-intern für Team-Events greift. Da alle nachgelagerten Aufrufe (`EventsService.list`, `AttendancesService.list`) intern dieselbe `canOnMatch`-Bedingung für Team-Events prüfen, macht die einzelne Top-Level-Prüfung engere Einzelchecks redundant, ohne sie zu umgehen — sie können nach bestandener Top-Level-Prüfung nicht mehr spurious scheitern.

## 8. Tenant Isolation / RLS

Keine neue Tabelle, keine neue RLS-Policy — Statistiken werden ausschließlich aus bereits RLS-geschützten Tabellen (`FootballMatch`, `Event`, `Attendance`, `TeamSeason`) über die tenant-partitionierte `getTenantPrisma(tenantId)`-Instanz gelesen, nie über eine rohe/ungeschützte Verbindung. Explizit gegen einen Cross-Tenant-Leak über Aggregation getestet (siehe Abschnitt 10): ein Tenant erhält für die `teamSeasonId` eines fremden Tenants ausschließlich leere Ergebnismengen, auch bei einem konstruierten `IN [...]`-Abfrageversuch über TeamSeason-IDs beider Tenants (DB-Integrationstest) sowie einen direkten API-Aufruf (404, kein Teilzugriff, API-Integrationstest).

## 9. Backend

Neues, eigenständiges Modul (gleiches Muster wie `EventsModule`/`AttendancesModule`/`TasksModule`):

- `apps/api/src/statistics/statistics.calculations.ts` — reine Berechnungsfunktionen (`computeMatchStatistics`, `computeAttendanceStatistics`).
- `apps/api/src/statistics/statistics.service.ts` — `StatisticsService.getTeamSeasonStatistics(teamSeasonId)`, lädt Rohdaten über `EventsService`/`AttendancesService`, prüft Berechtigung, ruft die reinen Funktionen auf.
- `apps/api/src/statistics/statistics.controller.ts` — `StatisticsController`.
- `apps/api/src/statistics/statistics.module.ts` — importiert `AuthorizationModule`, `EventsModule`, `AttendancesModule`.
- `apps/api/src/app.module.ts` — `StatisticsModule` registriert.
- `apps/api/src/attendances/attendances.module.ts` — `AttendancesService` neu exportiert (siehe Abschnitt 4).

## 10. API

`GET /api/v1/statistics/team-seasons/:teamSeasonId` — reuse des bestehenden `TeamSeason.id` als alleiniger Scoping-Key (statt separater `teamId`+`seasonId`-Query-Parameter), da `TeamSeason` bereits der natürliche Team+Saison-Join und FK-Ziel von `FootballMatch.teamSeasonId` ist. Antwort: `{ teamSeasonId, teamId, teamName, seasonId, seasonName, matches: {...}, attendance: {...} }`. Fehlercodes konsistent mit dem übrigen System: 400 (keine gültige UUID, via `ParseUUIDPipe`), 403 (keine Berechtigung), 404 (TeamSeason existiert nicht oder gehört einem fremden Tenant).

## 11. UI

Neue Route `/statistik` (Auswahl: Team/Saison → Kachelliste, wiederverwendet dieselbe Abteilung→Saison→TeamSeason-Fetch-Kette wie `fussball/spiele/neu/page.tsx`) und `/statistik/[teamSeasonId]` (Detailansicht, gleiches Server-Component-Muster wie `/kalender/[id]`). Neue Komponenten `StatisticsTeamSeasonList` und `StatisticsView` (drei schlichte Karten: Spielbilanz, Torbilanz, Anwesenheit — bewusst kein überladenes Dashboard, siehe Abschnitt 12 des Arbeitsauftrags). Mobile-tauglich (responsives Grid, gleiche Tailwind-Konventionen wie alle übrigen Seiten). Neuer Nav-Eintrag "Statistik" in `nav.tsx`.

## 12. Tests

Alle Zahlen sind real ausgeführte Ergebnisse, keine erfundenen:

| Suite | Ergebnis | Phase-21-Anteil |
|---|---|---|
| API Unit (`apps/api`) | **207/207** grün | 14 neu (`statistics.calculations.spec.ts`) |
| Web Unit (`apps/web`) | **181/181** grün | 11 neu (`statistics-view.test.tsx`, `statistics-team-season-list.test.tsx`) |
| DB Integration (`packages/database`) | **157/157** grün | 7 neu (`statistics.integration.spec.ts`) |
| API Integration (`apps/api`) | **246/246** grün | 9 neu (`statistics.integration-spec.ts`) |
| E2E (`apps/web`, volle Suite) | **27/27** grün | 2 neu (`statistics.spec.ts`) |

Abgedeckt: Spielbilanz/Torbilanz/Tordifferenz (Heim/Auswärts/Neutral-Perspektive, Mehrfach-Aggregation, Sonderfall keine Spiele, defensiver Null-Score-Datensatz), Anwesenheitsquote-Formel inkl. Ausschluss offener/nicht erfasster Einträge aus dem Nenner, Sonderfall keine Attendance-Daten (Quote `null`, nicht `0`), DB-Tenant-Isolation inkl. konstruiertem Cross-Tenant-Aggregationsversuch, API-Autorisierung (403 ohne Rolle, 403 COACH eines anderen Teams, 200 DEPARTMENT_ADMIN, 200 COACH des eigenen Teams), Validierung (400 ungültige UUID, 404 nicht existent), Cross-Tenant (404 statt Teilzugriff), E2E-Happy-Path (Login → Statistik → Team/Saison auswählen → Kennzahlen sichtbar, Werte stimmen mit den angelegten Testdaten überein) sowie E2E-Autorisierung (COACH E1 ohne Zugriff auf fremde TeamSeason-Statistik).

## 13. Gefundene und behobene Fehler

Alle drei während dieser Phase selbst eingeführt (in den neuen Testdateien) und noch vor Abschluss behoben — keine Regression an bestehendem Code:

1. **DB-Integrationstest**: der "leere TeamSeason"-Testfall erzeugte eine zweite `TeamSeason` für dasselbe `teamId`+`seasonId` wie eine bereits in `beforeAll` angelegte — Verletzung des bestehenden `@@unique([teamId, seasonId])`-Constraints. Behoben durch ein eigenes drittes Team für diesen Testfall.
2. **API-Integrationstest**: identischer Fehlerklasse — die "leere TeamSeason" im `beforeAll` verwendete dieselbe Kombination `teamId`+`seasonId` wie die bereits angelegte Haupt-TeamSeason. Behoben durch ein eigenes zweites Team ("E-Leer").
3. **E2E-Testdaten-Kollision (der bedeutendste Fund)**: Der neue `statistics.spec.ts`-Test legte über die UI eine frische Mannschaft mit Namen `E2E Statistik ...` an. Playwright interpretiert Namens-Locator standardmäßig als Substring-Match — `"E2E Statistik ..."` beginnt mit `"E2"` und kollidierte damit mit `getByText("E2")`/`getByRole("link", { name: "E2" })`-Zugriffen in zwei **bereits bestehenden** Tests (`club-structure.spec.ts`, `football-season.spec.ts`), die exakt die seeded Mannschaft "E2" meinten. Ein voller Suite-Lauf reproduzierte das real (2 vormals grüne Tests schlugen fehl). Behoben durch Umbenennung der in `statistics.spec.ts` neu angelegten Mannschaften auf `Statistiktest ...`/`Statistiktest-Fremd ...` (kein "E2"-Präfixkonflikt mehr) und Bereinigung der bereits in der temporären VPS-Datenbank angelegten Alt-Datensätze; ein erneuter voller Suite-Lauf bestätigte **27/27 grün**, inklusive der beiden zuvor betroffenen Bestandstests. Kein bestehender Test wurde in seiner Erwartung verändert — die Ursache lag ausschließlich in der neuen Testdatenbenennung.

## 14. Bekannte Altlasten / technische Schulden

- Wie bei Season/Team in vorherigen Phasen bereits etabliert: E2E-angelegte Testdaten (Personen, Mannschaften, Termine) haben keinen automatisierten Cleanup-Mechanismus und bleiben nach einem Testlauf in der Datenbank bestehen — hier nicht neu eingeführt, sondern bestehende, bereits akzeptierte Charakteristik der E2E-Umgebung.
- Kein neuer technischer Schuld-Posten durch Phase 21 selbst identifiziert.

## 15. Quality Gates

Alle tatsächlich ausgeführt, keine übersprungen:

- `prisma validate`: grün.
- `prisma migrate status`/`migrate diff --exit-code` gegen frische temporäre PostgreSQL 17: alle 15 Migrationen sauber, **Drift: 0**.
- Seed zweimal ausgeführt → identische IDs, Idempotenz bestätigt.
- `pnpm run lint` (gesamtes Monorepo, 8/8 Tasks erfolgreich): grün.
- `pnpm run typecheck` (gesamtes Monorepo, 8/8 Tasks erfolgreich): grün.
- `pnpm run test` (Unit, gesamtes Monorepo): grün, siehe Abschnitt 12.
- DB-/API-Integrationstests gegen echtes PostgreSQL 17: grün, siehe Abschnitt 12.
- E2E (volle Suite) gegen echtes PostgreSQL 17 + lokal gebaute `api`/`web`: grün, siehe Abschnitt 12.
- `pnpm run build` (gesamtes Monorepo, 4/4 Tasks erfolgreich, inkl. `next build` mit den neuen `/statistik`-Routen): grün.
- Markdown-Lint (`markdownlint-cli2`, Projekt-Konfiguration `.markdownlint-cli2.jsonc`): grün (siehe Commit-Historie für den Lauf gegen diesen Bericht selbst).

## 16. Performance

Keine unnötigen N+1-Abfragen: `EventsService.list`/`AttendancesService.list` werden **parallel** (`Promise.all`) statt seriell pro Termin aufgerufen — vermeidet eine unnötige serielle Wartekette über potenziell viele Termine, ohne eine neue Batch-Query einzuführen. Die Spielaggregation nutzt eine einzelne, tenant-gefilterte `footballMatch.findMany`-Abfrage mit `select` auf nur die benötigten Felder. Keine neuen Indizes ergänzt — kein belegter Bedarf, keine vorzeitige Optimierung.

## 17. ADR

**Keine neue ADR erforderlich.** Ausschließlich bestehende Architektur wiederverwendet (`canOnMatch`, `getTenantPrisma`, `EventsService`, `AttendancesService`) — keine neue, genuin architektonische Entscheidung getroffen, die eine Dokumentation über diesen Bericht hinaus rechtfertigen würde.

## 18. Git-/PR-Status

Branch `feat/statistics`, erstellt von `feat/attendance-tracking` (Endcommit `108fbec`) — bewusst nicht von bare `main`, da `main` (und auch `feat/task-tracking`) das `Attendance`/`Event`-Modell aus Phase 19 nicht enthält, dessen Wiederverwendung der Arbeitsauftrag explizit fordert ("keine zweite Anwesenheitslogik"). "PR #23 NICHT mergen" untersagt das Mergen dieser PR (eine konkrete Git-/GitHub-Operation), nicht das Erstellen eines neuen Branches, dessen Historie Phase 19 als Vorfahren enthält (eine normale, nicht-destruktive Git-Operation, die PR #23 selbst nicht anfasst) — die einzige Interpretation, die die Anwesenheits-Wiederverwendungsanforderung überhaupt erfüllbar macht.

PR #23 und PR #24: während der gesamten Phase 21 unverändert OPEN/MERGEABLE/CLEAN belassen (siehe Abschnitt 1, verifiziert per `gh pr list` vor Abschluss). Die neue Phase-21-PR wird gegen `main` geöffnet und **nicht selbst gemergt**.
