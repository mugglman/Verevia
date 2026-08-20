# Phase 3 – Core Hardening und erster Vereins-Workflow

> Abschlussbericht zum Arbeitspaket „Verevia – Phase 3: Core Hardening und erster Vereins-Workflow". Bezieht sich auf [PHASE_2_CORE_REPORT.md](./PHASE_2_CORE_REPORT.md) (TEIL A dieses Auftrags schließt dessen offene Punkte) und führt mit TEIL B den ersten fachlichen Vertical Slice (Verein → Abteilung → Mannschaft) ein.

## 1. Ausgangszustand

Zu Beginn dieses Arbeitspakets war `feat/core-data-model` bereits gemergt (siehe Abschnitt 4), das Core-Datenmodell (Tenant, Person, Membership, Department, Team, RoleAssignment, PlatformRoleAssignment, PersonRelationship) stand mit RLS-Policies auf allen tenant-gebundenen Tabellen. Die zwischen Phase 2 und diesem Auftrag noch offene, explizit als nicht optional markierte Lücke: Cross-Tenant-Referenzen waren nur für `team.departmentId`/`role_assignment.departmentId`/`role_assignment.teamId` durch Composite Foreign Keys abgesichert; `role_assignment.personId` und `person_relationship.fromPersonId`/`toPersonId` referenzierten noch einfache (nicht-composite) Fremdschlüssel. Es existierte noch kein fachlicher HTTP-Endpunkt, kein `TenantContextInterceptor`-Einsatz in echten Controllern, keine Authorization-Schicht und keine Web-UI mit echten Vereinsdaten.

## 2. Core-Hardening

`packages/database/prisma/schema.prisma` wurde um `Person.@@unique([tenantId, id])` ergänzt; `RoleAssignment.person` und `PersonRelationship.fromPerson`/`toPerson` wurden von einfachen auf Composite Foreign Keys `(tenantId, personId) → person(tenantId, id)` umgestellt. `RoleAssignment.grantedByPerson` und `PersonRelationship.verifiedByPerson` bleiben bewusst einfache FKs mit `ON DELETE SET NULL` (Prisma warnt vor `SetNull` auf einer Composite-FK mit NOT-NULL-Spalte `tenantId`; beide Felder sind rein attributiv, immer serverseitig aus validiertem Tenant-Kontext gesetzt, nie Client-Input — Begründung im Schema-Kommentar dokumentiert).

**Während der VPS-Verifikation (Abschnitt 19) wurde festgestellt, dass diese zweite Härtungsrunde zwar im Schema vollständig deklariert, aber nie als Migration geschrieben worden war** (Schema-Drift, per `prisma migrate diff` bestätigt). Nachgezogen als `20260820113220_add_person_cross_tenant_fk_consistency`, angewendet und über einen erneuten `prisma migrate diff` als vollständig (keine Restdifferenz) verifiziert.

## 3. Cross-Tenant-Constraints

Vollständiger Stand nach dieser Migration — für **jede** tenant-gebundene Relation gilt ein Composite Foreign Key `(tenantId, <ref>Id) → <Tabelle>(tenantId, id)`, PostgreSQL MATCH SIMPLE (NULL in der referenzierenden Spalte erfüllt den Constraint trivial, z. B. `departmentId` bei TENANT-Scope-RoleAssignments):

- `RoleAssignment(tenantId, personId) → Person(tenantId, id)`
- `RoleAssignment(tenantId, departmentId) → Department(tenantId, id)`
- `RoleAssignment(tenantId, teamId) → Team(tenantId, id)`
- `Team(tenantId, departmentId) → Department(tenantId, id)`
- `PersonRelationship(tenantId, fromPersonId) → Person(tenantId, id)`
- `PersonRelationship(tenantId, toPersonId) → Person(tenantId, id)`
- `Department → Tenant`, `Team → Tenant`, `Person → Tenant`, `Membership → Person` (kein `tenantId` auf `Membership` — bewusst, globale Identitätsebene, siehe Schema-Kommentar) sind einfache, nicht zusammengesetzte FKs, da hier keine zweite tenant-gebundene Spalte im Spiel ist.

Mit echten PostgreSQL-Integrationstests verifiziert (`packages/database/src/__tests__/cross-tenant-fk.integration.spec.ts`, 6 Tests: 3 Negativ-/3 Positivfälle für Team→Department und RoleAssignment→Department/Team) plus den bestehenden 12 RLS-Tests — 18/18 grün gegen eine echte, frisch migrierte PostgreSQL-17-Instanz (siehe Abschnitt 19).

