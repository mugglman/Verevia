# Phase 13 – Tournament Knockout Generator V1

## 1. Phase-12-Abschluss

PR #16 (`feat(tournament): add tournament schedule generator`) war beim Start dieses Arbeitspakets grün, wurde geprüft und gemergt (Merge-SHA `569d253`). `main` lokal aktualisiert, Phase 12 vollständig in `main` bestätigt, Branch `feat/tournament-knockout-generator` von `main` (`569d253`) erstellt.

## 2. Architektur

Wiederverwendung der Phase-12-Pipeline (Input → reiner Domain-Generator → Validierung → kanonischer Fingerprint → Preview → Commit → serverseitige Re-Generierung → Fingerprint-Vergleich → atomare Persistierung), keine zweite parallele Architektur. Neue Dateien unter `apps/api/src/football/tournaments/schedule/generator/`, alle `knockout-*`-präfixiert, alle DB-frei/framework-frei/deterministisch:

- `knockout-bracket.generator.ts` — Seeding + Bracket-Erzeugung inkl. BYE- und Spiel-um-Platz-3-Logik.
- `knockout-dependency-graph.ts` — Validierung des Abhängigkeitsgraphen (Zyklen, unbekannte Referenzen, Rundenreihenfolge).
- `knockout.scheduler.ts` — Slot-/Venue-Zuweisung, erweitert Phase 12s Mechanismus um abhängigkeitsbasierte früheste Startzeiten.
- `knockout-fingerprint.ts` — SHA-256-Fingerprint.
- `knockout-types.ts` — `SlotSource`, `KnockoutRound`, `KnockoutBracket` etc.

`TournamentKnockoutService`/`TournamentKnockoutController` sind die einzige Brücke zur Datenbank bzw. zum HTTP-Layer — keine Scheduling-Logik in Controllern, React-Komponenten oder direkten Prisma-Queries.

## 3. Fachliches Modell

`FootballMatch` bleibt die einzige Match-Entität — **kein neues `TournamentMatch`**, wie in Auftrag Abschnitt 4 gefordert. Vier abstrakte Teilnehmer-Quellen als `SlotSource`-Discriminated-Union: `TEAM` (sofort auflösbar, direkt in `homeParticipantId`/`awayParticipantId`), `GROUP_POSITION`, `WINNER_OF_MATCH`, `LOSER_OF_MATCH` (letztere drei "pending", siehe Abschnitt 8). Kein hartkodierter Sonderfall wie "wenn Halbfinale 1 dann …" — jede Runde wird durch denselben generischen Algorithmus erzeugt.

## 4. Bracket-Generator und Seeding

`generateKnockoutBracket(entrants, includeThirdPlace)`: iterativ, Runde für Runde halbierend (Viertelfinale → Halbfinale → Finale), stabile Match-Keys (`QF-1`, `SF-1`, `SF-2`, `THIRD-PLACE`, `FINAL`) — nie von zufälligen DB-IDs abhängig. Deterministisches Standard-Seeding (`computeSeedOrder`, rekursiv) — für 8 Teilnehmer exakt das im Auftrag vorgegebene Muster 1v8, 4v5, 2v7, 3v6, per Hand nachgerechnet und durch Unit-Tests abgesichert. Spiel um Platz 3 wird, falls angefordert, direkt nach der Halbfinal-Runde eingefügt, referenziert beide Halbfinal-Keys als `LOSER_OF_MATCH`.

## 5. BYE-Behandlung

Bei nicht vollständig gefülltem Feld (z. B. 6 Teilnehmer in einem 8er-Baum) erhalten die höchsten Setzungsnummern ein BYE. Ein BYE erzeugt **kein** `FootballMatch` — die `SlotSource` des BYE-Teilnehmers wird direkt in die nächste Runde durchgereicht (kein `WINNER_OF_MATCH`-Wrapper). Per Konstruktion (korrekt geseedeter, auf die nächste Zweierpotenz aufgefüllter Baum) kann ein BYE ausschließlich in der ersten Runde auftreten — das vereinfacht Scheduler und Fingerprint erheblich, da nur `TEAM`-Quellen je konkret sind. Durch 18 Unit-Tests abgesichert, inkl. hand-nachgerechneter 5- und 6-Teilnehmer-Fälle.

## 6. Persistierungsentscheidung: `TournamentMatchSlot` (ADR 0010)

