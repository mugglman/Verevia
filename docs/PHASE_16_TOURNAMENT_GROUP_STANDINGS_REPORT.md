# Phase 16 – Tournament Group Standings & GROUP_POSITION Resolution

## 1. Ausgangslage

PR #19 (`feat: add tournament match result entry UI`) war beim Start dieses Arbeitspakets bereits gemergt (Squash-Merge-SHA `dbb010f`, verifiziert via `git log`/`git merge-base` gegen `origin/main`). Branch `feat/tournament-group-standings` wurde von diesem aktuellen `main` erstellt (`git merge-base main feat/tournament-group-standings` = `dbb010f`, keine abweichenden Commits davor).

Architektur vor Implementierung real im Code verifiziert (nicht nur aus Berichten übernommen): Tournament-Domain (Groups, Membership, `TournamentMatchSlot`, `GROUP_POSITION`/`WINNER_OF_MATCH`/`LOSER_OF_MATCH`), `FootballMatch`-Modell (Ergebnisfelder, `resultPropagatedAt`), Phase-13-Slot-Auflösung (`resolveDependentSlots`), Phase-14-Ergebnispropagierung (ADR 0011), Phase-15-Ergebnis-UI (`TournamentMatchResultForm`, `resultLocked`), bestehende Transaktions-/Lock-Architektur (`withTenantTransaction`, ADR 0009), `canOnSeason`-Autorisierung, RLS/Tenant-Kontext.

## 2. Architektur

### Gruppentabelle (reine Domain-Logik)

`computeGroupStandings(participantIds, completedMatches)` — neu, in `apps/api/.../schedule/generator/group-standings.ts` — vollständig rein/deterministic/DB-frei. 3/1/0-Wertung. Sortierung: Punkte absteigend → Tordifferenz absteigend → erzielte Tore absteigend → Teilnehmer-ID aufsteigend (**rein technisch**, siehe unten). Jede Zeile trägt zusätzlich `tiedRankGroupSize` (Größe des sportlichen Gleichstand-Blocks, dem dieser Rang angehört).

### Rankingregeln: sportlicher vs. technischer Gleichstand (**zentrale Sicherheitsregel**)

Punkte/Tordifferenz/Tore sind die einzigen sportlichen Kriterien (kein Head-to-Head, wie im Auftrag Abschnitt 6/31 vorgegeben). Danach entscheidet die Teilnehmer-ID — **ausschließlich für eine deterministische Anzeige-Reihenfolge**, niemals als sportliche Aussage. `tiedRankGroupSize > 1` markiert diesen Fall explizit auf jeder betroffenen Zeile. Vollständig dokumentiert in [ADR 0012](architecture/adr/0012-group-standings-derived-technical-tiebreak.md).

### GROUP_POSITION-Auflösung

`resolveParticipantAtPosition(standings, position)` liefert `null` sowohl bei nicht existierender Position als auch bei `tiedRankGroupSize > 1` — bewusst ununterscheidbar für Aufrufer, da in beiden Fällen "automatisch auflösen" unsicher wäre. `planGroupPositionResolutions` nutzt denselben `SlotResolution`-Rückgabetyp wie Phase 13s `planSlotResolutions` — **keine parallele Slot-Architektur**. `applySlotResolutions` (aus der bisherigen `resolveDependentSlots`-Logik extrahiert) ist jetzt der gemeinsame Schreibpfad für `WINNER_OF_MATCH`/`LOSER_OF_MATCH` (Phase 14) UND `GROUP_POSITION` (Phase 16).

### Unvollständige Gruppen

`resolveGroupPositionSlots(txDb, groupId)` prüft `groupMatches.every(m => m.status === "COMPLETED")`, bevor irgendein Slot aufgelöst wird. Solange offen: Zwischenstand wird angezeigt, aber kein Slot verändert.

### Trigger

