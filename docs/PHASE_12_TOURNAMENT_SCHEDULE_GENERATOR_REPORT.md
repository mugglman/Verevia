# Phase 12 – Tournament Schedule Generator V1

## 1. Phase-11-Abschluss

PR #15 (`docs(deploy): record the real Phase 11 DEV deployment and live verification`) war beim Start dieses Arbeitspakets grün und wurde geprüft und gemergt (Merge-SHA `a86489d`). `main` lokal aktualisiert, Branch `feat/tournament-schedule-generator` von `main` (`a86489d`) erstellt.

## 2. Architektur

Der Generator ist bewusst als reine, framework-/DB-freie Domain-Schicht unter `apps/api/src/football/tournaments/schedule/generator/` gebaut (Auftrag Abschnitt 40) — kein NestJS-DI, kein Prisma, keine Seiteneffekte:

- `round-robin.generator.ts` — Fixture-Erzeugung (Circle-Method).
- `schedule.scheduler.ts` — Slot-/Venue-Zuweisung (greedy, deterministisch).
- `schedule.validator.ts` — unabhängige Nachprüfung eines bereits erzeugten Spielplans.
- `schedule-fingerprint.ts` — SHA-256-Fingerprint über alle spielplanrelevanten Eingaben.
- `types.ts`/`limits.ts` — gemeinsame Typen, zentrale Defaults/Guardrails.

`TournamentScheduleService` (`tournament-schedule.service.ts`) ist die einzige Brücke zur Datenbank: lädt den aktuellen Turnierzustand, ruft die reine Pipeline auf, baut die Preview-DTO bzw. persistiert beim Commit. `TournamentScheduleController` stellt ausschließlich zwei dünne Routen bereit (`POST .../schedule/preview`, `POST .../schedule/commit`).

## 3. Domainmodell-Entscheidung: keine persistierte ScheduleConfig

Bewusst **keine neue Tabelle**. Geprüft (Auftrag Abschnitt 7) und verworfen: Generator-Einstellungen (Spieldauer/Wechselpause/Mindestpause/Spielfelder/Startzeit) werden vom Client bei jedem Preview-/Commit-Aufruf mitgeschickt, nicht aus einer persistierten Konfiguration gelesen. Begründung: nichts in der Definition of Done erfordert Persistenz dieser Einstellungen; der Fingerprint-Mechanismus (Abschnitt 9) benötigt sie ohnehin bei jedem Aufruf frisch; eine zusätzliche Tabelle hätte Migration/RLS/Tests/Composite-FK-Aufwand für keinen funktionalen Gewinn bedeutet ("keine Tabelle nur weil sie bequem erscheint", Auftrag Abschnitt 7). Sinnvolle Startwerte sind stattdessen zentral in `generator/limits.ts` als `SCHEDULE_DEFAULTS` dokumentiert (10 / 2 / 10 Minuten) — die Web-UI verwendet dieselben Werte als Formular-Vorbelegung.

Ebenso bewusst **keine** temporären Vorschau-`FootballMatch`-Datensätze — eine Vorschau existiert ausschließlich als Response-DTO/Application-State, nie als DB-Zeile (Auftrag Abschnitt 7/21).

## 4. Migration

**Keine neue Migration** — Phase 12 fügt keine neuen Prisma-Modelle/-Spalten hinzu (siehe Abschnitt 3). Verifiziert: `prisma migrate deploy` aus leerer PostgreSQL-17-Instanz wendet weiterhin exakt die 11 aus Phase 11 bekannten Migrationen an, `prisma migrate diff` gegen die live migrierte DB liefert 0 Diff.

## 5. `withTenantTransaction` / ADR 0009