Die zentrale Architekturfrage dieser Phase. Analysiert und verworfen: zehn neue nullable Spalten direkt auf `FootballMatch`, Platzhalter-`TournamentParticipant`-Zeilen, ein Freitext-Beschreibungsfeld, gar keine Persistenz. Entschieden: (1) die `football_match_mode_consistency`-CHECK-Constraint wird gelockert — im Turniermodus dürfen `homeParticipantId`/`awayParticipantId` jetzt NULL sein (einzeln oder beide), Selbstspiele bleiben weiterhin verboten; (2) eine neue, kleine Tabelle `TournamentMatchSlot` — eine Zeile pro (Spiel, Seite), ausschließlich für noch nicht aufgelöste Seiten. `TEAM`-Quellen brauchen keine Zeile. Composite-FKs (`matchId`/`sourceMatchId` → `football_match(tenantId, tournamentId, id)`, `groupId` → `tournament_group`) folgen exakt dem ADR-0008-Muster — strukturell garantierte Turnier-Konsistenz ohne Trigger. Vollständige Begründung inkl. aller verworfenen Alternativen: [ADR 0010](architecture/adr/0010-knockout-pending-match-slots.md).

## 7. Migration

Eine neue Migration (`20260830140558_add_knockout_match_slots`): `CREATE TYPE` für `MatchSlotSide`/`MatchSlotSourceType`, `CREATE TABLE tournament_match_slot`, neuer Unique-Index `football_match(tenantId, tournamentId, id)`, gelockerte `football_match_mode_consistency`-CHECK, RLS-Aktivierung für die neue Tabelle nach demselben Muster wie jede vorherige RLS-Migration. Aus leerer PostgreSQL-17-Instanz real verifiziert: alle 12 Migrationen (11 aus Phase 1–12 + diese) wenden sich sauber an, `prisma migrate status` bestätigt "up to date", `prisma migrate diff` gegen die live migrierte DB liefert 0 Diff.

## 8. Abhängigkeitsgraph

`validateKnockoutDependencyGraph`: baut Kanten aus `WINNER_OF_MATCH`/`LOSER_OF_MATCH`-Quellen, prüft Selbstreferenz, unbekannte Referenz, Rundenreihenfolge (Quellindex < Zielindex), dann DFS-basierte Drei-Farben-Zyklenerkennung über die gesamte Match-Menge — keine rekursive Konstruktion ohne Zyklenschutz. 10 Unit-Tests inkl. handgebauter defekter Graphen (Zyklus, Selbstreferenz, unbekannte Referenz).

## 9. Scheduling

Erweitert Phase 12s Slot-Grid-Mechanismus (`schedule.scheduler.ts`) um: `earliestAllowedStart` pro Spiel, hergeleitet aus der `endsAt` des Quellspiels plus `minimumRestMinutes`, sobald das Spiel eine `WINNER_OF_MATCH`/`LOSER_OF_MATCH`-Abhängigkeit hat — der Scheduler prüft also nicht nur bekannte Teilnehmer-IDs, sondern die Bracket-Abhängigkeit selbst, auch wenn beide Teams noch unbekannt sind (z. B. Halbfinale → Finale respektiert die Mindestpause, obwohl zum Planungszeitpunkt kein konkretes Team feststeht). Teilnehmer-Konfliktprüfung ausschließlich für `TEAM`-Quellen (die einzigen mit einer konkreten Identität). Spielstätten-Konflikte, Turnierende, Mindestpause: identische Prüflogik wie Phase 12.

## 10. Fingerprint

`computeKnockoutFingerprint`: SHA-256, kanonisch, deterministisch. Berücksichtigt Turnier, Bracket-Konfiguration, Teilnehmerquellen (Reihenfolge bewusst **beibehalten**, da semantisch relevant für die Setzung — anders als Phase 12s Round-Robin-Teilnehmermenge), Seeds, Match-Abhängigkeiten, Spiel-um-Platz-3-Flag, Scheduling-Konfiguration, Spielstätten, Zeitparameter, Generator-Version (`tournament-knockout-v1`). 10 Unit-Tests, inkl. Versions-Sensitivität über einen dedizierten Override-Parameter.

## 11. Preview und Commit