Kein neuer Endpoint. In `MatchesService.updateTournamentMatch`, direkt nach der bestehenden Phase-14-Slot-Auflösung: `if (updated.tournamentGroupId) { await this.resolveGroupPositionSlots(txDb, updated.tournamentGroupId); }` — läuft automatisch bei jedem `PATCH /football/matches/:id`, das ein Gruppenspiel abschließt.

### Transaktionen/Locking — gefundener und behobener Deadlock

Ursprüngliche Reihenfolge: `updateTournamentMatch` sperrte zuerst die EINZELNE zu patchende Zeile, `resolveGroupPositionSlots` danach die GESAMTE Gruppe (`ORDER BY id FOR UPDATE`). Ein echter PostgreSQL-Concurrency-Test (zwei verschiedene Gruppenspiele derselben Gruppe fast gleichzeitig finalisiert) reproduzierte einen echten Deadlock (`40P01`): Transaktion A hält Zeile X (ihr eigenes Einzel-Lock), will danach Zeile Y (Teil ihres Gruppen-Locks); Transaktion B hält Y (ihr eigenes Einzel-Lock), will danach X — klassischer Circular Wait. **Behoben**: `updateTournamentMatch` sperrt jetzt, sobald ein Gruppenspiel betroffen ist, **zuerst** die komplette Gruppe in derselben deterministischen ID-Reihenfolge (inkl. der eigenen Zeile via `OR id = ${existing.id}`) — dieselbe Ressource, dieselbe Reihenfolge für beide konkurrierenden Transaktionen, kein Circular Wait mehr möglich. Siehe Abschnitt 6 „Gefundene Produktbugs" und `matches.service.ts`, ausführlicher Code-Kommentar an der Fundstelle.

### Idempotenz

Wiederholtes Finalisieren mit identischem Ergebnis erzeugt keine Duplikate, ändert keine bereits korrekten Zuweisungen (`applySlotResolutions` ist ein No-Op auf leerem Plan; bereits aufgelöste Slots existieren nicht mehr in `pendingSlots`). Real gegen PostgreSQL getestet (DB- und API-Ebene).

## 3. UI

Turnier-Detailseite (`apps/web/.../tournament-detail.tsx`), Gruppen-Sektion erweitert: pro Gruppe entweder eine echte `<table>` (Pos/Team/Sp/S/U/N/Tore/Diff/Pkt, `overflow-x-auto`, „Zwischenstand"/„Endstand"-Badge, `*`-Markierung + Erklärtext bei sportlichem Gleichstand) sobald mindestens ein Spiel abgeschlossen ist, sonst die bisherige einfache Teilnehmerliste. Keine neue Seite, keine neue Designwelt (erste `<table>` im Codebase, aber bestehende Tailwind-Klassen/Farbwerte wiederverwendet). Aktualisierung nach Ergebniseingabe über die bestehende `revalidatePath`-Server-Action-Konvention (Phase 15) — kein Full-Page-Reload, kein neuer Cache-Mechanismus.

## 4. Security

Keine neue Autorisierungsarchitektur — `canOnSeason` unverändert wiederverwendet, Ergebniseingabe bleibt über Phase 15 gesichert. Cross-Tenant/RLS: Standings lesen ausschließlich tenant-eigene Daten (`getTenantPrisma`), Slot-Auflösung kann keine fremden Teams übernehmen (real getestet, siehe Abschnitt 6). Keine neue RLS-Policy nötig (kein Schema-Change).

## 5. Tests