Die zentrale infrastrukturelle Neuerung dieser Phase: `getTenantPrisma()` wrappt jede einzelne Operation in ihre eigene Transaktion — für den Schedule-Commit (Turnier-Zeile sperren, bestehenden Spielplan innerhalb derselben Transaktion prüfen, frisch laden, `createMany`) reicht das nicht. Eine neue, additive Funktion `withTenantTransaction(tenantId, callback)` (`packages/database/src/tenant-prisma.ts`) öffnet genau eine Transaktion, setzt `app.tenant_id` einmalig und übergibt den rohen `Prisma.TransactionClient` an den Aufrufer. `getTenantPrisma()` selbst bleibt unverändert. Vollständig begründet in [ADR 0009](architecture/adr/0009-tenant-scoped-multi-statement-transactions.md).

## 6. Generator-Version

`GENERATOR_VERSION = "tournament-round-robin-v1"` (`generator/limits.ts`) — fließt in den Fingerprint und die Preview-Response ein, damit künftig nachvollziehbar bleibt, welcher Algorithmus einen Spielplan erzeugt hat.

## 7. Round-Robin-Verfahren (Circle Method)

Deterministische Circle-Method/Berger-System-Logik: erster Teilnehmer fix, restliche rotieren pro Runde. Bei ungerader Teilnehmerzahl wird intern ein virtuelles BYE ergänzt (erzeugt keine Fixture). Teilnehmerreihenfolge ist die einzige Eingabe, die Runden-/Heim-Auswärts-Zuordnung bestimmt — stabil sortiert nach `seed` (aufsteigend, NULL zuletzt), dann `createdAt`, dann `id` als letzter Tie-Breaker. Home/Away alterniert pro Runde (`round % 2`) als einfache, dokumentierte Fairness-Maßnahme (Auftrag Abschnitt 18) — keine komplexe Optimierung. Für n Teilnehmer werden exakt n·(n-1)/2 Spiele erzeugt, jedes Paar genau einmal, keine Selbstspiele — durch 12 Unit-Tests bewiesen (2/3/4/5/6 Teilnehmer, alle Paare für n=4..8 vollständig und einmalig, BYE erzeugt keine Fixture, Determinismus).

## 8. Scheduling-Verfahren

Bewusst **kein** Constraint-Solver (Auftrag Abschnitt 14) — ein transparenter, deterministischer Greedy-Algorithmus: Zeit wird in feste Slots (`matchDurationMinutes + changeoverMinutes`) geteilt; jeder Slot-Index hat eine "Bahn" pro ausgewählter Spielstätte. Begegnungen werden über alle Gruppen rundenweise interleaved ("Runde 1 aller Gruppen, dann Runde 2, ..." statt eine Gruppe komplett vor der nächsten) — natürlicherer Turniertagesablauf, verteilt zugleich die Spiele jedes Teilnehmers über den Zeitplan und erleichtert die Einhaltung der Mindestpause. Jede Begegnung wird in feste Reihenfolge in den frühestmöglichen freien (Slot, Spielstätte)-Platz eingeplant, der weder die Spielstätte noch einen der beiden Teilnehmer (Konflikt-/Ruhezeitprüfung **in beide Zeitrichtungen**, nicht nur gegen die zuletzt eingeplante Partie) verletzt. Kann eine Begegnung innerhalb der Suchgrenze (`maxSlotSearchIndex`, siehe Abschnitt 20) oder vor dem Turnierende nicht platziert werden, wird der gesamte Plan als `invalid` mit einer konkreten, benannten Konfliktmeldung zurückgegeben — nie ein still unvollständiger Plan.

## 9. Preview-Fingerprint

SHA-256 über kanonisches (schlüsselsortiertes), sortiertes JSON aus: Turnier-ID/-Zeitraum/-Modus, aktiven Teilnehmern + Gruppenzuordnung, Gruppen, ausgewählten Spielstätten, Einstellungen, Generator-Version und den erzeugten Spielen selbst. Alle Arrays werden vor dem Hashen sortiert, damit zufällige DB-Abfragereihenfolge das Ergebnis nie verändert — bewiesen durch dedizierte Tests (Reihenfolge-Unempfindlichkeit, Änderungssensitivität für Teilnehmer/Gruppe/Spielstätten/Einstellungen/Turnierzeit/generierte Spiele, 64-stelliges Hex-Format). Ausdrücklich **kein** Authentifizierungs-Token — reiner Inkonsistenz-/Veraltungs-Schutz (Auftrag Abschnitt 23).