`POST .../knockout/preview` (200 OK, nicht der NestJS-Default 201 — persistiert nichts) und `POST .../knockout/commit` (201). Commit-Ablauf identisch zu Phase 12 (ADR 0009 wiederverwendet): Autorisierung vor Transaktionsbeginn, `SELECT … FOR UPDATE`-Zeilensperre, bestehender Spielplan wird geprüft (**turnierweit, nicht schedule-typ-spezifisch** — ein Turnier hat höchstens EINEN Spielplan insgesamt, egal ob Round-Robin oder KO), Turnierzustand frisch geladen, Bracket serverseitig komplett neu generiert, Fingerprint verglichen, dann zwei sequenzielle `createMany`-Aufrufe (erst `footballMatch`, dann `tournamentMatchSlot`) innerhalb derselben Transaktion. Alle Spiel-UUIDs werden vor dem Insert per `randomUUID()` vorab erzeugt, damit `sourceMatchId`-Selbstreferenzen innerhalb eines einzigen atomaren Batches funktionieren.

## 12. Autorisierung

Unverändert gegenüber Phase 12: `TENANT_ADMIN` immer, `DEPARTMENT_ADMIN` der eigenen Fußballabteilung (`canOnSeason`, "update"). `COACH` erhält für Preview **und** Commit `403 Forbidden` — serverseitig durchgesetzt, nicht nur UI-verborgen (live per API-Integrationstest und direktem Navigationsversuch in der Web-UI bestätigt). Cross-Tenant-Zugriff bleibt vollständig durch RLS verhindert.

## 13. Web-UI

Neue Route `/fussball/turniere/:id/ko-baum`, server-seitig gerendert nach demselben Muster wie Phase 12s `/spielplan` (alle Daten server-side via `apiFetch` geladen, reine Client-Komponente für Interaktivität). Die Turnierdetailseite bietet jetzt zwei CTAs im "Spiele"-Abschnitt, abhängig vom Turniermodus (`mode !== "KNOCKOUT"` → "Spielplan erstellen", `mode !== "GROUPS"` → "KO-Baum erstellen"), beide weiterhin nur bei `canEdit && matches.length === 0`. Setzliste: Teilnehmer werden per Klick in Reihenfolge zur Setzung hinzugefügt (Auf-/Ab-Buttons zum Umsortieren, kein Drag & Drop), alternativ Gruppenplatzierungen (Gruppe + Platz) für Modus A. Vorschau zeigt das Bracket rundenweise gruppiert (Viertelfinale/Halbfinale/Finale als eigene Überschriften) statt einer breiten Tabelle — auf Mobilgeräten kein horizontales Monster, da durchgehend einspaltig gestapelt (kein `sm:`/`md:`-Layoutwechsel nötig). Konfliktmeldungen und Sourcelabels ("Sieger Halbfinale 1", "Gruppe A, Platz 1") kommen bereits vollständig aufbereitet vom Server.

## 14. Gefundener und behobener Bug: mehrdeutige Sieger-Labels

Während der realen E2E-Verifikation gefunden (deterministisch reproduzierbar, kein Flakiness-Artefakt): `TournamentKnockoutService.describeSource` erzeugte für `WINNER_OF_MATCH`/`LOSER_OF_MATCH`-Quellen nur `"Sieger Halbfinale"` bzw. `"Sieger Viertelfinale"` — **ohne** Index. Bei einem 4-Teams-Bracket sind dadurch beide Finale-Seiten identisch beschriftet ("Sieger Halbfinale" – "Sieger Halbfinale"), bei 8 Teams sogar alle vier Halbfinal-Quellen ("Sieger Viertelfinale" ×4) ununterscheidbar — eine echte UX-Mehrdeutigkeit, kein rein kosmetisches Detail. Behoben durch Anhängen des Runden-internen Match-Index (aus dem ohnehin vorhandenen stabilen Match-Key, z. B. `SF-2` → `"2"`) an das Label: `"Sieger Halbfinale 1"`/`"Sieger Halbfinale 2"`. Durch einen neuen, gezielten API-Integrationstest abgesichert (prüft `homeLabel`/`awayLabel` des Finale-Eintrags in der Preview-Response).

## 15. Deutsche UX-Texte

Keine technischen Fehlercodes in Preview/Commit-Antworten. Beispiele: `"Ein Spiel um Platz 3 ist mit dieser Teilnehmerzahl/Freilos-Verteilung nicht möglich, da nicht beide Halbfinal-Partien tatsächlich ausgetragen werden."`, `"Das Turnier wurde seit der Vorschau geändert. Bitte den KO-Baum neu berechnen."`, `"Für dieses Turnier existiert bereits ein Spielplan."` Interne Konflikt-Codes (`SELF_REFERENCE`, `DEPENDENCY_CYCLE` etc.) existieren nur intern in `ScheduleConflict.code`, nie in der Nutzer-sichtbaren Antwort.