## 4. Phase-2-PR/Merge

PR `feat/core-data-model → main`, Titel `feat(core): implement multi-tenant data foundation`, wurde in der vorausgehenden Sitzung dieses Arbeitspakets erstellt, CI grün und konfliktfrei geprüft und autonom gemergt (`main`-Commit `119a9f1`). Kein Force-Push, keine History-Rewrite. `main` wurde lokal aktualisiert, bevor `feat/club-structure` erstellt wurde.

## 5. Phase-3-Branch

`feat/club-structure` wurde von aktuellem `origin/main` erstellt (Commit `119a9f1`). Sämtliche Arbeit dieses Berichts liegt ausschließlich auf diesem Branch.

## 6. API-Struktur

NestJS-Module `ClubModule`, `DepartmentsModule`, `TeamsModule`, `AuthorizationModule` (neu), `HealthModule` (bestehend, jetzt versioniert). Schichtenmodell aus Phase 1/2 fortgeführt: DTOs (`class-validator`) → Controller (dünn, keine Fachlogik) → Service (Fachlogik + Authorization-Aufrufe) → `getTenantPrisma`. Keine neuen Architekturmuster eingeführt.

## 7. API-Versionierung

[ADR 0007](./architecture/adr/0007-api-versioning.md): URI-basiert unter `/api/v1/…` über NestJS' eingebautes `VersioningType.URI` + `defaultVersion: "1"`, kombiniert mit globalem Präfix `app.setGlobalPrefix("api")`. `/health`, `/health/ready` und `/api/auth/*` bleiben bewusst unversioniert/außerhalb des Präfixes (betrieblich bzw. durch better-auth-Konvention vorgegeben). Kein eigenes Versionierungsmodul, keine vorsorgliche v2-Struktur.

## 8. Authentication

Echte better-auth-Sessions, keine Mock-User im Produktivcode. `apps/api` mountet better-auth weiterhin direkt auf der rohen Express-Instanz vor Nests Body-Parser (Phase-1/2-Muster, unverändert). `apps/web` erhält erstmals einen echten `better-auth/react`-Client (`apps/web/src/lib/auth-client.ts`) und eine echte Login-Seite (`apps/web/src/app/login/page.tsx`, Client-Component, ruft `authClient.signIn.email()`). Unauthentifizierte Requests an fachliche Endpunkte liefern `401` (mit echten PostgreSQL-Integrationstests verifiziert, Abschnitt 18).

## 9. Tenant-Kontext

`X-Tenant-Id`-Header wird **nie** direkt als DB-Kontext vertraut. Tatsächlicher Fluss: Request → better-auth-Session → User → angeforderter Tenant (`X-Tenant-Id`) → Prüfung einer aktiven `Membership` samt `RoleAssignment` dieser Person in genau diesem Tenant → Tenant-Kontext aufgebaut → `TenantPrismaService`/`getTenantPrisma` → `SET LOCAL app.tenant_id` innerhalb einer Transaktion → RLS → fachliche Query. `TenantContextInterceptor` (Phase-2-Artefakt, bis dahin an keinem echten Controller verwendet) ist jetzt an `ClubController`, `DepartmentsController`, `TeamsController` angeschlossen — erster produktiver Einsatz. Ein manipulierter `X-Tenant-Id`-Header für einen fremden Tenant liefert `403` (kein Membership) statt Zugriff — mit echtem PostgreSQL-Test verifiziert (`a manipulated X-Tenant-Id for a foreign tenant never grants access`).

Der closure-basierte `getTenantPrisma`-Ansatz aus Phase 2 wurde geprüft und beibehalten; **kein** Rückbau auf `AsyncLocalStorage` innerhalb der Prisma-Extension (die aus Phase 2 bekannte Unzuverlässigkeit dieses Musters bleibt der Grund). `AsyncLocalStorage` wird weiterhin ausschließlich für die App-Layer-Request-Context-Propagation im Interceptor verwendet (`runWithTenantContext`/`getTenantContext`) — unverändert korrekt.

## 10. Authorization

Neuer, handgeschriebener `AuthorizationService` (`apps/api/src/authorization/authorization.service.ts`) statt CASL — bewusst, um keine unnötig komplexe Architektur für den aktuellen Bedarf einzuführen; die Struktur (`canOnClub`/`canOnDepartment`/`canOnTeam`, klar getrennte `Action`/Scope-Typen) ist so gehalten, dass eine spätere CASL-Migration mechanisch bliebe. Rollen-Minimum wie gefordert umgesetzt:

- **TENANT_ADMIN**: Verein lesen/bearbeiten; Abteilungen lesen/anlegen/bearbeiten; Mannschaften lesen/anlegen/bearbeiten (tenant-weit).
- **DEPARTMENT_ADMIN**: eigenen Verein lesen; eigene Abteilung lesen/bearbeiten; Mannschaften der eigenen Abteilung lesen/anlegen/bearbeiten — keine Berechtigung für andere Abteilungen.
- **COACH**: Verein lesen; eigene Abteilung lesen; eigene Mannschaft lesen — keine Schreibrechte auf Verein/Abteilung, keine Verwaltung fremder Mannschaften.

`PARENT`/`GUARDIAN` bleibt wie gefordert explizit keine RBAC-Rolle. Andere bestehende Rollen (`YOUTH_DIRECTOR`, `TEAM_MANAGER`, `ASSISTANT_COACH`, `PLAYER`, `MEMBER`, `GUEST`) wurden nicht neu definiert — außerhalb des Scopes dieses Slices.

## 11. Scope-Auswertung

Scope-Kaskade TENANT ⊃ DEPARTMENT ⊃ TEAM real ausgewertet, nicht nur simuliert: `PersonRoleAssignmentsService.load()` lädt die tatsächlichen `RoleAssignment`-Zeilen (inkl. `team.departmentId` für die TEAM→DEPARTMENT-Ableitung) über `getTenantPrisma`, `AuthorizationService` wertet sie pro Aktion aus. 16 Unit-Tests (`authorization.service.spec.ts`, reine Logik ohne DB) decken exakt die im Auftrag genannten Beispiele ab: COACH von E1 darf E1 lesen, aber nicht automatisch E2 schreiben; DEPARTMENT_ADMIN Fußball darf nicht in Tennis verwalten. Zusätzlich mit echten HTTP-Requests gegen echte PostgreSQL verifiziert (Abschnitt 18).

## 12. Vereins-API

- `GET /api/v1/club` — aktueller Tenant (Name, Slug, `canEdit`-Metadatum für die UI).
- `PATCH /api/v1/club` — nur für autorisierte Nutzer (TENANT_ADMIN), nur `name` (2–120 Zeichen) — keine erfundenen Felder auf `Tenant`. Kein öffentliches Vereins-Onboarding; der Pilot-Tenant existiert ausschließlich über den Seed.

## 13. Abteilungs-API

- `GET /api/v1/departments` (Liste, `{items, canCreate}`), `GET /api/v1/departments/:id` (Detail inkl. `canEdit`/`canCreateTeams`), `POST /api/v1/departments`, `PATCH /api/v1/departments/:id`. **Kein DELETE** (Lifecycle/Löschregeln noch nicht geklärt, wie gefordert). `Department` bleibt sportneutral — nur `name` (2–100 Zeichen).

## 14. Mannschafts-API

- `GET /api/v1/teams` (optional `?departmentId=`), `GET /api/v1/teams/:id`, `POST /api/v1/teams` (validiert zuerst die Existenz der Department — liefert `404`, wenn sie nicht im aktuellen Tenant existiert, was Cross-Tenant-Team-Erstellung technisch unmöglich macht), `PATCH /api/v1/teams/:id`. **Kein DELETE**. Nur `name` — keine fußballspezifischen Felder.

Alle schreibenden Endpunkte: globale `ValidationPipe({whitelist: true, forbidNonWhitelisted: true, transform: true})` — unbekannte Felder werden mit `400` abgelehnt (u. a. explizit gegen ein im Body mitgeschicktes `tenantId` getestet, Abschnitt 18), `tenantId` wird nirgends aus dem Request-Body übernommen, sondern ausschließlich aus dem validierten Tenant-Kontext (Abschnitt 9) abgeleitet.

## 15. Web-UI

Erste echte Verevia-Web-UI in `apps/web` mit realen Daten (kein Platzhalter/Mock mehr):

