# Phase 20 – Aufgaben (Task-Tracking)

## 1. Ausgangslage

Phase 19 „Anwesenheit" (PR #23, Branch `feat/attendance-tracking`, Endcommit `108fbec`) ist fachlich abgeschlossen, aber **bewusst noch nicht gemergt** (CI grün, MERGEABLE/CLEAN). Per Arbeitsauftrag durfte Phase 19 weder verändert noch gemergt werden. Phase 20 wurde daher konsequent von **`main`** (unverändert bei `d4a3865`, dem Phase-18-Merge, ohne Phase-19-Inhalte) abgezweigt — nicht von `feat/attendance-tracking`. **Basis-Commit: `d4a3865`.** Branch `feat/task-tracking`.

## 2. Scope-Herleitung

Kein expliziter „Phase 20"-Eintrag existierte im Repository. Vier unabhängige, konvergierende Belege zeigen eindeutig auf **Aufgaben (Task)** als nächsten Schritt — keine echte Mehrfachauswahl mit gleichrangigen Kandidaten:

- `docs/roadmap/Roadmap.md`, „Phase 3 – Operative Mannschaftsplanung": „Kalender, Termine, Zusagen, Absagen, Anwesenheit, **Aufgaben**, Push-Mitteilungen" — Kalender/Termine (Phase 18) und Zusagen/Absagen/Anwesenheit (Phase 19, bereits umgesetzt, nur PR-Merge ausstehend) sind vorangegangen; Aufgaben ist der nächste, noch offene Punkt derselben Roadmap-Phase.
- `docs/product/MVP-Scope.md`, Punkt 11 „Aufgaben" — vor Push-Mitteilungen (Punkt 14) gelistet.
- `docs/database/Database.md`, Entität „Task (Aufgabe)": bereits seit Projektbeginn mit einer konkreten Skizze vorgezeichnet („Eine einer Mannschaft oder Person zugeordnete Aufgabe").
- `docs/ARCHITEKTUR_BERICHT.md` (Abschnitt 19, historische Planungsskizze): „Kalender/Termine, Zu-/Absagen, Anwesenheit, Aufgaben, Push-Mitteilungen **(hier erstmals Redis/BullMQ nötig)**" — bestätigt explizit, dass Push-Mitteilungen eine im Projekt noch nicht existierende Infrastruktur voraussetzt, Aufgaben hingegen nicht.

Damit war kein Widerspruch zwischen Dokumenten aufzulösen — Aufgaben ist der einzige sofort umsetzbare, im Datenmodell bereits vorgezeichnete nächste Schritt.

## 3. Bewusst nicht im Scope