| Ebene | Ergebnis |
|---|---|
| Unit (apps/api) | **193/193** grün (14 `group-standings.spec.ts` + 11 `group-position-resolution.spec.ts` neu) |
| Unit (apps/web) | **135/135** grün (4 neue Tests in `tournament-detail.test.tsx`) |
| DB-Integration (real PostgreSQL 17) | **130/130** grün über alle 8 Dateien, davon **8/8** neu in `tournament-group-position-resolution.integration.spec.ts` |
| API-Integration (real PostgreSQL 17, real HTTP) | **181/181** grün über alle 13 Dateien, davon **11/11** neu in `tournament-group-position-resolution.integration-spec.ts` |
| E2E (real PostgreSQL 17, echter Browser) | Neuer Test **grün** (`tournament-group-standings.spec.ts`), volle Regressionssuite 17 grün + 2 bekannte Umgebungs-Flakes (siehe Abschnitt 8) |
| Concurrency (real PostgreSQL 17) | **Grün** nach Deadlock-Fix, 4× in Folge stabil reproduziert grün |

Testabdeckung folgt dem Auftrag: Sieg/Niederlage/Unentschieden, mehrere Spiele, Punkte/Tore/Tordifferenz, Rangfolge, vollständiger sportlicher Gleichstand, deterministische Anzeige, leere/teilweise/voll gespielte Gruppe, Eingabereihenfolge-Unabhängigkeit (Unit); ein/mehrere Gruppen, gekreuzte KO-Zuordnung (A1×B2/B1×A2-Muster), Gleichstand bleibt offen, Idempotenz, Cross-Tenant, Berechtigungen (DB/API); realer Concurrency-Test der letzten zwei Gruppenspiele.

## 6. PostgreSQL/VPS