- **Navigation** (`components/nav.tsx`): nur "Verevia" + "Verein" — keine Einträge für nicht existierende Features.
- **Vereinsansicht** (`/`, `club-overview.tsx`): Name (editierbar für Berechtigte), Abteilungen als Karten-/Listenansicht, Anlegen-Formular nur bei `canCreateDepartment`.
- **Abteilungsansicht** (`/abteilungen/[id]`, `department-view.tsx`): Name (editierbar), Mannschaften als Karten, Anlegen-Formular nur bei `canCreateTeams`, Breadcrumb zurück zum Verein.
- **Mannschaftsansicht** (`/mannschaften/[id]`, `team-view.tsx`): Name (editierbar), Breadcrumb Verein → Abteilung — bewusst weiterhin ohne Kader/Spieler/Trainer-Verwaltung/Saisonverwaltung.
- Durchgehend deutsche UI-Sprache; interne Begriffe (Tenant, Department, RoleAssignment, Scope, RLS) tauchen nirgends in der Oberfläche auf — stattdessen Verein/Abteilung/Mannschaft/Berechtigung.
- Bestehende Verevia-Markenfarben (`#00cbdd`/`#02bbcc`/`#77f1fc`) und die vorhandene shadcn/Tailwind-Basis wiederverwendet, kein eigenes Design-System-Projekt.
- Mutationen laufen über Next.js Server Actions (`app/actions.ts`) mit `revalidatePath` — kein Client-seitiges State-Management für Formulare nötig.

## 16. Responsive Verhalten

Karten-/Listen-Layout (`grid grid-cols-1 sm:grid-cols-2`) statt Desktop-Tabelle — funktioniert identisch auf Smartphone (eine Spalte), Tablet/Desktop (zwei Spalten), ohne horizontales Scrollen als einzige Interaktionsform. Manuell im gebauten Produktions-Frontend über verschiedene Viewport-Breiten geprüft (Formularfelder umbrechen via `flex-wrap`, Buttons bleiben erreichbar). Keine Pixel-/Screenshot-Tests (wie im Auftrag nicht gefordert).

## 17. Seeds

`packages/database/prisma/seed.ts` erweitert: nach dem bestehenden Tenant/Department-Seed werden zusätzlich die Mannschaften **E1** und **E2** unter Fußball angelegt (`db.team.upsert`). Ausschließlich fiktionale/technische Daten — keine echten Kinder, Eltern, Trainer oder Vereinsmitglieder. Auf dem VPS zweifach hintereinander ausgeführt und als idempotent verifiziert (identische IDs bei wiederholtem Lauf, Abschnitt 19).

## 18. Tests

- **DB-Integrationstests** (`packages/database`, gegen echte PostgreSQL): 12 RLS-Tests + 6 Cross-Tenant-FK-Tests = 18/18 grün.
- **API-Unit-Tests** (`apps/api`, ohne DB): 16 Authorization-Service-Tests + 1 Health-Test = 17/17 grün.
- **API-Integrationstests** (`apps/api/test/club-structure.integration-spec.ts`, gegen echte PostgreSQL + echte better-auth-Sessions): 14 Tests — deckt alle im Auftrag geforderten Minimalfälle ab (401 ohne Session, 403 ohne Membership, 403 bei manipuliertem Fremd-Tenant-Header, Tenant-A sieht keine Departments/Teams von Tenant B, TENANT_ADMIN kann Department/Team anlegen, DEPARTMENT_ADMIN Fußball kann in Fußball anlegen aber nicht in Tennis, COACH E1 darf E1 lesen aber nicht E2 schreiben, unbekannte Felder inkl. `tenantId` im Body werden abgelehnt) plus `tenant-context.integration-spec.ts` (Phase-2-Bestand, weiterhin grün) und `health.integration-spec.ts` — zusammen 19/19 grün.
- **Web-Unit-Tests** (`apps/web`, Vitest + Testing Library): 16 Tests über die drei präsentationalen Komponenten (Vereinsname sichtbar, Abteilung sichtbar, Mannschaften sichtbar, Empty-State ohne Mannschaften, berechtigungsabhängige Formulare korrekt ein-/ausgeblendet) — 16/16 grün.
- **E2E-Happy-Path** (`apps/web/e2e/club-structure.spec.ts`, Playwright, echter Chromium-Browser): Session (echte better-auth-Anmeldung über eine Test-Session-Fixture, siehe Abschnitt 19) → TSV Benediktbeuern → Fußball → Mannschaftsliste (E1/E2 sichtbar) → E1 öffnen — grün gegen den vollständig laufenden Stack (echte PostgreSQL + echte `apps/api` + echte `apps/web`-Produktionsinstanz).