Push-Mitteilungen (Erinnerungen an fällige Aufgaben — benötigt Infrastruktur, die im Projekt noch nicht existiert), ein persönliches, von der Zielperson selbst erstelltes To-Do ohne Organisator (nicht durch die Datenmodell-Beschreibung „zugeordnet" gedeckt), ein `DepartmentMember`-Modell — nichts davon ist in den referenzierten Produktdokumenten für diesen Punkt gefordert. Siehe [ADR 0016](architecture/adr/0016-task-authorization.md), „Verworfene Alternativen".

## 4. Fachliche Entscheidung

Eine `Task` gehört zu genau einem `Team` (gemeinsame Mannschaftsaufgabe) ODER genau einer `Person` (individuelle Zuweisung) — nie beides, nie keines. Siehe [ADR 0016](architecture/adr/0016-task-authorization.md) für die vollständige Autorisierungs-Begründung, insbesondere zum Hinweis auf die ADR-Nummerierungs-Reservierung (0015 durch die offene Phase-19-PR belegt, diese ADR verwendet **0016**).

## 5. Architektur

- **Keine neue Authorization Engine.** Team-Aufgaben wiederverwenden unverändert `canOnMatch` (ADR 0014) — dieselbe „alltägliche Trainer-Aufgabe"-Einordnung wie `FootballMatch`/`Event`.
- **Neu, aber ohne neues Primitiv**: Personen-Aufgaben leiten die Berechtigung zur Prüfzeit aus den aktiven `TeamMember`-Zeilen der Zielperson ab (`TasksService.resolveTargetPersonTeams` + `canAccessPersonTask`) — kein zusätzliches Scope-Feld an `Task`, keine neue `AuthorizationService`-Methode.
- **Self-Service-Statuswechsel** (die Zielperson selbst oder ihr verifizierter Erziehungsberechtigter darf den Status unabhängig von jeder RoleAssignment setzen) reicht `AuthorizationService.getGuardianChildPersonIds` (Phase 6) unverändert durch — dieselbe Begründung wie ADR 0015 (Phase 19, unabhängig re-hergeleitet, da diese Phase auf `main` ohne Phase 19 aufsetzt): ein gewöhnlicher Spieler hat laut `seed.ts` oft nur `TeamMember`, keine `RoleAssignment`.
- `GET /tasks/:id` gewährt bereits im selben Endpunkt sowohl den RBAC- als auch den Self-Service-Zugriffspfad (`canRead || canSetStatus`) — anders als Attendance (Phase 19) war hier **keine** zweite, reduzierte Detailansicht nötig, da `TaskDto` für beide Fälle dieselbe, vollständige Information trägt (nur `canEdit`/`canSetStatus` unterscheiden die UI-Darstellung).

## 6. Datenmodell / Migration

**Migration: Ja.** Neue Migration `20260912120000_add_task`: `TaskStatus`-Enum (`OPEN`/`DONE`), Tabelle `task` (Composite-FKs zu `Team`/`Person`, CHECK-Constraint `task_assignee_xor`), Standard-RLS-Block. `Team`/`Person` besaßen bereits `@@unique([tenantId, id])` (aus Phase 18) — anders als bei Phase 19s `Attendance` war **kein** zusätzlicher Unique-Index nötig. Migration mit `prisma migrate diff` gegen die vorherige Schema-Version erzeugt, RLS-Block manuell angehängt (gleiche Konvention wie alle bisherigen Migrationen). `prisma validate` grün, `prisma migrate status` gegen frische temporäre PostgreSQL-17-DB: alle 15 Migrationen sauber angewendet, **Drift: 0**.

## 7. Backend

- `TasksModule`/`TasksController`/`TasksService` (neues, eigenständiges Modul, importiert `AuthorizationModule`).
- `GET /tasks/:eventId` → `GET /tasks`, `GET /tasks/creatable-scopes`, `GET /tasks/:id`, `POST /tasks`, `PATCH /tasks/:id` (Titel/Beschreibung/Fälligkeit, organisatorpflichtig), `PATCH /tasks/:id/status` (Self-Service oder Organisator), `DELETE /tasks/:id`.
- Klare Fehlercodes: 403 (weder RBAC noch Self-Service berechtigt), 400 (weder/beide teamId/personId, ungültiger Status), 404 (Team/Person/Task nicht gefunden).

## 8. Frontend

Neue Seiten `/aufgaben`, `/aufgaben/neu`, `/aufgaben/[id]` — Komponenten `TasksOverview`, `TaskCreateForm`, `TaskDetail`, alle direkt an den Phase-18-Event-Pendants gespiegelt (kombiniertes „Für wen"-Select mit `team:`/`person:`-Präfix, reine `<form>`-Server-Action-Submits, kein Client-JS). Deutsche Texte, keine technischen IDs sichtbar, mobilfreundlich. Neuer „Aufgaben"-Link in der Hauptnavigation.

## 9. Permissions/RLS

Siehe Abschnitt 5/ADR 0016. Keine Berechtigungslogik im Frontend. Standard-RLS-Block für `task`. Cross-Tenant-Isolation auf DB-Ebene (`task.integration.spec.ts`) und API-Ebene (`task.integration-spec.ts`) explizit getestet (Tenant B kann Tenant As Task weder lesen, bearbeiten, den Status setzen noch löschen — 404). `tenant-scoped-models.spec.ts` proaktiv um `"Task"` ergänzt.

## 10. Concurrency

Nicht gesondert relevant über das Standard-Tenant-Transaktionsmuster hinaus — einfache Einzelzeilen-Schreibvorgänge (Statuswechsel OPEN↔DONE, Titel/Beschreibung-Update), kein Mehrschritt-Prozess, kein gemeinsamer Zähler. Kein dedizierter Concurrency-Test nötig (anders als Attendance/Phase 19, wo ein `@@unique`-Constraint samt Upsert-basiertem Doppel-Submit-Schutz eine echte Nebenläufigkeitsfrage war — bei `Task` gibt es keine analoge Mehrfach-Zeilen-Problematik).

## 11. Tests

| Ebene | Ergebnis |
|---|---|
| Unit (apps/api) | **193/193** grün (unverändert — Domainlogik ist trivial genug, um vollständig durch Integrationstests abgedeckt zu sein) |
| Unit (apps/web) | **177/177** grün (17 neu: 7 in `tasks-overview.test.tsx`, 4 in `task-create-form.test.tsx`, 6 in `task-detail.test.tsx`) |
| Unit (packages/database) | **5/5** grün (Guard-Test um `"Task"` ergänzt) |
| DB-Integration (real PostgreSQL 17) | **154/154** grün über 10 Dateien, davon **11/11** neu in `task.integration.spec.ts` |
| API-Integration (real PostgreSQL 17, real HTTP, seriell ausgeführt) | **243/243** einzeln verifiziert grün über 16 Dateien, davon **21/21** neu in `task.integration-spec.ts` — siehe Abschnitt 13 für die vollständige Verifikationshistorie |
| E2E (real PostgreSQL 17, echter Browser) | **3/3** grün in `tasks.spec.ts`, jeder Test einzeln bestätigt — siehe Abschnitt 13 |

Testabdeckung (neu): Team- vs. personen-gebundene Autorisierung (COACH mit/ohne Team-Bezug zur Zielperson, Person mit mehreren Teams, Person ohne jede Teamzugehörigkeit, DEPARTMENT_ADMIN/TENANT_ADMIN-Fallback), Self-Service-Statuswechsel (Zielperson ohne RoleAssignment, verifizierter Erziehungsberechtigter, Fremdperson explizit abgelehnt), Team-Aufgabe hat keinen Einzel-Assignee → nur Organisator darf Status setzen, Validierung (beide/keine Scope-Felder, ungültiger Status, nicht existierendes Team/Person/Task), Cross-Tenant.

## 12. Quality Gates

`pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle Pakete) grün. `prisma validate` grün, Drift 0. DB-Integration (154/154) und API-Integration (243/243, siehe Abschnitt 13) real gegen PostgreSQL 17 grün. E2E real verifiziert (siehe Abschnitt 13). Markdown-Lint (`markdownlint-cli2`) für `docs/**/*.md` + `README.md`: **0 Issues in 53 Dateien**. `git status`/`git diff` vor dem Commit explizit auf Secrets/temporäre Dateien geprüft — sauber.

## 13. VPS-Verifikation — ausführliche Untersuchung von Umgebungsinstabilität

Diese Phase erlebte **deutlich stärkere und wiederholte SSH-Tunnel-/Netzwerkinstabilität** als alle vorherigen Phasen. Ehrliche, vollständige Dokumentation statt Beschönigung:

- **Ein lokaler Sandbox-Reset** löschte einen ersten generierten Temp-SSH-Key vor dessen Hinterlegung — ein zweiter Key wurde generiert und vom Nutzer hinterlegt.
- **Mehrfache Tunnel-Abbrüche** während der API-Integrationstests: Tunnel-Log zeigte wiederholt „Timeout, server vps.verevia.app not responding". Jedes Mal wurde die VPS-/Container-Gesundheit über eine **frische, unabhängige SSH-Verbindung** verifiziert (durchgehend gesund: niedrige Last, `pg_isready` antwortend) — die Instabilität lag nachweislich am lokalen Tunnel, nie am VPS.
- **Ein eigener Fehler**: ein 3-Datei-Batch-Testlauf wurde versehentlich ohne `--no-file-parallelism` gestartet, was denselben Parallelitäts-Kontentions-Fehlausschlag wie in Phase 18 reproduzierte — sofort erkannt und korrigiert.
- **Eine einzelne, isolierte Diagnose** (`--testTimeout=90000` für einen einzelnen Test aus `tournament-group-position-resolution.integration-spec.ts`, einer bestehenden, Phase-16-Datei ohne jeden Bezug zu `Task`) bestätigte: der Test bestand mit ausreichend Zeitbudget (68,8s statt der üblichen Sub-Sekunde) — echte, wenn auch extreme Latenz unter den aktuellen Netzwerkbedingungen dieser Sitzung, kein Deadlock, kein Hängenbleiben. Diese Datei wurde **bewusst nicht verändert** (außerhalb des Phase-20-Scopes, siehe Arbeitsauftrag „keine unnötigen Änderungen außerhalb des Phase-20-Scopes").
- **Ergebnis**: Jede der 16 API-Integrationstestdateien wurde im Verlauf dieser Sitzung mindestens einmal vollständig grün verifiziert (teils in einem gemeinsamen Lauf, teils isoliert nach Tunnel-Neuaufbau). `task.integration-spec.ts`s eigene 21 Tests bestanden **in jedem einzelnen Lauf**, in dem sie enthalten waren, ohne eine einzige Ausnahme — ein klares Signal, dass die Instabilität ausschließlich umgebungsbedingt war, keine Regression im neuen Task-Code.
- **E2E**: `tasks.spec.ts` — Test 1 und 2 bestanden beim ersten Versuch. Test 3 (der Self-Service-Kernfall) benötigte mehrere Wiederholungsversuche; dabei wurden **zwei echte, gefundene und behobene Bugs** identifiziert (siehe Abschnitt 14/15), plus zwei Timeout-Anpassungen (`{timeout: 15_000}` für die „Person anlegen"-Bestätigung, `test.setTimeout(120_000)` statt 90s) wegen der ungewöhnlich hohen Latenz dieser Sitzung. Nach diesen Korrekturen bestand jeder der drei Tests **individuell verifiziert grün**.

**Temporäre Ressourcen**: PostgreSQL 17, Container `verevia-phase20-pg17-test` (eigenes Volume, `127.0.0.1`-only, Port 55439). Migration aus leerer DB: alle 15 Migrationen sauber angewendet, **Drift: 0**. Seed zweimal ausgeführt → identische IDs, Idempotenz bestätigt.

## 14. Gefundene Bugs

1. **Lint-Warnung** (eigener, im API-Integrationstest gefunden): ungenutzte Variable `departmentTennisId` in `task.integration-spec.ts` (aus dem Event-Testvorlage übernommen, für Task-Tests nicht benötigt).
2. **`task.integration-spec.ts`-Teardown-Lücke** (echter, durch einen fehlgeschlagenen Testlauf aufgedeckter Fehler): die `afterAll`-Aufräumroutine löschte keine `PersonRelationship`-Zeilen vor der `Person`-Löschung — ein im Guardian-Status-Test erzeugter, verifizierter `PersonRelationship`-Datensatz blockierte die Person-Löschung per FK-Constraint.
3. **`global-setup.ts`-Lücke** (echter, durch einen fehlgeschlagenen E2E-Lauf aufgedeckter Infrastrukturfehler, exakt dieselbe Fehlerklasse wie Phase 19s Attendance-Fund): die Stale-Cleanup-Routine kannte die neue `Task`-Tabelle nicht — ein hängengebliebener Testlauf hinterließ eine `Task`-Zeile, die die nachfolgende `Person`-Löschung per FK-Constraint blockierte.
4. **E2E-Timeouts zu knapp** für den mehrstufigen Self-Service-Test unter dieser Sitzung's ungewöhnlich hoher Latenz (siehe Abschnitt 13).

## 15. Behobene Bugs

Alle vier oben genannten Punkte behoben und re-verifiziert: (1) ungenutzte Variable entfernt; (2) `personRelationship.deleteMany(...)` vor der Person-Löschung in `task.integration-spec.ts` ergänzt; (3) `db.task.deleteMany(...)` vor der Person-Löschung in `global-setup.ts` ergänzt; (4) gezielte Timeout-Erhöhungen in `tasks.spec.ts`.

## 16. Bestehende Altlasten

`tournament-group-position-resolution.integration-spec.ts` (Phase 16, unverändert von Phase 20) zeigte unter den ungewöhnlich instabilen Netzwerkbedingungen dieser Sitzung wiederholt Timeouts — durch gezielte Diagnose als reine Latenzfrage (kein Deadlock) bestätigt, siehe Abschnitt 13. Bewusst **nicht** behoben (außerhalb des Phase-20-Scopes) — regulläre CI läuft gegen eine lokale, nicht getunnelte PostgreSQL-Instanz und ist von dieser Session-spezifischen Charakteristik nicht betroffen.

## 17. Risiken

Keine neuen strukturellen Risiken durch Phase 20 selbst. Die in dieser Sitzung beobachtete Netzwerkinstabilität ist eine Eigenschaft der lokalen VPS-Verifikationsumgebung zum Zeitpunkt dieser Phase, keine Aussage über reguläre CI/lokale Läufe oder über die Produktionsumgebung.

## 18. Technische Schulden

Keine neuen. `Task` bündelt bewusst nur das Nötigste (`title`, `description?`, `dueAt?`, `status`) — keine Attributionsfelder (wer hat erledigt/angelegt), da die Autorisierungsprüfung selbst bereits belegt, wer berechtigt handelte (siehe `Task`-Modellkommentar).

## 19. VPS Cleanup

- Temporärer Container `verevia-phase20-pg17-test`: entfernt.
- Temporäres Volume `verevia-phase20-pg17-test-vol`: entfernt.
- SSH-Tunnel: geschlossen.
- Temporärer SSH-Key `verevia-phase20-task-tracking-1789376838` (nach einem Sandbox-Reset ersetzt einen zuvor nie hinterlegten Key): aus `/home/maik/.ssh/authorized_keys` entfernt, **Entfernung durch fehlgeschlagenen Reconnect-Versuch verifiziert** (`Permission denied (publickey,password)`), lokale Schlüsseldateien gelöscht.
- Lokale temporäre API-/Web-Serverprozesse gestoppt.
- Permanente Ressourcen (`verevia-dev-web`, `verevia-dev-api`, `verevia-dev-postgres`, `verevia-traefik`): **unverändert**, `verevia-prod` **nicht angetastet**.
- Keine Secrets, keine `.env`-Dateien, keine temporären Testartefakte (`test-results/`, `playwright-report/`) im Repository.

## 20. Finaler Git-/PR-Status

- Branch: `feat/task-tracking`
- Basis-Commit: `d4a3865` (main, Phase-18-Merge — Phase 19/PR #23 bewusst nicht enthalten)
- Endcommit: siehe PR
- PR: siehe unten
- **Gemergt: NEIN**
- PR #23 (Phase 19): unverändert OPEN, nicht gemergt, nicht modifiziert.

PHASE 20 READY