## 10. Commit-Ablauf und Atomarität

`TournamentScheduleService.commit`:

1. Autorisierung wird **vor** Transaktionsbeginn geprüft (kein Grund, während der Rollenauflösung eine Sperre zu halten).
2. `withTenantTransaction` öffnet eine Transaktion; `SELECT id FROM football_tournament WHERE id = … FOR UPDATE` sperrt die Turnier-Zeile für die Dauer der Transaktion.
3. Innerhalb derselben Transaktion: bestehender Spielplan wird geprüft (`footballMatch.count`), Turnierzustand frisch geladen, Vorbedingungen erneut geprüft, Spielplan serverseitig **neu generiert**, frischer Fingerprint mit dem vom Client übermittelten verglichen.
4. Bei Übereinstimmung: **ein** `footballMatch.createMany(...)`-Aufruf für alle generierten Spiele — ein einzelnes Multi-Row-`INSERT`, das in PostgreSQL selbst atomar ist (alle Zeilen oder keine), zusätzlich innerhalb der ohnehin laufenden Transaktion.

Direkt bewiesen (nicht nur behauptet): ein DB-Integrationstest (`tournament-core.integration.spec.ts`, neue Describe-Gruppe "createMany — atomicity") schickt einen `createMany`-Batch mit einer bewusst ungültigen Zeile (Selbstspiel) gegen echtes PostgreSQL 17 und verifiziert **0** verbleibende Zeilen, nicht die N-1 gültigen.

## 11. Schutz gegen doppelten/gleichzeitigen Commit

Der Row-Lock (Abschnitt 10, Schritt 2) serialisiert konkurrierende Commit-Versuche für **dasselbe** Turnier: der zweite Request blockiert, bis der erste fertig ist, und sieht danach korrekt den bereits bestehenden Spielplan (→ 409). Live durch einen API-Integrationstest bewiesen: zwei nahezu gleichzeitige `POST .../schedule/commit`-Requests (`Promise.all`) mit identischem Fingerprint — genau einer liefert 201, der andere 409, in der DB liegen exakt 6, nicht 12 Spiele.

## 12. Bestehender Spielplan blockiert Commit

Existiert für ein Turnier bereits mindestens ein `FootballMatch` mit `tournamentId`, wird ein Commit-Versuch mit `409 Conflict` ("Für dieses Turnier existiert bereits ein Spielplan.") abgelehnt — Preview bleibt weiterhin möglich (rein informativ, kein DB-Zugriff). Kein Replace/Merge/Regenerate in V1 (Auftrag Abschnitt 25).

## 13. Stale-Preview-Schutz

Ändert sich der Turnierzustand (Teilnehmer/Gruppe/Spielstätte/Zeit/Einstellungen) zwischen Preview und Commit, weicht der serverseitig neu berechnete Fingerprint vom übermittelten ab → `409 Conflict` ("Das Turnier wurde seit der Vorschau geändert. Bitte den Spielplan neu berechnen."). Live durch einen API-Integrationstest bewiesen (Teilnehmer nach Preview hinzugefügt, Commit mit dem alten Fingerprint schlägt fehl, 0 Matches persistiert).

## 14. Vorbedingungen vs. Laufzeit-Konflikte

