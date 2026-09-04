# Phase 18 – Kalender & Termine

## 1. Ausgangslage

PR #21 (`feat: add public tournament page`) war zu Beginn dieses Arbeitspakets bereits geprüft (OPEN, CI grün, MERGEABLE, CLEAN) und wurde vor jeder Phase-18-Implementierung squash-gemergt. **Phase-17-Merge-SHA: `dc0f737`** (verifiziert via `git log -1 origin/main` nach `git pull --ff-only`). Branch `feat/calendar-events` wurde von diesem verifizierten `main` erstellt.

## 2. Scope-Herleitung

Kein expliziter „Phase 18"-Eintrag existierte im Repository. Die dokumentierte Produktplanung ließ mehrere plausible nächste Schritte zu, ohne eine explizite Priorisierung untereinander:

- `docs/roadmap/Roadmap.md` nennt sowohl „Kalender & Termine" als auch grundlegende Vereins-/Mitgliederstatistik und eine öffentliche Vereinswebsite als offene Punkte; die dort dokumentierte Reihenfolge war bereits einmal bewusst abgewichen worden (Turnierplan/Turnierseite vor Kalender).
- `docs/product/MVP-Scope.md` und `docs/product/Product-Vision.md` nennen Termin-/Kalenderverwaltung als eigenständigen MVP-Baustein, unabhängig vom Turnier-Modul.

Da keine der drei Optionen (Kalender, Statistik, Website) durch die Dokumente eindeutig als zwingend nächster Schritt ausgezeichnet war und die bisherige Abweichung von der Roadmap-Reihenfolge keine belastbare Präzedenz für eine bestimmte Wahl war, wurde die Ambiguität gemäß Auftrag **nicht geraten**, sondern dem Nutzer zur Entscheidung vorgelegt. Ergebnis: **„Kalender & Termine"**.

Scope: vereinsweite Termine (Training, Besprechung, Sonstiges), zugeordnet zu genau einer Mannschaft ODER einer Abteilung, mit optionalem Saison-/Spielstätten-Bezug, sichtbar/verwaltbar entlang der bestehenden Rollen-Kaskade.

## 3. Bewusst nicht im Scope

Kein ICS-/Kalender-Export, keine wiederkehrenden Termine (Serientermine), keine Teilnehmer-/Zusagenverwaltung (Attendance) für Termine, keine Verknüpfung mit `FootballMatch` (Spiele bleiben ein eigenständiges Modell, siehe Abschnitt 4), keine Benachrichtigungen/Erinnerungen — nichts davon ist in den referenzierten Produktdokumenten für diesen Punkt gefordert.

## 4. Architektur

Siehe [ADR 0014](architecture/adr/0014-event-dual-scope-authorization.md) für die vollständige Begründung. Kernpunkte:

- Neues, sportartneutrales, top-level `Event`-Modell (analog zu `Venue` aus Phase 10) — nicht unter `football/`, da Termine nicht fußballspezifisch sind.
- **Dual-Scope-Autorisierung** (die zentrale architektonische Entscheidung): ein Termin gehört exklusiv entweder zu einer `Team` ODER einer `Department` (XOR, per `CHECK`-Constraint `event_scope_xor`, analog zu `tournament_participant_source_xor` aus ADR 0008). Mannschafts-Termine nutzen unverändert `canOnMatch` (alltägliche Trainer-Aufgabe, vgl. `Roles-and-Permissions.md`), Abteilungs-Termine unverändert `canOnSeason` (administrative Aufgabe). **Keine neue `AuthorizationService`-Methode** — die Verzweigung lebt direkt in `EventsService.canAccess`, analog zu `MatchesService.canAccess`s bestehender Verein-vs-Turnier-Verzweigung.
- Neuer, dedizierter Endpunkt `GET /events/creatable-scopes` (vor `GET /:id` registriert, NestJS matcht Routen in Deklarationsreihenfolge) liefert exakt die Mannschaften/Abteilungen, für die der Aufrufer tatsächlich anlegen darf — behebt eine sonst mögliche UX-Inkonsistenz (Dropdown zeigt lesbare, aber nicht schreibbare Optionen an).
- **Keine zweite Berechtigungs-Engine, kein zweites Terminmodell**: bestehende `canOnMatch`/`canOnSeason` unverändert wiederverwendet.

## 5. Domainlogik

Reine Validierung (`assertValidDateRange`: `endsAt >= startsAt`) sowie die `canAccess`-Verzweigung liegen pur im Service, unabhängig von der DB-Zugriffsschicht. Keine neue Berechnungslogik über die bestehenden Muster hinaus.