## 16. Performance-Guardrails

`SCHEDULE_GENERATION_LIMITS.maxKnockoutEntrants = 16` — zentral in `generator/limits.ts`, keine verstreuten Magic Numbers. Wiederverwendet: `maxVenues`, `maxSlotSearchIndex` aus Phase 12.

## 17. Tests — Übersicht

- Bracket-Generator (Unit, pure): 18 Tests.
- Abhängigkeitsgraph (Unit, pure): 10 Tests.
- Scheduler (Unit, pure): 11 Tests.
- Fingerprint (Unit, pure): 10 Tests.
- Gesamt `apps/api` Unit-Tests: **156/156 grün** (inkl. aller Vor-Phasen).
- DB-Integration (neu, `tournament-knockout.integration.spec.ts`): CHECK-Lockerung (5 Tests), `TournamentMatchSlot` Composite-FK-Konsistenz (7 Tests, inkl. dedizierter Commit-Atomarität-Nachweis), RLS-Tenant-Isolation (3 Tests) — **111/111** der gesamten DB-Integrationssuite grün gegen echtes PostgreSQL 17.
- API-Integration (neu, `tournament-knockout.integration-spec.ts`, 16 Tests): siehe Abschnitt 18.
- Web-Unit (neu, `tournament-knockout-generator.test.tsx`, 10 Tests): **116/116** der gesamten Web-Suite grün.
- E2E (neu, `tournament-knockout.spec.ts`): siehe Abschnitt 19.

## 18. API-Integrationstests

`apps/api/test/tournament-knockout.integration-spec.ts` (16 Tests): 401 ohne Session, TENANT_ADMIN Preview(200)+Commit(201), DEPARTMENT_ADMIN eigene Abteilung erlaubt, fremde Abteilung verboten (403), COACH Preview+Commit verboten (403), Preview erzeugt 0 `FootballMatch`-Zeilen, Preview deterministisch, Spielstätte nicht zugeordnet abgelehnt (400), unbekannter Teilnehmer abgelehnt (404), Spiel-um-Platz-3 bei strukturell unmöglicher Halbfinal-Konstellation als `valid:false` (nicht als Fehler), Turnierende-Konflikt als `valid:false`, 404 bei nicht existierendem Turnier, stale Preview → 409 (0 Matches danach), bestehender Spielplan → 409, korrekte Match-/Slot-Felder nach Commit (inkl. des in Abschnitt 14 behobenen Label-Tests), zwei gleichzeitige Commits → genau 201/409, keine doppelten Matches.

Bei der ersten Ausführung fielen 3 Tests auf — **eigene Testfehler, kein Produktcode-Fehler**: die Standard-`defaultSettings()`-Hilfsfunktion nutzte anfangs ein leeres `entrants`-Array, das gegen `CreateKnockoutPreviewDto`s `@ArrayMinSize(2)` verstößt und dadurch vor jeder Auth-/Tournament-Lookup-Logik mit `400` abgelehnt wurde — behoben durch zwei syntaktisch gültige Standard-Entrants; ein weiterer Test verwendete "Nil-UUIDs" (`00000000-…-000000000000`), die `class-validator`s `@IsUUID()` korrekterweise als nicht-RFC4122-konform ablehnt — behoben durch echte `randomUUID()`-Werte. Nach beiden Fixes: 154/154 der gesamten API-Integrationssuite grün (per-Datei-Lauf, siehe Abschnitt 20).

## 19. E2E

Neu (`apps/web/e2e/tournament-knockout.spec.ts`): TENANT_ADMIN legt ein eigenes temporäres KNOCKOUT-Testturnier an (4 externe Teilnehmer, 1 Spielstätte — bewusst nicht das Seed-Turnier "Verevia Pokal 2026" wiederverwendet, aus demselben Grund wie Phase 12s E2E-Test) → 4 Teilnehmer per Klick in die Setzliste → KO-Baum berechnen → gültige, nach Runde gruppierte Vorschau (Halbfinale/Finale) mit den in Abschnitt 14 gefixten eindeutigen Labels → KO-Baum übernehmen → Redirect zur Turnierdetailseite → 3 persistierte Spiele sichtbar, CTA verschwunden. Zusätzlich: COACH liest das Seed-Turnier "Verevia Pokal 2026", aber ein direkter Navigationsversuch auf `/ko-baum` wird serverseitig blockiert.