Bewusste Zweiteilung: strukturelle Vorbedingungen (Turnier existiert/nicht autorisiert/Modus nicht `GROUPS`|`GROUPS_AND_KNOCKOUT`/Teilnehmer ohne Gruppe/Gruppe mit weniger als zwei Teilnehmern/Spielstätte nicht dem Turnier zugeordnet/Limits überschritten) werden **vor** jeder Generierung geprüft und lehnen mit `400 Bad Request` und einer konkreten deutschen Fehlermeldung ab — eine Preview wird für einen strukturell unsinnigen Request gar nicht erst zurückgegeben. Laufzeit-Konflikte (die gewählten Einstellungen ergeben trotz gültiger Vorbedingungen keinen erfüllbaren Plan — z. B. zu wenig Zeit/Spielfelder für die Mindestpause) liefern weiterhin `200 OK` mit `valid: false` und einer für die UI direkt darstellbaren `conflicts`-Liste — eine echte, erklärende Vorschau statt eines Fehlercodes.

## 15. Fairness / Constraints

- **Teilnehmer-Konflikte**: nie zwei überlappende oder die Mindestpause verletzende Spiele — Prüfung in beide Zeitrichtungen gegen ALLE bereits platzierten Spiele desselben Teilnehmers, nicht nur das zeitlich letzte.
- **Spielstätten-Konflikte**: nie zwei Spiele im selben (Slot, Spielstätte)-Feld.
- **Turnierende**: gesetztes `endsAt` ist eine harte Grenze — kein Spiel darf danach enden; ohne `endsAt` liefert der Generator ein berechnetes voraussichtliches Ende (UI zeigt "Voraussichtliches Turnierende").
- **Home/Away**: alterniert pro Runde, bewusst ohne komplexe Optimierung; für automatisch erzeugte Turnierspiele standardmäßig `homeAway: NEUTRAL` (Auftrag Abschnitt 18).
- Ein unabhängiger zweiter Prüfdurchlauf (`schedule.validator.ts`) verifiziert das Ergebnis des Schedulers noch einmal komplett neu, statt ihm blind zu vertrauen (Auftrag Abschnitt 16).

## 16. API

- `POST /api/v1/football/tournaments/:id/schedule/preview` — erzeugt **keine** DB-Matches, ist deterministisch/idempotent bezüglich identischer Eingaben.
- `POST /api/v1/football/tournaments/:id/schedule/commit` — Einstellungen + Fingerprint, persistiert atomar oder gar nicht.

## 17. Authorization