**Während dieser Verifikation gefundener und behobener Fehler**: `club-structure.integration-spec.ts` baute die NestJS-Testinstanz ursprünglich ohne `setGlobalPrefix`/`enableVersioning`/`ValidationPipe` auf (im Unterschied zu `apps/api/src/main.ts`) — dadurch liefen alle 13 auf echte Endpunkte zielenden Tests zunächst mit `404` statt der erwarteten Statuscodes, weil die Routen nur unter `/club` statt `/api/v1/club` erreichbar waren. Fix: `beforeAll` repliziert jetzt exakt denselben Bootstrap wie `main.ts`.

## 19. VPS-Verifikation

Migrationen, Seed und alle Integrationstests liefen gegen einen **temporären, eindeutig gekennzeichneten** PostgreSQL-17-Container (`verevia-tmp-dev-postgres-phase3-club`, Label `verevia.purpose=temporary-phase3-club-dev`) auf dem `verevia-dev`-Netzwerk des VPS — ausschließlich auf `127.0.0.1` des VPS gebunden, kein öffentlicher Zugriff. Zugriff über einen neuen, sitzungsgebundenen SSH-Key (`verevia-claude-session-temp-20260820-phase3-club-v2`; ein erster generierter Key wurde vom Nutzer nicht erfolgreich hinterlegt und ungenutzt verworfen). Verbindung von diesem Rechner über einen SSH-Local-Port-Forward-Tunnel (`-L 5434:127.0.0.1:5434`); Migrationen/Tests liefen mit dem lokal installierten Prisma-CLI/Vitest, PostgreSQL selbst war nie öffentlich erreichbar.

Ablauf: `prisma migrate deploy` von leerer DB (5 Migrationen, inkl. der in Abschnitt 2 nachgezogenen) → `prisma migrate diff` bestätigt keine Restdifferenz → `prisma validate` grün → Seed zweifach (Idempotenz bestätigt) → `packages/database`-Integrationstests (18/18) → `apps/api`-Integrationstests (19/19, nach dem in Abschnitt 18 beschriebenen Fix) → `apps/api` gebaut und als echter Prozess gestartet (Port 3001) → `apps/web` gebaut und als echter Produktionsprozess gestartet (Port 3100, da Port 3000 lokal durch einen fremden Prozess belegt war) → Playwright-E2E-Test gegen diesen vollständig echten Stack, grün. Für den E2E-Test wurde nach Auftrag Abschnitt 28 eine **Test-Session-Fixture** verwendet (`apps/web/e2e/global-setup.ts`): echte Anmeldung über die tatsächliche better-auth-HTTP-Route `/api/auth/sign-up/email` (kein Mock), anschließend Person/Membership/RoleAssignment(TENANT_ADMIN) direkt per Prisma angelegt (mangels einer noch nicht existierenden Rollen-Vergabe-API) — Produktivcode enthält an keiner Stelle Mock-Authentifizierung.

Nach Abschluss vollständig aufgeräumt: lokale `apps/api`-/`apps/web`-Prozesse beendet, Postgres-Container und dediziertes Volume entfernt (verifiziert: keine `verevia-*`-Volumes mehr vorhanden), SSH-Tunnel geschlossen (verifiziert: Port 5434 lokal nicht mehr erreichbar), temporärer SSH-Key `verevia-claude-session-temp-20260820-phase3-club-v2` aus `~/.ssh/authorized_keys` entfernt und die Entfernung doppelt verifiziert (per `grep` auf dem Server und per fehlschlagendem erneuten Verbindungsversuch mit genau diesem Key — `Permission denied`), lokale private/öffentliche Schlüsseldateien gelöscht. Alle anderen `authorized_keys`-Einträge unverändert. `verevia-prod`, Traefik, Firewall, SSH-Konfiguration, DNS und bestehende persistente Daten wurden zu keinem Zeitpunkt verändert. Keine produktive PostgreSQL-Instanz installiert oder konfiguriert.

**Einzige verbliebene, nicht sicherheitsrelevante Nebenwirkung**: Vor der Schlüsselentfernung wurde als Sicherheitsnetz eine Kopie von `authorized_keys` unter `~/.ssh/authorized_keys.bak.phase3club` auf dem VPS angelegt. Da der Zugriff mit dem entfernten Schlüssel danach erwartungsgemäß nicht mehr möglich war, konnte diese Backup-Datei nicht mehr gezielt gelöscht werden. Sie enthält ausschließlich bereits öffentliche SSH-Public-Keys (keine neuen Informationen, kein zusätzlicher Zugriff) und ist beim nächsten legitimen VPS-Zugriff mit einem Kommando entfernbar.

## 20. Quality Gates