## 6. Datenmodell / Migration

**Migration: Ja.** Neue Migration `20260901120000_add_event_calendar`: `EventType`-Enum (`TRAINING`/`MEETING`/`OTHER`), Tabelle `event` (5 Indizes, 5 Foreign Keys zu `Tenant`/`Department`/`Team`/`Season`/`Venue`), `CHECK`-Constraints `event_scope_xor` und `event_valid_date_range`, Standard-RLS-Block (`ENABLE`/`FORCE ROW LEVEL SECURITY` + 4 Policies) für die neue Tabelle. Begründung: neue fachliche Entität ohne bestehendes Analogon, kein Wiederverwendungspotenzial eines existierenden Modells. `prisma validate` grün, `prisma migrate status` gegen die frische temporäre PostgreSQL-17-DB: alle 14 Migrationen sauber angewendet, **Drift: 0**.

## 7. API

- `GET /events` — `{items, canCreate}` (Muster analog `VenueListResponse`), Filter nach Team/Abteilung/Zeitraum.
- `GET /events/creatable-scopes` — `{teams, departments}`, gefiltert auf tatsächlich erlaubte Ziele.
- `GET /events/:id`, `POST /events`, `PATCH /events/:id`, `DELETE /events/:id` — Standard-CRUD, Autorisierung siehe Abschnitt 4/9.

## 8. UI

Neue Seiten `/kalender` (Übersicht, analog `matches-overview.tsx`), `/kalender/neu` (Anlegen, ein kombiniertes „Für wen"-Dropdown mit `<optgroup>`s für Mannschaften/Abteilungen, gespeist aus `creatable-scopes`), `/kalender/[id]` (Detail/Bearbeiten/Löschen). Wiederverwendete, bestehende `DateTimeInput`-Komponente (Phase 11) für Start/Ende — keine neue Datumskomponente. Neuer „Kalender"-Link in der Hauptnavigation.

## 9. Permissions

Keine neue Autorisierungsarchitektur — die Dual-Scope-Verzweigung nutzt ausschließlich bestehende, bereits exhaustiv getestete `AuthorizationService`-Methoden. `EventListResponse.canCreate` ist ein vereinfachtes, vereinsweites „kann irgendwo anlegen"-Flag zur UI-Steuerung (Sichtbarkeit des „Termin anlegen"-Links), die tatsächliche Durchsetzung erfolgt serverseitig pro Anfrage über `canAccess`.

## 10. Tenant Isolation

Standard-RLS-Block für die neue `event`-Tabelle (siehe Abschnitt 6). Die bestehende, DMMF-introspektierende Guard-Testdatei `tenant-scoped-models.spec.ts` (verifiziert automatisch, dass jedes `tenantId`-tragende Modell korrekt durch `getTenantPrisma` gewrappt ist) hatte das Fehlen von `"Event"` in ihrer erwarteten Modell-Liste korrekt erkannt (echter, durch diesen Test gefundener Fehlschlag) — behoben durch Ergänzung von `"Event"`, was zugleich bestätigt, dass Events RLS-Wrapping ohne manuelle Code-Änderung an `tenant-prisma.ts` funktioniert. Cross-Tenant-Verhalten (Tenant B sieht/ändert Tenant As Termine nicht) explizit in `calendar-events.integration.spec.ts` (DB-Ebene) und `calendar-events.integration-spec.ts` (API-Ebene) getestet.

## 11. Concurrency

Termine sind einfache, tenant-gescopte Einzelzeilen-Schreibvorgänge ohne Mehrschritt-Transaktionen, gemeinsame Zähler oder Locking-Bedarf (im Unterschied z. B. zur Turnier-Spielplan-Übernahme aus Phase 14/16). Kein neuer Lock-Pfad, keine Race-Condition-Angriffsfläche über die Standard-Tenant-Transaktion hinaus — daher kein dedizierter Concurrency-Test nötig.

## 12. Tests

| Ebene | Ergebnis |
|---|---|
| Unit (apps/api) | **193/193** grün (unverändert — Domainlogik ist trivial genug, um vollständig durch Integrationstests abgedeckt zu sein) |
| Unit (apps/web) | **160/160** grün (15 neu: `events-overview.test.tsx` [6], `event-create-form.test.tsx` [4], `event-detail.test.tsx` [5]) |
| Unit (packages/database) | **5/5** grün (unverändert) |
| DB-Integration (real PostgreSQL 17) | **143/143** grün über 9 Dateien, davon **13/13** neu in `calendar-events.integration.spec.ts` |
| API-Integration (real PostgreSQL 17, real HTTP, seriell ausgeführt) | **216/216** grün über 15 Dateien, davon **25/25** neu in `calendar-events.integration-spec.ts` |
| E2E (real PostgreSQL 17, echter Browser) | **22/22** grün über 14 Spezifikationen, davon **2/2** neu in `calendar-events.spec.ts` |