Bei der ersten Ausführung ein **eigener Testfehler** gefunden: `getByRole("heading", { name: "Finale" })` traf per Substring-Matching sowohl auf die "Finale"- als auch auf die "Halbfinale"-Überschrift (Playwright matcht standardmäßig als Teilstring) — behoben mit `exact: true`. Isoliert (`tournament-knockout.spec.ts` allein, 2 Wiederholungen) zweimal vollständig grün (2/2 Tests).

## 20. PostgreSQL-17-/VPS-Verifikation

Real durchgeführt. Temporärer PostgreSQL-17-Container (`verevia-phase13-pg17-test`, eigenes Docker-Volume, `127.0.0.1`-only), per SSH-Tunnel lokal erreichbar gemacht (sitzungsgebundener Phase-13-Key `verevia-phase13-knockout-generator-1788101041`, vom Nutzer manuell hinterlegt und per Verbindungstest verifiziert). Ablauf:

1. `prisma migrate deploy` aus leerer DB: alle 12 Migrationen (11 + die neue) sauber angewendet.
2. `prisma migrate status` → "up to date"; `prisma migrate diff` gegen die live migrierte DB → leerer Diff.
3. Seed zweimal → idempotent (identische IDs für alle drei Turniere; Zähl-Query bestätigt exakt 3 Turniere/12 Teilnehmer/3 Gruppen/3 Spielstättenzuordnungen/4 Spiele/0 Slots nach zwei Läufen).
4. DB-Integrationstests: **111/111 grün** gegen echtes PostgreSQL 17.
5. API-Integrationstests: **154/154 grün**. Bei voller Parallelausführung (11 Testdateien gleichzeitig über denselben SSH-Tunnel) traten sporadische Timeouts/403-Fehlklassifikationen durch Tunnel-Kontention auf (verifiziert als Umgebungsartefakt, nicht als Produktcode-Fehler: dieselben Tests liefen isoliert reproduzierbar korrekt) — mitigiert durch sequenzielle Ausführung je Testdatei als separater Prozess statt eines gemeinsamen parallelen Laufs; danach durchgehend grün, auch bei erneuter Ausführung nach dem Label-Fix aus Abschnitt 14.
6. `apps/api`/`apps/web` produktiv gebaut und lokal gestartet (Port 3001/3000), gegen den Tunnel-erreichbaren Testcontainer.
7. Playwright-E2E-Suite: **Phase-13-eigene Tests (`tournament-knockout.spec.ts`) 2/2 grün, isoliert zweimal wiederholt reproduzierbar.** Die volle Suite (alle 16 E2E-Tests, mehrere bereits aus Phase 3–12 bestehende, von Phase 13 unveränderte Dateien) zeigte unter diesem Tunnel diesmal spürbar stärkere, breit über unveränderten Code verteilte Latenz-Flakiness als in früheren Phasen dokumentiert (u. a. `guardian-invitation.spec.ts`, `role-management.spec.ts`, `team-membership.spec.ts`, `match-foundation.spec.ts`, `tournament-schedule.spec.ts` — keine davon Teil dieser Phase) — bestätigt als reines Tunnel-Latenz-Artefakt dieser Sitzung (dieselben Assertions, keine Codeänderung, wechselnd bestehend/fehlschlagend zwischen Wiederholungen; entspricht der bereits in `playwright.config.ts`s eigenem Kommentar sowie den Phase-4/10/11/12-Berichten dokumentierten Klasse von SSH-Tunnel-Latenz-Flakiness). Kein einziger dieser Fehlschläge betraf Phase-13-Code oder ließ sich isoliert reproduzieren.
8. Vollständig aufgeräumt (siehe Abschnitt 22).

## 21. Quality Gates

