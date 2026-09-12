# Phase 19 – Anwesenheit (Zu-/Absagen und tatsächliche Anwesenheit)

## 1. Ausgangslage

PR #22 (`feat: add calendar events`) war zu Beginn dieses Arbeitspakets bereits geprüft (OPEN, CI grün, MERGEABLE, CLEAN) und wurde vor jeder Phase-19-Implementierung squash-gemergt. **Phase-18-Merge-SHA: `d4a3865`** (verifiziert via `git log`/`git pull --ff-only` gegen `origin/main`). Branch `feat/attendance-tracking` wurde von diesem verifizierten `main` erstellt.

## 2. Scope-Herleitung

Kein expliziter „Phase 19"-Eintrag existierte im Repository. Die verbleibenden offenen MVP-Bausteine (`docs/product/MVP-Scope.md`) nach Phase 18: Aufgaben, Anwesenheit, Zu-/Absagen, Push-Mitteilungen, einfache Statistiken. `docs/modules/Module-Priorities.md` listet Aufgaben, Push-Mitteilungen, Anwesenheit und Statistik alle mit Priorität 1 — keine explizite Rangfolge untereinander.

Drei konvergierende, unabhängige Belege zeigen jedoch eindeutig auf Anwesenheit (Zu-/Absagen) als nächsten Schritt, nicht auf eine gleichrangige Mehrfachauswahl:

- `docs/roadmap/Roadmap.md`, „Phase 3 – Operative Mannschaftsplanung" bündelt „Kalender, Termine, Zusagen, Absagen, Anwesenheit, Aufgaben, Push-Mitteilungen" in dieser Reihenfolge — Phase 18 deckte nur die ersten zwei ab.
- `docs/product/Product-Vision.md`, Mehrwert-Abschnitt: „ein zentraler Ort für Kalender, Termine, **Zu-/Absagen und Anwesenheit**" — eine einzige, zusammenhängende Aussage, die Aufgaben/Push-Mitteilungen nicht erwähnt.
- `docs/database/Database.md` skizziert `Attendance` bereits seit Projektbeginn mit einer konkreten, bereits feststehenden Beziehung („verknüpft eine Person mit einem Event") — `Task`/`Notification` sind vergleichsweise vage beschrieben und erfordern zusätzlich Infrastruktur (Push-Zustellung), die im Projekt noch nicht existiert.

Damit war kein Widerspruch zwischen Dokumenten aufzulösen und keine echte Mehrfachauswahl mit gleichrangigen Kandidaten gegeben — Anwesenheit ist der direkte, bereits im Datenmodell vorgezeichnete fachliche Nachfolger von Phase 18s `Event`.

## 3. Bewusst nicht im Scope

Push-Mitteilungen (Erinnerungen an ausstehende RSVPs), Aufgaben, ein `DepartmentMember`-Modell (siehe ADR 0015, „Verworfene Alternativen"), eine Teilnehmer-Einladungsliste pro Event (das Roster wird aus bestehenden Daten abgeleitet, nicht separat verwaltet) — nichts davon ist in den referenzierten Produktdokumenten für diesen Punkt gefordert.

## 4. Fachliche Entscheidung

Zwei fachlich unterschiedliche, aber zusammengehörige Zustände in einer Entität: `rsvpStatus` (Zu-/Absage, vorab von der betroffenen Person oder ihrem verifizierten Erziehungsberechtigten gesetzt) und `attended` (tatsächliche Anwesenheit, im Nachhinein ausschließlich von einer Person mit Verwaltungsrecht auf das Event gesetzt). Siehe [ADR 0015](architecture/adr/0015-attendance-self-service-authorization.md) für die vollständige Autorisierungs-Begründung.

## 5. Architektur

- **Keine neue Authorization Engine.** Organisator-Zugriff (volle Anwesenheitsliste lesen, RSVP überschreiben, tatsächliche Anwesenheit erfassen) reicht unverändert `EventsService.canAccess` durch (ADR 0014) — dessen Sichtbarkeit wurde von `private` auf `public` geändert (reine Sichtbarkeitsänderung, keine Verhaltensänderung, keine Testauswirkung auf Phase 18).
- **Neuer, unabhängiger Self-Service-Zugriffspfad** für die betroffene Person bzw. ihren verifizierten Erziehungsberechtigten (`AuthorizationService.getGuardianChildPersonIds`, Phase 6, unverändert wiederverwendet) — siehe ADR 0015 für die vollständige Begründung, warum dieser zweite Pfad nötig ist (ein gewöhnlicher Spieler/Elternteil hat oft keine `RoleAssignment`, nur `TeamMember`/`PersonRelationship`).
- „Roster" ist je Event-Scope unterschiedlich definiert (aktive `TeamMember` für Team-Events, `RoleAssignment`-Träger für Department-Events) — beide Definitionen nutzen ausschließlich bereits existierende Datenmodelle, kein neues Mitgliedschaftsmodell.
- Web-Detailseite (`/kalender/[id]`) fragt beide Endpunkte parallel ab und wählt zwischen der vollen Verwaltungsansicht (`EventDetail`) und einer reduzierten Self-Service-Ansicht (`AttendanceOnlyEventView`) — letztere neu, aber bewusst klein und einzweckig, keine Duplikation der Verwaltungslogik.

## 6. Datenmodell / Migration

**Migration: Ja.** Neue Migration `20260906120000_add_attendance`: `RsvpStatus`-Enum (`PENDING`/`ACCEPTED`/`DECLINED`), Tabelle `attendance` (Composite-FKs zu `Event`/`Person`, zwei einfache Attributions-FKs `respondedByPersonId`/`recordedByPersonId` mit `ON DELETE SET NULL`, gleiches Muster wie `RoleAssignment.grantedByPersonId`), `@@unique([eventId, personId])`, Standard-RLS-Block. Zusätzlich: `event` erhält einen neuen `@@unique([tenantId, id])`-Index (gleiches Muster wie `venue_tenantId_id_key`) — `attendance` ist das erste Modell, das `event` über einen Composite Foreign Key referenziert. Begründung: neue fachliche Entität ohne bestehendes Analogon. Migration mit `prisma migrate diff` gegen die vorherige Schema-Version erzeugt (nicht komplett handgeschrieben), RLS-Block manuell angehängt (gleiche Konvention wie alle bisherigen Migrationen). `prisma validate` grün, `prisma migrate status` gegen frische temporäre PostgreSQL-17-DB: alle 15 Migrationen sauber angewendet, **Drift: 0**.

## 7. Backend

- `AttendancesModule`/`AttendancesController`/`AttendancesService` (neues, eigenständiges Modul, importiert `AuthorizationModule` + `EventsModule`) — keine unnötige Erweiterung von `EventsModule` selbst, da Attendance eine eigenständige Ressource mit eigenem Lebenszyklus ist.
- `GET /events/:eventId/attendances` — Roster + RSVP/Anwesenheitsstatus, plus minimaler Event-Kontext (Titel, Zeitraum, Ort, Beschreibung) für den Self-Service-Fall.
- `PUT /events/:eventId/attendances/:personId/rsvp` — Self-Service (eigene/Kind) oder Organisator-Override.
- `PUT /events/:eventId/attendances/:personId/attended` — ausschließlich Organisator.
- Klare Fehlercodes: 403 (weder RBAC noch Self-Service berechtigt), 400 (Zielperson nicht auf dem Roster, ungültiger `RsvpStatus`), 404 (Event nicht gefunden).

## 8. Frontend

Neue Komponenten `AttendanceSection` (Roster-Liste mit Zusagen/Absagen- bzw. War-da/War-nicht-da-Buttons, je nach Berechtigung) und `AttendanceOnlyEventView` (reduzierte Detailansicht für Self-Service-only-Aufrufer). `EventDetail` um die Anwesenheitssektion erweitert. Reine `<form>`-Server-Action-Submits, kein Client-JS. Deutsche Texte, keine technischen IDs sichtbar, mobilfreundlich (`flex-col`/`sm:flex-row`).

## 9. Autorisierung

Siehe Abschnitt 5/ADR 0015. Keine Berechtigungslogik im Frontend — jede Aktion wird serverseitig durch `AttendancesService` erneut geprüft, unabhängig davon, welche Buttons das UI anzeigt.

## 10. RLS / Tenant-Isolation

Standard-RLS-Block für `attendance`. Cross-Tenant-Isolation auf DB-Ebene (`attendance.integration.spec.ts`) und API-Ebene (`attendance.integration-spec.ts`) explizit getestet (Tenant B kann Tenant As Event-Attendances weder lesen noch schreiben, 404). `tenant-scoped-models.spec.ts` proaktiv um `"Attendance"` ergänzt (nicht erst als Bug entdeckt, sondern vorab korrekt eingetragen — bestätigt automatisches RLS-Wrapping ohne Code-Änderung an `tenant-prisma.ts`).

## 11. Concurrency-Bewertung

**Relevant, getestet.** Ein RSVP-Doppel-Submit (Doppelklick) oder zwei nahezu simultane Anfragen für dieselbe (Event, Person) sind über den `@@unique([eventId, personId])`-Constraint kombiniert mit `upsert` von Natur aus idempotent — kein zusätzliches Locking nötig. Explizit getestet: `test/attendance.integration-spec.ts`, „zwei nahezu simultane RSVP-Einreichungen für dieselbe Person landen auf genau einer Zeile" (`Promise.all` zweier PUTs, anschließende Zeilenanzahl-Prüfung).

## 12. Tests

| Ebene | Ergebnis |
|---|---|
| Unit (apps/api) | **193/193** grün (unverändert — Domainlogik ist trivial genug, um vollständig durch Integrationstests abgedeckt zu sein, gleiche Begründung wie Phase 18) |
| Unit (apps/web) | **170/170** grün (10 neu: 2 in `event-detail.test.tsx`, 5 in `attendance-section.test.tsx`, 3 in `attendance-only-event-view.test.tsx`) |
| Unit (packages/database) | **5/5** grün (unverändert) |
| DB-Integration (real PostgreSQL 17) | **152/152** grün über 10 Dateien, davon **9/9** neu in `attendance.integration.spec.ts` |
| API-Integration (real PostgreSQL 17, real HTTP, seriell ausgeführt) | **237/237** grün über 16 Dateien, davon **21/21** neu in `attendance.integration-spec.ts` |
| E2E (real PostgreSQL 17, echter Browser) | **25/25** grün über 15 Spezifikationen, davon **3/3** neu in `attendance.spec.ts` |

Testabdeckung (neu): RBAC- vs. Self-Service-Lesezugriff, Self-RSVP für eigene Person, Self-RSVP für verifiziertes vs. unverifiziertes Kind, RSVP für Person außerhalb des Rosters (400), RSVP für fremde Person ohne Guardian-Beziehung (403), Organisator-Markierung der tatsächlichen Anwesenheit, Nicht-Organisator kann `attended` nicht setzen (auch nicht für sich selbst), Department- vs. Team-Roster-Unterschied, Cross-Tenant, ungültiger `RsvpStatus`, nicht existierendes Event, Doppel-Submit/Nebenläufigkeit.

## 13. Untersuchte, nicht real bestätigte False Positives

Ein erster serieller API-Integrationslauf zeigte 23 Fehlschläge (`Test timed out in 30000ms`), konzentriert in zwei bestehenden Turnierdateien (`tournament-group-position-resolution.integration-spec.ts`, `tournament-match-slot-resolution.integration-spec.ts`) — beide ohne jede Berührung mit dem neuen `Attendance`-Code. Isolierte Wiederholung: **2/2 Dateien, 27/27 Tests grün.** Ein anschließender vollständiger Re-Lauf: **237/237 grün.** Root Cause: kumulative Tunnel-Latenz über die Laufzeit eines ~16-minütigen seriellen Laufs, keine echte Regression.

Während der E2E-Regressionsprüfung (Abschnitt 15) riss der SSH-Tunnel einmal ab (`Connection refused` auf dem lokalen Forward-Port) — durch eine frische, unabhängige SSH-Verbindung wurde die VPS/Container-Gesundheit bestätigt (Load 0.00, Container `Up 2 hours`), der Tunnel mit aggressiverem Keepalive neu aufgebaut, lokale API-/Web-Prozesse frisch neu gestartet. Die zuvor mit uniformen „scheitert an der allerersten Interaktion"-Fehlern betroffene Testdatei-Gruppe (6 Tests, 4 Turnierdateien) lief danach **6/6 grün** — bestätigt als reines Tunnel-Aussetzer, keine Regression.

## 14. Gefundene Bugs

1. **Test-Autorenfehler** (eigener, in `attendance.spec.ts` selbst gefunden): fälschliche Annahme, die E2E-COACH-Fixture-Person („E2E CoachE1", `global-setup.ts`) sei identisch mit der seed-eigenen „Max Mustermann" — beide sind COACH von E1, aber unterschiedliche Personen; nur „Max Mustermann" hat eine `TeamMember`-Zeile. Kein Produktbug.
2. **`global-setup.ts`-Lücke** (echter, durch einen fehlgeschlagenen Testlauf aufgedeckter Infrastrukturfehler): die Stale-Cleanup-Routine löschte `TeamMember`/`RoleAssignment`/`PersonRelationship`/`AccountInvitation` alter „E2E"-Testpersonen, kannte aber `Attendance` (neu in Phase 19) nicht — ein hängengebliebener Testlauf hinterließ eine `Attendance`-Zeile, die die nachfolgende `Person`-Löschung per FK-Constraint blockierte.
3. **E2E-Timeout zu knapp** für den mehrstufigen Erziehungsberechtigten-Test (2× Person anlegen, Beziehung, Teammitgliedschaft, Termin anlegen, Einladung, Signup, reduzierte Detailseite mit zwei parallelen Fetches, RSVP-Submit) — der 30s-Playwright-Default reichte unter SSH-Tunnel-Latenz nicht aus.

## 15. Behobene Bugs

Alle drei oben genannten Punkte behoben und re-verifiziert (Punkt 1: `TeamMember`-Zeile im Test selbst ergänzt; Punkt 2: `db.attendance.deleteMany(...)` vor der Person-Löschung in `global-setup.ts` ergänzt; Punkt 3: `test.setTimeout(90_000)`, gleiches Muster wie `tournament-core.spec.ts`). E2E-Kernfall danach **3/3 grün**, vollständige Regressionssuite **25/25 grün**.

## 16. Bestehende Altlasten

Keine neuen. Die aus Phase 18 bekannte Charakteristik (API-Integrationssuite benötigt bei Ausführung gegen eine getunnelte statt lokale PostgreSQL-Instanz serielle statt parallele Dateiausführung) bestätigte sich erneut — reine Eigenschaft der VPS-Verifikationsumgebung, keine Aussage über reguläre CI/lokale Läufe.

## 17. Risiken

Keine neuen strukturellen Risiken. Der Self-Service-Zugriffspfad (ADR 0015) exponiert ausschließlich minimalen, für die Rückmeldung nötigen Event-Kontext (Titel, Zeit, Ort, Beschreibung) — keine administrativen Felder, keine Bearbeiten-Fähigkeit.

## 18. Technische Schulden

Keine neuen. `Attendance` bündelt bewusst zwei Zustände (RSVP + tatsächliche Anwesenheit) in einer Zeile statt zwei Modellen — angemessen für den aktuellen Umfang, keine spätere Nachbesserung absehbar.

## 19. VPS-Verifikation

PostgreSQL 17, temporärer Container `verevia-phase19-pg17-test` (eigenes Volume, `127.0.0.1`-only, Port 55438). Migration aus leerer DB: alle 15 Migrationen sauber angewendet, **Drift: 0**. Seed zweimal ausgeführt → identische IDs, Idempotenz bestätigt. Ein temporärer SSH-Key musste während der Phase EIN ZWEITES MAL erzeugt werden — ein Sandbox-/Scratchpad-Reset während einer mehrtägigen Pause in der Konversation löschte den privaten Schlüssel lokal (das Repository und alle Phase-19-Arbeitsstände blieben unberührt); der neue öffentliche Schlüssel wurde erneut vom Nutzer hinterlegt.

## 20. Cleanup

- Temporärer Container `verevia-phase19-pg17-test`: entfernt.
- Temporäres Volume `verevia-phase19-pg17-test-vol`: entfernt.
- SSH-Tunnel: geschlossen.
- Beide temporären SSH-Keys dieser Phase (`verevia-phase19-attendance-1788844323`, ersetzt durch `verevia-phase19-attendance-1789193375` nach dem Sandbox-Reset): aus `/home/maik/.ssh/authorized_keys` entfernt, **Entfernung durch fehlgeschlagenen Reconnect-Versuch verifiziert** (`Permission denied (publickey,password)`), lokale Schlüsseldateien gelöscht.
- Lokale temporäre API-/Web-Serverprozesse gestoppt.
- Permanente Ressourcen (`verevia-dev-web`, `verevia-dev-api`, `verevia-dev-postgres`, `verevia-traefik`): **unverändert**, `verevia-prod` **nicht angetastet**.
- Keine Secrets, keine `.env`-Dateien, keine temporären Testartefakte (`test-results/`, `playwright-report/`) im Repository.

## 21. Finaler Git-/PR-Status

- Branch: `feat/attendance-tracking`
- Endcommit: siehe PR
- PR: siehe unten
- **Gemergt: NEIN**

PHASE 19 READY