Testabdeckung (neu): Team- vs. Abteilungs-Scope-Berechtigungen (TENANT_ADMIN/DEPARTMENT_ADMIN/COACH/TEAM_MANAGER/PLAYER-Rollen), ungültiger Datumsbereich, XOR-Verletzung (weder/beide Team+Abteilung), nicht existierende Ressourcen, leere Listen, Cross-Tenant-Isolation, `creatable-scopes`-Filterung pro Rolle, Lesen vs. Schreiben getrennt getestet.

**API-Integration — Untersuchung eines False Positives:** ein erster Komplettlauf über alle 15 Dateien mit Standard-Parallelisierung zeigte 30 fehlgeschlagene Tests (alle als `Test timed out in 30000ms`), konzentriert in `tournament-schedule.integration-spec.ts`. Root-Cause-Untersuchung: VPS/DB-Container war nachweislich gesund (frischer `pg_isready`-Check, Load 0.03), die isolierte Einzeldatei-Wiederholung derselben Datei lief **17/17 grün** in 229s. Ursache: mehrere parallel gestartete NestJS-Testinstanzen konkurrierten über denselben SSH-Tunnel um dieselbe Tunneled-DB-Verbindung, was unter den ohnehin schon lock-intensiven Concurrency-Tests (`two near-simultaneous commits`) den 30s-Default-Timeout überschritt — kein Phase-18-Regressionsfehler, das `events`-Modul hat keine Berührungspunkte mit Turnierplan-Logik. Bestätigt durch einen erneuten, seriellen Komplettlauf (`--no-file-parallelism`): **216/216 grün** in 1088s. Dies ist eine reine Eigenschaft der Testumgebung (tunneled DB, kein lokales Netzwerk) und keine Aussage über reguläre CI/lokale Ausführung mit paralleler Default-Konfiguration gegen eine schnelle lokale DB.

## 13. E2E — Kernfall und Regressionsprüfung

`calendar-events.spec.ts`: TENANT_ADMIN legt einen mannschaftsgebundenen und einen abteilungsgebundenen Termin an, bearbeitet und löscht sie; COACH E1 sieht im „Für wen"-Dropdown nur die eine Mannschaft, für die er create-berechtigt ist (server-seitig via `creatable-scopes` gefiltert, nicht nur clientseitig ausgeblendet).