Weiterhin **keine neuen Rollen**. Beide Routen verlangen dieselbe Berechtigung wie das übrige Turnier-Management (`canOnSeason`, "update", Wiederverwendung aus Phase 11): `TENANT_ADMIN` immer, `DEPARTMENT_ADMIN` der eigenen Fußballabteilung. **Preview ist bewusst genauso restriktiv wie Commit** — nicht nur lesend eingestuft, da das Einstellungsformular selbst bereits eine administrative Turnierplanungs-Handlung ist (Auftrag Abschnitt 28's "falls als Management-Operation klassifiziert" — hier explizit so entschieden und dokumentiert). `COACH`/`TEAM_MANAGER` dürfen einen bereits bestehenden Spielplan weiterhin ganz normal über die bestehende Turnierdetailseite **lesen** (unverändertes Phase-11-Verhalten der Spieleliste), aber weder Preview noch Commit auslösen — live per direkter API- und UI-Prüfung bestätigt (403 bzw. serverseitig blockierte Seite).

## 18. Multi-Tenancy / RLS

Keine neue Tabelle → keine neue RLS-Policy nötig. Die bestehende, DMMF-basierte `TENANT_SCOPED_MODELS`-Auto-Ableitung bleibt unverändert korrekt. `withTenantTransaction` (Abschnitt 5) setzt `app.tenant_id` exakt nach demselben Muster wie `getTenantPrisma()` — RLS gilt für den gesamten Commit-Vorgang identisch. `X-Tenant-Id` bleibt nie alleinige Autoritätsquelle (unverändert aus früheren Phasen).

## 19. UI/UX

Neue Route `/fussball/turniere/:id/spielplan`, verlinkt über einen "Spielplan erstellen"-CTA im "Spiele"-Abschnitt der Turnierdetailseite (nur sichtbar wenn `canEdit` und noch keine Spiele existieren). Mobile-first, dreistufig: (1) Vorab-Berechnung (Gruppen-/Teilnehmerzahlen, theoretische Spielanzahl — ohne API-Aufruf berechnet), (2) Einstellungsformular (Spieldauer/Wechselpause/Mindestpause/Spielfelder-Checkboxen, Standardwerte vorbelegt), (3) Vorschau (Zusammenfassung, Spielliste mit Uhrzeit/Spielstätte/Begegnung/Gruppe, bei ungültigem Plan eine verständliche Konfliktliste statt technischer Fehlercodes) mit "Spielplan übernehmen"-Button, der nach erfolgreichem Commit zurück zur Turnierdetailseite navigiert (Server-Action-`redirect()`, gleiches Muster wie bestehende Anlegen-Flows). Bereits terminierte Turniere (`hasExistingSchedule`) zeigen sofort eine Sperr-Meldung statt des Formulars. Keine sichtbaren technischen IDs.

## 20. Performance-/Missbrauchs-Guardrails

Zentral in `generator/limits.ts` dokumentiert: max. 32 Teilnehmer je Gruppe, max. 16 Gruppen, max. 12 Spielfelder, max. 500 generierte Spiele, harte Suchgrenze von 2000 Slot-Indizes je Begegnung — bewusst großzügig über realistischen Jugendturnier-Größen, verhindert aber unbeschränkte CPU-Last bei extremen/fehlerhaften Eingaben. Überschreitung → `400 Bad Request` mit klarer Meldung, keine stille Kappung.

## 21. Seed

Neues, zweites Demo-Turnier "Verevia Frühjahrscup 2026" (Saison 2026/2027, Modus `GROUPS`, 1 Gruppe mit 4 Teilnehmern — 1 intern (E2) + 3 fiktiv extern, 1 zugeordnete Spielstätte) — **bewusst ohne** vorbestehende Spiele, damit der Generator gegen Seed-Daten tatsächlich demonstrierbar bleibt. Das bestehende Phase-11-Turnier "Verevia Jugendcup 2026" (trägt bereits ein manuelles Turniermatch) wurde **nicht verändert** — ein Commit dafür würde ohnehin sofort mit "existiert bereits ein Spielplan" blockiert. Zweifacher Seed-Lauf real gegen PostgreSQL 17 verifiziert: identische IDs, Zähl-Query bestätigt exakt 2 Turniere/8 Teilnehmer/3 Gruppen/2 Spielstättenzuordnungen/4 Spiele nach zwei Läufen.

## 22. Tests — Übersicht

- Generator (Unit, pure): 12 Tests (Round-Robin).
- Scheduling (Unit, pure): 10 Tests.
- Validator (Unit, pure): 10 Tests.
- Fingerprint (Unit, pure): 9 Tests.
- DB-Integration (neu): 2 Tests (createMany-Atomarität), 96/96 der gesamten DB-Integrationssuite grün gegen echtes PostgreSQL 17.
- API-Integration (neu): siehe Abschnitt 23.
- Web-Unit: 9 Tests (`TournamentScheduleGenerator`), 106/106 der gesamten Web-Suite grün.
- E2E: siehe Abschnitt 24.

## 23. API-Integrationstests

Neu (`apps/api/test/tournament-schedule.integration-spec.ts`): 401 ohne Session (Preview + Commit), TENANT_ADMIN Preview+Commit, DEPARTMENT_ADMIN eigene Abteilung erlaubt, fremde Abteilung verboten (403), COACH Preview+Commit verboten (403), Preview erzeugt 0 `FootballMatch`-Zeilen, Preview deterministisch (identischer Fingerprint bei identischen Einstellungen), Mix aus internem+externem Teilnehmer, KNOCKOUT sauber abgelehnt (400), Teilnehmer ohne Gruppe abgelehnt (400), Spielstätte nicht dem Turnier zugeordnet abgelehnt (400), 404 bei nicht existierendem Turnier, stale Preview → 409 (0 Matches danach), bestehender Spielplan → 409, korrekte Match-Felder nach Commit (`type: TOURNAMENT`, `homeAway: NEUTRAL`, `status: SCHEDULED`, korrekte `tournamentGroupId`, `teamSeasonId`/`opponentName` NULL), zwei gleichzeitige Commits → genau 201/409, keine doppelten Matches.

## 24. E2E

Neu (`apps/web/e2e/tournament-schedule.spec.ts`): TENANT_ADMIN legt ein eigenes temporäres Testturnier an (4 externe Teilnehmer, 1 Gruppe, 1 Spielstätte — bewusst **nicht** das Seed-Turnier "Verevia Frühjahrscup 2026" wiederverwendet, da ein Turnier nur EINMAL einen Spielplan committen kann und der Test sonst auf einer persistenten DEV-DB nicht wiederholbar wäre) → Spielplan erstellen → Vorab-Berechnung zeigt 6 Spiele → Spielplan berechnen → gültige Vorschau mit 6 Spielen → Spielplan übernehmen → Redirect zur Turnierdetailseite → 6 persistierte Spiele sichtbar, CTA verschwunden. Zusätzlich: COACH liest ein Turnier, aber direkter Navigationsversuch auf die `/spielplan`-Route wird **serverseitig** (nicht nur clientseitig) blockiert.

## 25. PostgreSQL-17-/VPS-Verifikation

Real durchgeführt, gemäß Auftrag Abschnitt 54. Temporärer PostgreSQL-17-Container (`verevia-phase12-pg17-test`, eigenes Docker-Volume, `127.0.0.1`-only), per SSH-Tunnel lokal erreichbar gemacht (sitzungsgebundener Phase-12-Key, vom Nutzer manuell hinterlegt und per `grep` verifiziert — inklusive eines zwischenzeitlichen, durch einen lokalen Neustart bedingten Schlüsselwechsels, sauber dokumentiert und aufgelöst). Ablauf:

1. `prisma migrate deploy` aus leerer DB: weiterhin exakt 11 Migrationen, **keine neue** (Abschnitt 4) — bestätigt.
2. `prisma migrate status` → "Database schema is up to date!"; `prisma migrate diff` gegen die live migrierte DB → leerer Diff (0 Drift).
3. Seed zweimal → idempotent (identische IDs für beide Turniere; Zähl-Query bestätigt exakt 2 Turniere/8 Teilnehmer/3 Gruppen/2 Turnier-Spielstättenzuordnungen/4 Spiele nach zwei Läufen).
4. DB-Integrationstests: **96/96 grün** (5 Dateien, inkl. der neuen `createMany`-Atomarität-Tests).
5. API-Integrationstests: **138/138 grün** (10 Dateien). Bei der ersten Ausführung fielen zunächst 4 Tests auf — ein **echter, gefundener und behobener Fehler**: `TournamentScheduleController.preview` lieferte den NestJS-`POST`-Default-Statuscode `201 Created` statt des inhaltlich korrekten `200 OK` (eine Preview erzeugt nichts) — behoben per `@HttpCode(HttpStatus.OK)`. Ein fünfter, ursprünglich fehlgeschlagener Test war ein **Testfehler**, kein Produktcode-Fehler: der "stale preview"-Test änderte den Turnierzustand durch einen ungruppierten Teilnehmer, was zuerst die (korrekte) Vorbedingungsprüfung auslöste, bevor der Fingerprint-Vergleich überhaupt erreicht wurde — der Test wurde angepasst, sodass der neue Teilnehmer sofort einer Gruppe zugeordnet wird und der Test tatsächlich den Fingerprint-Pfad prüft. Nach beiden Korrekturen: vollständiger Suite-Lauf zweimal wiederholt, durchgehend grün, einmal zusätzlich ein isolierter Fehlschlag in einem unveränderten Phase-9/10-Testfile (`team-membership.integration-spec.ts`, "socket hang up") beobachtet und durch isolierten Nachlauf (11/11 grün) als bekannte, bereits in früheren Phasen dokumentierte SSH-Tunnel-Latenz-Flakiness bestätigt — keine Phase-12-Regression.
6. `apps/api`/`apps/web` produktiv gebaut und gestartet (Port 3001/3100 — Port 3000 war nach dem zwischenzeitlichen lokalen Neustart wieder frei, dennoch bei 3100 belassen für Konsistenz mit der bereits konfigurierten `APP_URL`).
7. Volle Playwright-E2E-Suite: **14/14 grün**. Beim ersten Lauf ein bekanntes, bereits in Phase 11 dokumentiertes Next.js-Infrastrukturproblem ("destination stream closed early" unter SSH-Tunnel-Latenz) — diesmal reichte die vorhandene Ein-Reload-Testhilfsfunktion (`expectVisibleAfterSubmit`) nicht zuverlässig aus (die zusätzliche Latenz dieser Sitzung machte auch den einzelnen Reload gelegentlich zu langsam) — behoben durch Erweiterung auf bis zu drei Reload-Versuche, real gegen die DB verifiziert, dass die zugrunde liegende Mutation in allen beobachteten Fällen bereits korrekt persistiert war (nur die gestreamte Client-Aktualisierung fehlte). Zusätzlich ein **eigener Testfehler** gefunden und behoben: eine `getByText`/`locator`-Prüfung auf einen Teamnamen traf durch Round-Robin (jedes Team hat 3 Spiele bei n=4) mehrere Treffer — mit `.first()` behoben, analog zum bereits in Phase 10/11 etablierten Muster für solche Locator-Präzisierungen. Nach beiden Fixes: volle Suite zweimal wiederholt, durchgehend grün.
8. Vollständig aufgeräumt: temporärer Container und Docker-Volume entfernt (verifiziert: nur die permanenten `verevia-dev-*`/`verevia-traefik`-Container verbleiben, `verevia-prod` nicht vorhanden/nicht angetastet), SSH-Tunnel geschlossen, lokale `api`/`web`-Prozesse beendet, temporärer SSH-Key aus `authorized_keys` entfernt und die Entfernung sowohl per `grep` (0 Treffer) als auch durch einen fehlschlagenden erneuten Verbindungsversuch mit demselben Private Key verifiziert (`Permission denied (publickey,password)`), lokale Schlüsseldateien gelöscht. Alle Testdaten der VPS-Verifikation existierten ausschließlich im inzwischen vollständig entfernten temporären Container — keine Bereinigung auf der persistenten `verevia-dev-postgres` nötig, da diese zu keinem Zeitpunkt für Schreiboperationen dieser Verifikation verwendet wurde.

Kein tatsächliches Deployment auf die permanente DEV-Umgebung in diesem Schritt — Auftrag Abschnitt 63 sieht für diese Phase ausdrücklich kein Deployment vor.

## 26. Quality Gates

Vollständig grün, lokal und real gegen PostgreSQL 17: `pnpm install --frozen-lockfile`, `pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle 7 Pakete), `prisma validate`, Migration aus leerer DB (0 neue Migration nötig, 0 Drift), Seed 2×, DB-Integrationstests (96/96), API-Integrationstests (138/138), Web-Tests (106/106 gesamt, davon 9 neu), volle E2E-Suite (14/14 gesamt, davon 2 neu). Keine Tests deaktiviert, keine Warnungen wegkonfiguriert.

## 27. VPS-/SSH-Cleanup

Siehe Abschnitt 25, Punkt 8 für den vollständigen Ablauf. Zusätzlicher, transparent dokumentierter Zwischenfall: zwischen der Ausgabe des ersten Phase-12-Public-Keys und dessen Hinterlegung fand ein lokaler Neustart der Arbeitsumgebung statt, der `/tmp` (und damit den privaten Schlüssel) leerte — der bereits auf dem VPS hinterlegte, nun verwaiste Public Key (`verevia-phase12-schedule-generator-1788032918`, keine passende private Schlüsseldatei mehr vorhanden) wurde dem Nutzer transparent gemeldet, ein neuer Schlüssel (`…-1788074672`) angefordert und nach Bestätigung sowohl für die gesamte VPS-Arbeit verwendet als auch — nach Verbindungsaufbau — der verwaiste alte Eintrag gezielt per `grep -v` entfernt (kein Sicherheitsrisiko durch einen Schlüssel ohne zugehöriges privates Gegenstück, aber unnötiger Rückstand). Am Ende der Sitzung ausschließlich der aktive Key (`…-1788074672`) entfernt, `grep`- und Reconnect-Verifikation erfolgreich, kein `authorized_keys.bak` entstanden (`grep -v` ohne `sed -i.bak` verwendet), alle anderen Einträge und der permanente GitHub-Deployment-Key unverändert.

## 28. Risiken

- Der Greedy-Scheduler ist bewusst nicht backtracking-fähig — in seltenen, sehr eng bemessenen Szenarien (wenig Zeit, wenige Spielfelder, hohe Mindestpause) kann er eine grundsätzlich erfüllbare Lösung übersehen, die nur mit Nachrücken bereits platzierter Spiele gefunden würde. Bewusst in Kauf genommen (Auftrag Abschnitt 14 erlaubt, aber verlangt nicht, begrenztes Backtracking) — dokumentierter möglicher Ausbauschritt.
- Die Autorisierungsentscheidung "Preview erfordert dieselbe Berechtigung wie Commit" ist eine bewusste, aber nicht die einzig denkbare Auslegung von Auftrag Abschnitt 28 — dokumentiert, leicht revidierbar, falls künftig ein reiner "Vorschau anschauen"-Anwendungsfall für COACH gewünscht wird.
- `withTenantTransaction` ist neue, bislang nur an einer Stelle genutzte Infrastruktur — sorgfältig in ADR 0009 begründet und durch den Atomarität-Test sowie den Concurrent-Commit-Test verifiziert, aber die einzige Stelle im Code, die einen rohen `Prisma.TransactionClient` direkt verwendet (dokumentiert, kein Muster, das versehentlich falsch wiederverwendet werden sollte, ohne ADR 0009 zu lesen).

## 29. Technische Schulden

Keine neuen. Kein Rückfall auf manuelle RLS-Modelllisten (Abschnitt 18).

## 30. Bewusst nicht implementiert (Scope-Grenze)

Automatische Gruppen-Auslosung, Knockout-Bracket, Viertelfinale/Halbfinale/Finale, Platzierungsspiele, automatische Qualifikation aus Gruppen, Tabellen-/Punkte-/Tordifferenzberechnung, Live-Tabelle, Swiss System, Double Elimination, dynamisches Re-Scheduling nach Ergebnissen, Drag-and-Drop-Spielplan, öffentliche Turnierseite, QR-Codes, Push-Benachrichtigungen, Live-Ergebnisse, Schiedsrichterplanung, komplexe Solver-/OR-Tools-Optimierung, KI-basierte Optimierung, Replace/Merge/Partial-Regeneration eines bestehenden Spielplans, neue `TURNIERLEITER`-Rolle.

## 31. Vorbereitung nächster Schritt

Ein künftiger Knockout-/Finalrunden-Generator (nicht Teil dieser Phase) könnte dieselbe Preview-/Fingerprint-/Commit-Architektur wiederverwenden — lediglich der reine Fixture-Erzeugungsschritt (`round-robin.generator.ts`) müsste um ein Bracket-Äquivalent ergänzt werden, Scheduler/Validator/Fingerprint/Commit-Transaktionslogik sind bereits generisch genug, um unverändert weiterverwendet zu werden.

## 32. Nächster Schritt

PR (`feat(tournament): add tournament schedule generator`) durchsehen und freigeben — **kein Merge in diesem Schritt**, kein Deployment. Ausdrücklich weiterhin nicht Teil dieser Phase: Knockout, Finalrunde, Phase 13.