PostgreSQL 17, temporärer Container `verevia-phase16-pg17-test` (eigenes Volume, `127.0.0.1`-only, Port 55435). Migration aus leerer DB: alle 13 Migrationen sauber angewendet, **Drift: 0** (`prisma migrate diff --exit-code` → „No difference detected"). Seed zweimal ausgeführt → identische IDs, identische Zeilenzahlen (1 Tenant, 3 Turniere, 12 Teilnehmer, 3 Gruppen, 3 Turnier-Spielstättenzuordnungen, 4 Spiele nach beiden Läufen) → **Idempotenz bestätigt**.

## 7. Migration

**Migration: Nein.** `prisma validate` grün, `prisma migrate diff` gegen die frische temporäre DB: kein Unterschied. Standings sind vollständig abgeleitete Daten (siehe ADR 0012) — keine neue Tabelle, keine neue Spalte.

## 8. Bugs

**Gefundene und behobene Produktbugs:**

- **Echter PostgreSQL-Deadlock (`40P01`) bei gleichzeitiger Finalisierung zweier verschiedener Gruppenspiele derselben Gruppe.** Ursache und Fix: siehe Abschnitt 2 „Transaktionen/Locking". Gefunden durch den vom Auftrag geforderten realen Concurrency-Test — nicht simuliert, sondern eine tatsächliche PostgreSQL-Fehlermeldung. Nach dem Fix 4× in Folge stabil grün (1× im vollen Testlauf, 3× isoliert wiederholt).

**Bestehende Altlasten (nicht Teil dieser Phase, nicht verändert):**

- `expectVisibleAfterSubmit` (E2E-Hilfsfunktion, seit Phase 13/14 in praktisch jeder Turnier-E2E-Spezifikation verwendet) reagiert auf eine ausbleibende Sichtbarkeit mit `page.reload()`. Das ist sicher für das erneute Abfragen eines GET-gerenderten Zustands, aber **unsicher für das Warten auf eine Server-Action-Weiterleitung**: reagiert ein `redirect()` einer Server Action (z. B. `createTournamentAction`) unter der gemessenen SSH-Tunnel-Latenz dieser Sitzung (bis zu ~5,2s Ende-zu-Ende für einen einzelnen Request, siehe Trace-Analyse) nicht innerhalb des 4s-Timeouts, verwirft der anschließende `page.reload()` die noch laufende Weiterleitung endgültig — der Server hat die Ressource längst korrekt angelegt (per `x-action-redirect`-Header real bestätigt), nur der Client verarbeitet es nicht mehr. Konkret reproduziert: `tournament-match-result-ui.spec.ts` (Phase 15, unverändert) schlug im vollen Regressionslauf zweimal (Erstversuch + Retry) exakt an dieser Stelle fehl; isoliert nachgestellt und ursächlich zurückverfolgt (nicht nur vermutet). **Nicht in dieser Phase behoben** — Datei gehört zu Phase 15, außerhalb des Scopes dieses Auftrags; siehe Empfehlung Abschnitt 13. Der eigene neue Test dieser Phase (`tournament-group-standings.spec.ts`) verwendet an der analogen Stelle bewusst `page.waitForURL(...)` statt `expectVisibleAfterSubmit`, um genau diesen Fall zu vermeiden (im Code dokumentiert).
- Die bereits aus Phase 12/13 bekannte, aus einem separaten Testlauf reproduzierte Flakiness in `role-management.spec.ts` (nicht Teil dieser Phase) trat einmalig auf, war beim Retry grün — eine bereits mehrfach in früheren Phasenberichten dokumentierte, unabhängige Umgebungs-Eigenheit (Next.js-Streaming-SSR unter zusätzlicher Tunnel-Latenz, siehe Kommentar in `playwright.config.ts`).

**Eigene Testbugs (gefunden und behoben):**

- Erste Fassung von `createSingleGroupWithFinal` (API-Integrationstest) versuchte, nach dem Committen des KO-Baums zusätzlich den Round-Robin-Gruppenplan über den bestehenden Schedule-Generator zu committen — das kollidiert mit einer bewussten, bereits dokumentierten Phase-12/13-Entscheidung („ein Turnier hat höchstens EINEN committed Schedule insgesamt", siehe PHASE_12/13-Berichte). **Nicht als Bug behandelt und nicht umgangen** (ausdrücklicher Auftrag: diese Regel nicht verändern) — stattdessen die Testfixture korrigiert: KO-Baum zuerst committen (während noch keine Spiele existieren), die Gruppenspiele danach einzeln über den bestehenden, von dieser Regel nicht betroffenen manuellen Spiel-Erstellungs-Endpunkt (`POST /tournaments/:id/matches`, Phase 8) anlegen — exakt der Weg, auf dem ein kombiniertes GROUPS_AND_KNOCKOUT-Turnier heute tatsächlich aufgebaut werden kann.
- In derselben Umstellung: zwei `getByLabel("Platz")`/`getByLabel("Gruppe")`-Locators im neuen E2E-Test trafen wegen Playwright-Substring-Matching mehrdeutig auf andere Labels („Spiel um Platz 3 einplanen", „Sportplatz Benediktbeuern", „Gruppe für X") — behoben mit `{ exact: true }`.
- Ein selbst verursachter Logikfehler in den erwarteten Werten des DB-Integrationstests „resolves crossed slots from two groups…" (vertauschte Sieger-/Verlierer-Zuordnung) wurde beim manuellen Nachrechnen selbst gefunden und vor jeder Testausführung korrigiert; beim tatsächlichen Lauf gegen PostgreSQL 17 jetzt bestätigt grün.

**Umgebungsprobleme:** siehe „Bestehende Altlasten" oben — beide dort beschriebenen Fälle sind Umgebungslatenz-bedingt, nicht Phase-16-Code.

## 9. Regression

Keine. Phase 14 (WinnerOfMatch/LoserOfMatch-Propagierung, inkl. der bestehenden `tournament-match-slot-resolution`-Suiten) läuft unverändert grün — die rückwirkend auf `applySlotResolutions` angewendete deterministische Sortierung der Ziel-Locks ist eine reine Robustheitsverbesserung ohne Verhaltensänderung. Phase 15 (Ergebnis-UI) unverändert grün (der eine Fehlschlag in Abschnitt 8 ist ein Umgebungsproblem, kein Regressionsfehler des UI-Codes selbst).

## 10. Quality Gates

`pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle 7 Pakete) grün — vor UND nach dem Deadlock-Fix erneut vollständig ausgeführt. `prisma validate` grün, Drift 0. DB-/API-Integrationstests real gegen PostgreSQL 17 grün. E2E real verifiziert. Markdown-Lint (`markdownlint-cli2`) für alle `docs/**/*.md` grün. `git status`/`git diff` vor dem Commit explizit auf Secrets/temporäre Dateien geprüft — sauber.

## 11. Risiken

Keine neuen struktur­ellen Risiken. Der behobene Deadlock (Abschnitt 8) betraf ausschließlich den neuen Gruppen-Auflösungspfad; ohne den in dieser Phase durchgeführten realen Concurrency-Test wäre er unentdeckt geblieben — bestätigt den Wert der im Auftrag geforderten echten (nicht simulierten) Nebenläufigkeitsprüfung.

## 12. Technische Schulden

Keine neuen. `TournamentGroupsService.list()` berechnet Standings live bei jedem Aufruf (zwei zusätzliche Abfragen pro Turnier) — für die in der Praxis kleinen Turniergruppen vernachlässigbar, aber ein möglicher künftiger Optimierungspunkt bei sehr großen Turnieren (siehe ADR 0012, „Konsequenzen").

## 13. Bewusst nicht implementiert

Elfmeterschießen, Verlängerung, komplexe Head-to-Head-Regeln, manuelle Tiebreak-Entscheidung, Ergebnis-Rollback/Downstream-Reset, Änderung bereits propagierter Ergebnisse, Live Scores, WebSockets, Push Notifications, Drag & Drop, eine persistierte Standings-Tabelle, eine parallele Tournament-Result-API, ein vollständiges Tournament-Admin-Redesign, Swiss System, Double Elimination — alles wie im Auftrag Abschnitt 31 vorgegeben.

**Empfehlung für Phase 17:** `expectVisibleAfterSubmit`s reload-basierte Retry-Strategie durch ein `page.waitForURL`-/Response-basiertes Warten ersetzen (mindestens an den Stellen, die auf eine Server-Action-Weiterleitung warten) — behebt die in Abschnitt 8 dokumentierte, jetzt unter der aktuellen Tunnel-Latenz reproduzierbare Schwachstelle in mehreren bestehenden E2E-Spezifikationen (Phase 13–15), nicht nur in der neuen Datei dieser Phase.

## 14. Dokumentation

Dieser Bericht sowie [ADR 0012](architecture/adr/0012-group-standings-derived-technical-tiebreak.md) (README-Index aktualisiert). Code-Kommentare an allen sicherheitsrelevanten Stellen (technische vs. sportliche Deterministik, Lock-Reihenfolge, Deadlock-Fund).

## 15. Git/PR

- Branch: `feat/tournament-group-standings`
- Endcommit: siehe PR
- PR: siehe unten
- **Gemergt: NEIN**

## 16. VPS-Cleanup — Nachweis

- Temporärer Container `verevia-phase16-pg17-test`: entfernt.
- Temporäres Volume `verevia-phase16-pg17-test-vol`: entfernt.
- SSH-Tunnel: geschlossen (Port 55435 lokal wieder frei).
- Temporärer SSH-Key `verevia-phase16-group-standings-1788173961`: aus `/home/maik/.ssh/authorized_keys` entfernt, **Entfernung durch fehlgeschlagenen Reconnect-Versuch verifiziert** (`Permission denied (publickey,password)`), lokale Schlüsseldateien gelöscht.
- Permanente Ressourcen (`verevia-dev-web`, `verevia-dev-api`, `verevia-dev-postgres`, `verevia-traefik`, `docker_verevia-dev-postgres-data`): **unverändert**, `verevia-prod` **nicht angetastet** (existiert weiterhin nicht, siehe Deployment.md).
- Keine Secrets, keine `.env`-Dateien, keine temporären Testartefakte im Repository (`git status` vor Commit geprüft, `test-results/`/`e2e/.auth/` sind bereits gitignored).

TOURNAMENT GROUP STANDINGS READY