Vollständig grün, lokal und real gegen PostgreSQL 17: `pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle 7 Pakete), `prisma validate`, Migration aus leerer DB (1 neue Migration, 0 Drift), Seed 2×, DB-Integrationstests (111/111), API-Integrationstests (154/154), Web-Tests (116/116 gesamt, davon 10 neu), Phase-13-E2E (2/2, isoliert reproduzierbar grün). Keine Tests deaktiviert, keine Warnungen wegkonfiguriert.

## 22. VPS-/SSH-Cleanup

Lokale `api`/`web`-Prozesse beendet, temporärer PostgreSQL-Container und sein Docker-Volume auf dem VPS vollständig entfernt (verifiziert: nur die permanenten `verevia-dev-*`/`verevia-traefik`-Container verbleiben, `verevia-prod` existiert weiterhin nicht/nicht angetastet), SSH-Tunnel geschlossen, temporärer SSH-Key aus `authorized_keys` entfernt und die Entfernung per `grep` (0 Treffer) sowie einem fehlschlagenden erneuten Verbindungsversuch verifiziert, lokale Schlüsseldateien gelöscht. Alle Testdaten existierten ausschließlich im inzwischen entfernten temporären Container — keine Bereinigung auf der persistenten `verevia-dev-postgres` nötig.

## 23. Sicherheit / Tenant-Isolation

Keine Änderung an der bestehenden RLS-/Tenant-Kontext-Architektur. Die neue Tabelle folgt exakt demselben Muster (DMMF-basierte `TENANT_SCOPED_MODELS`-Auto-Ableitung, `withTenantTransaction` für den Commit). Cross-Tenant-Zugriff auf `TournamentMatchSlot` live per DB-Integrationstest verifiziert (Tenant B sieht Tenant As Slots weder über den tenant-gebundenen noch über den rohen Client, kein Tenant-Kontext sieht nichts — fail closed).

## 24. Risiken

- Der Scheduler ist wie in Phase 12 bewusst nicht backtracking-fähig — dieselbe, bereits dokumentierte Einschränkung gilt jetzt auch für abhängigkeitsbasierte KO-Zeitfenster.
- `TournamentKnockoutService` dupliziert bewusst `TournamentScheduleService`s Tournament-Include/-Type (`KNOCKOUT_TOURNAMENT_INCLUDE`/`KnockoutTournament` vs. `SCHEDULE_TOURNAMENT_INCLUDE`/`ScheduleTournament`) statt einen gemeinsamen Loader zu extrahieren — pragmatischer Kompromiss, siehe Abschnitt 25.
- Die vollständige Playwright-E2E-Suite ist unter dieser Sitzung sichtbar latenzempfindlicher als in früheren Phasen — reines Infrastrukturmerkmal des SSH-getunnelten Testaufbaus, kein Produktrisiko, aber ein wiederkehrender Verifikationsaufwand für künftige Phasen.

## 25. Technische Schulden

- Duplizierter Tournament-Include/-Type zwischen `TournamentScheduleService` und `TournamentKnockoutService` (siehe Abschnitt 24) — ein künftiger gemeinsamer Loader wäre eine sinnvolle, aber nicht dringende Vereinfachung.
- Kein automatischer Auflösungsschritt für `TournamentMatchSlot` nach Abschluss eines Quellspiels (bewusst außerhalb des Phase-13-Scopes, siehe ADR 0010 "Konsequenzen").

## 26. Bewusst nicht implementiert (Scope-Grenze)

Live-Ergebniserfassung, automatische Tabellen-/Punkte-/Tordifferenzberechnung, automatische Gruppen-Platzierungsauflösung, automatische Auflösung von `WinnerOfMatch` nach einem Ergebnis, Re-Scheduling nach Spielende, Verlängerung, Elfmeterschießen, Live-Ticker, Schiedsrichterplanung, Push-Benachrichtigungen, öffentliche Turnierseite, Drag-and-Drop-Bracket-Editor, Double Elimination, Swiss System, Liga-Modus, Auslosung/Lostopf, KI-basierte Optimierung.

## 27. Empfohlener nächster Schritt

Ein künftiger Auflösungsschritt könnte nach Abschluss eines KO-Spiels (bzw. nach einer künftigen Tabellenberechnung für Gruppenplatzierungen) die zugehörigen `TournamentMatchSlot`-Zeilen auflösen und die abhängigen Spiele mit dem nun bekannten Teilnehmer aktualisieren — die in ADR 0010 gewählte Struktur hält dafür bereits alle nötigen Informationen bereit, ohne dass diese Phase selbst etwas davon umsetzen musste.

## 28. Nächster Schritt

PR (`feat(tournament): add tournament knockout generator`) durchsehen und freigeben — **kein Merge in diesem Schritt**, kein Deployment. Ausdrücklich weiterhin nicht Teil dieser Phase: Live-Ergebnisse, automatische Gewinner-Auflösung, Phase 14.