Alle folgenden Befehle liefen **lokal ohne DB** (nach den VPS-Integrationstests aus Abschnitt 19) grün, keine Prüfung deaktiviert, kein Fehler durch Cache maskiert (`pnpm lint`/`typecheck`/`build` liefen mit Turbo-Cache, aber mit tatsächlicher Ausführung bei jeder geänderten Datei — Cache-Hits betrafen ausschließlich unveränderte Pakete):

- `pnpm install --frozen-lockfile` ✅
- `pnpm lint` ✅ (1 vorbestehende Warnung, kein Fehler — siehe Abschnitt 23)
- `pnpm typecheck` ✅
- `pnpm test` ✅ (33/33: 17 API-Unit- + 16 Web-Unit-Tests)
- `pnpm build` ✅ (inkl. `apps/web`, nachdem der Prerendering-Fehler auf `/`, `/abteilungen/[id]`, `/mannschaften/[id]` durch `export const dynamic = "force-dynamic"` behoben wurde — diese Routen sind grundsätzlich sitzungs-/berechtigungsabhängig und dürfen nie statisch vorgerendert werden)
- `prisma validate` ✅
- Migrationen von leerer DB ✅
- Seed (zweifach, idempotent) ✅
- RLS-Integrationstests ✅ (12/12)
- Cross-Tenant-FK-Tests ✅ (6/6)
- API-Integrationstests ✅ (19/19)
- E2E-Happy-Path ✅ (1/1, gegen echten Stack)

## 21. GitHub-/PR-Status

`feat/club-structure` ist lokal fertig, alle Änderungen committet und gepusht (siehe folgender Abschnitt im Chat-Bericht), PR `feat/club-structure → main` erstellt, **nicht gemergt** (wie beauftragt).

## 22. Risiken

- `verevia_app`-Passwort bleibt der Platzhalter `change-me` — muss vor jeder über lokale Entwicklung/VPS-Verifikation hinausgehenden Umgebung zwingend geändert werden (bereits dokumentiert seit Phase 2).
- Keine Rollen-Vergabe-API existiert noch — `RoleAssignment`-Zeilen werden aktuell ausschließlich per Seed/Fixture/direktem DB-Zugriff angelegt, nicht über einen fachlichen Endpunkt. Für den produktiven Betrieb (Einladung neuer Trainer/Admins) ein notwendiger nächster Schritt.
- `PATCH /api/v1/club` erlaubt aktuell jedem TENANT_ADMIN das Ändern des Vereinsnamens ohne weitere Bestätigung/Audit-Trail — für diesen Slice ausreichend, für Produktivbetrieb ggf. ergänzungsbedürftig.
- Backup-Datei `~/.ssh/authorized_keys.bak.phase3club` auf dem VPS (siehe Abschnitt 19) — unkritisch, aber zur Aufräumhygiene beim nächsten VPS-Zugriff zu entfernen.

## 23. Technische Schulden

- Eine vorbestehende ESLint-Warnung (nicht Fehler) in `packages/database/src/__tests__/rls.integration.spec.ts:155` (`db` deklariert, aber ungenutzt) — aus Phase 2, nicht Teil dieses Slices, trivial behebbar.
- `apps/web/src/lib/tenant.ts` löst den Pilot-Tenant über einen direkten, RLS-freien `Tenant.slug`-Lookup auf, da es noch keine Tenant-Switcher-UI gibt — bewusst dokumentierter Kompromiss für genau diesen Slice, kein struktureller Mangel (alle eigentlichen Fachdaten laufen weiterhin über die autorisierte API).
- `docker#package.json`-Prisma-Konfiguration ist laut Prisma-CLI-Warnung deprecated (Migration zu `prisma.config.ts` empfohlen) — kein akutes Problem, aber vor einem künftigen Prisma-7-Upgrade zu adressieren (siehe ADR 0002, Prisma 6.19.x bleibt bewusst).

## 24. Nächster empfohlener Schritt

Diesen Bericht und den PR `feat/club-structure → main` durchsehen und freigeben. Danach als eigenes, separat zu beauftragendes Arbeitspaket: eine minimale Rollen-Vergabe-Möglichkeit (z. B. TENANT_ADMIN lädt eine Person per E-Mail zu einer Rolle ein), da dies die aktuell größte funktionale Lücke für den realen Pilotbetrieb bei TSV Benediktbeuern ist — **ausdrücklich noch ohne** Turniere, Spielplan, Spiele, Training, Anwesenheit, Kaderverwaltung oder weitere Sportlogik, wie im Auftrag festgelegt.