**Genuine, reproduzierte E2E-Regression gefunden und behoben** (nicht Phase-18-Code, aber von Section 8 des Auftrags ausdrücklich verlangt zu prüfen): `tournament-core.spec.ts` und `tournament-schedule.spec.ts` — die Turnier-Erstellungsschritte sowie (bei COACH) der Klick in die Turnierdetailseite scheiterten **konsistent** (je 2/2 isolierte Wiederholungen) an einem knappen 5s-Default-Timeout direkt nach der `createTournamentAction`-Server-Action-Weiterleitung — dieselbe, bereits in Phase 16/17 diagnostizierte Race, hier in zwei Dateien, die die spezifisch gefixte `expectVisibleAfterSubmit`-Hilfsfunktion nicht verwendeten. Behoben durch Anwendung des etablierten `page.waitForURL(...)`-Musters an 4 Stellen. Eine fünfte, neu beobachtete Stelle (`tournament-schedule.spec.ts`, „Spielplan erstellen"-Linkklick auf eine mehrere parallele Fetches abwartende Generator-Seite) erhielt aus demselben architektonischen Grund einen `{timeout: 15_000}`-Fix. Alle 5 Stellen danach mehrfach isoliert re-verifiziert (2× je Datei, zusätzlich 1× kombiniert) — durchgehend grün.

**Untersuchte, nicht behobene Einzelfälle** (`match-foundation.spec.ts` COACH-Test, `team-membership.spec.ts` TENANT_ADMIN-Test): je einmalig in einem Komplettlauf an einem 5s-Timeout gescheitert, in der isolierten Wiederholung jeweils sauber durchgelaufen — nicht reproduzierbar, keine strukturelle Ähnlichkeit zur behobenen Redirect-Race (unterschiedliche Aktionen, keine Server-Action-Weiterleitung), daher bewusst **nicht** verändert (kein Fix ohne reproduzierten Fehler).

**Ergebnis**: **0 tatsächlich benötigte Retries** über alle 22 Tests hinweg nach den obigen Fixes.

## 14. VPS/PostgreSQL

PostgreSQL 17, temporärer Container `verevia-phase18-pg17-test` (eigenes Volume, `127.0.0.1`-only, Port 55437). Migration aus leerer DB: alle 14 Migrationen sauber angewendet, **Drift: 0**. Seed zweimal ausgeführt → Idempotenz bestätigt (identische IDs/Zeilenzahlen beim zweiten Lauf).

## 15. Quality Gates

`pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle Pakete) grün. `prisma validate` grün, Drift 0. DB-Integration (143/143) und API-Integration (216/216, seriell verifiziert) real gegen PostgreSQL 17 grün. E2E real verifiziert, 0 tatsächlich benötigte Retries. Markdown-Lint (`markdownlint-cli2`) für `docs/**/*.md` + `README.md`: **0 Issues in 51 Dateien**. `git status`/`git diff` vor dem Commit explizit auf Secrets/temporäre Dateien geprüft — sauber.

## 16. Gefundene Bugs

- `tenant-scoped-models.spec.ts`: fehlender `"Event"`-Eintrag in der erwarteten Modell-Liste — echter, durch den bestehenden Guard-Test gefundener Fehlschlag (Abschnitt 10).
- Web-Anlegeformular: „Für wen"-Dropdown zeigte initial alle lesbaren Mannschaften/Abteilungen, nicht nur die schreibbaren — selbst identifizierter UX-Korrektheitsfehler, behoben durch den neuen `creatable-scopes`-Endpunkt (Abschnitt 4).
- E2E-Regression in `tournament-core.spec.ts`/`tournament-schedule.spec.ts` (Abschnitt 13).

## 17. Behobene Bugs

Alle drei in Abschnitt 16 genannten Punkte wurden behoben und re-verifiziert.

## 18. Bestehende Altlasten

`match-foundation.spec.ts` COACH-Test und `team-membership.spec.ts` TENANT_ADMIN-Test: je ein einmaliger, nicht reproduzierbarer 5s-Timeout-Blip in einem Komplettlauf (Abschnitt 13) — beobachtet, untersucht, nicht behoben, da nicht reproduzierbar und strukturell nicht mit der behobenen Redirect-Race verwandt.

## 19. Risiken

Keine neuen strukturellen Risiken. Die API-Integrationssuite benötigt bei Ausführung gegen eine getunnelte (statt lokale) PostgreSQL-Instanz serielle statt paralleler Dateiausführung, um Tunnel-Lastspitzen zu vermeiden (Abschnitt 12) — reine Eigenschaft der VPS-Verifikationsumgebung dieser Phase, ohne Auswirkung auf reguläre CI/lokale Läufe.

## 20. Technische Schulden

Keine neuen. `EventListResponse.canCreate` ist bewusst ein vereinfachtes, vereinsweites Flag (kein Objekt mit Präferenzen wie Turnier-`Endpoint`s) — angemessen für den aktuellen Umfang, keine absichtliche Abkürzung mit späterem Nachbesserungsbedarf.

## 21. Cleanup

- Temporärer Container `verevia-phase18-pg17-test`: entfernt.
- Temporäres Volume `verevia-phase18-pg17-test-vol`: entfernt.
- SSH-Tunnel: geschlossen.
- Temporärer SSH-Key `verevia-phase18-calendar-events-1788283655`: aus `/home/maik/.ssh/authorized_keys` entfernt, **Entfernung durch fehlgeschlagenen Reconnect-Versuch verifiziert** (`Permission denied (publickey,password)`), lokale Schlüsseldateien gelöscht.
- Lokale temporäre API-/Web-Serverprozesse gestoppt.
- Permanente Ressourcen (`verevia-dev-web`, `verevia-dev-api`, `verevia-dev-postgres`, `verevia-traefik`): **unverändert**, `verevia-prod` **nicht angetastet**.
- Keine Secrets, keine `.env`-Dateien, keine temporären Testartefakte im Repository.

## 22. Dokumentation

Dieser Bericht sowie [ADR 0014](architecture/adr/0014-event-dual-scope-authorization.md) (README-Index aktualisiert), `docs/database/Database.md` aktualisiert (Changelog-Eintrag, `Event`-Tabellenzeile, Beziehungen).

## 23. Git/PR

- Branch: `feat/calendar-events`
- Endcommit: siehe PR
- PR: siehe unten
- **Gemergt: NEIN**

PHASE 18 READY
