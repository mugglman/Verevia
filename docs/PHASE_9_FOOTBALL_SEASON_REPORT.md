# Phase 9 – Fußball-Grundstruktur und Saisonverwaltung

## 1. Phase-8-PR/Merge

PR #9 (`docs(deploy): record the real end-to-end CI/CD verification`) war grün (Install/Lint/Typecheck/Test/Build, alle `completed`/`success`), `mergeable_state: clean`, nur der erwartete Dokumentationsdatei-Diff (`docs/PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md`), 0 Secret-Scanning-Alerts. Per GitHub REST API gemergt (Squash), Merge-SHA `7b3c184`. `main` lokal aktualisiert, gemergte Branches lokal gelöscht.

## 2. Branch

`feat/football-season-foundation` von `main` (`7b3c184`) erstellt.

## 3. Sport-Modell

Kein vorhandenes Sport-/SportType-/DepartmentType-Konzept im Schema gefunden. Entscheidung: kleines, generisches `SportType`-**Enum** (`FOOTBALL`/`TENNIS`/`STOCK_SPORT`/`CYCLING`/`OTHER`, Default `OTHER`) als neues Feld `Department.sportType` — keine eigene Tabelle. Begründung: der Wertebereich ist klein und stabil (keine SaaS-weite Konfigurierbarkeit für "beliebige neue Sportarten" absehbar nötig); ein Enum ist die einfachere, ausreichende Lösung. `Department` bleibt bewusst sportneutral — `sportType` ist ein reiner Klassifizierer, keine fußballspezifischen Felder wurden direkt am Modell ergänzt.

## 4. Season-Modell

`Season` ist **sportneutral** implementiert und **`Department`-gebunden** (nicht `Team`-gebunden) — jede Abteilung, unabhängig von der Sportart, kann eine eigene Saisonstruktur haben. Felder: `id`, `tenantId`, `departmentId`, `name`, `startsAt`, `endsAt`, `status` (`SeasonStatus`: `PLANNED`/`ACTIVE`/`COMPLETED`), `createdAt`, `updatedAt`. Keine komplexe Lebenszyklus-Logik über die drei Status hinaus. `@@unique([departmentId, name])` verhindert doppelte Saisonnamen je Abteilung.

## 5. AgeGroup-Entscheidung

Explizite Entscheidung für **Option B: konfigurierbare Entität**, nicht Enum, nicht Hybrid. Begründung: ein hartcodiertes deutsches Jugend-Enum (G-/F-/E-/D-/C-/B-/A-Jugend) wäre die technische Grundlage für alle künftigen Vereine/Verbände/Länder/Erwachsenenkategorien — das widerspricht der geforderten Zukunftsoffenheit. `AgeGroup` ist tenant-weite Stammdatenverwaltung (`id`, `tenantId`, `name`, `sortOrder`), von `TENANT_ADMIN` verwaltbar, von jeder aktiven Rolle lesbar. `@@unique([tenantId, name])`.

## 6. TeamSeason-Modell

Name entschieden: `TeamSeason` (nicht `FootballTeamSeason`) — das Modell selbst ist strukturell sportneutral (verknüpft `Team`+`Season`+`AgeGroup`), die Fußball-Beschränkung ist eine anwendungsseitige Regel (siehe Abschnitt 10), keine strukturelle Eigenschaft des Modellnamens. Felder: `id`, `tenantId`, `teamId`, `seasonId`, `ageGroupId`, `displayName?`, `status` (`TeamSeasonStatus`: `ACTIVE`/`INACTIVE`), `createdAt`, `updatedAt`. `@@unique([teamId, seasonId])` — ein Team kann pro Saison höchstens einen Eintrag haben. `displayName` ist bewusst `NULL` im Normalfall (keine Duplizierung von `team.name`), nur bei Bedarf ein saisonabhängiger Anzeigename.

## 7. Team-vs-TeamSeason-Entscheidung

`Team` (z. B. "E1") bleibt die **dauerhafte, saisonübergreifende organisatorische Einheit** — kein jährliches Neuanlegen. Begründung: reale Vereine führen "E1" ebenfalls als dauerhaften Kaderplatz-Namen über Jahre hinweg, auch wenn sich Altersklasse und Spieler ändern; ein jährliches Neuanlegen hätte bedeutet, jede `RoleAssignment`/`TeamMember`-Zuordnung jährlich neu zu verknüpfen — Mehraufwand ohne fachlichen Vorteil. `TeamSeason` trägt die saisonspezifische Information (welche Altersklasse, welche Saison). Dokumentiert direkt im Schema-Kommentar am `TeamSeason`-Modell.

## 8. API

- `GET/GET:id/POST/PATCH /api/v1/seasons` (Filter `?departmentId=`), kein DELETE.
- `GET/POST/PATCH /api/v1/football/age-groups`, kein DELETE.
- `GET/GET:id/POST/PATCH /api/v1/football/team-seasons` (Filter `?seasonId=`/`?teamId=`/`?ageGroupId=`), kein DELETE.
- Kein separater `POST /seasons/:id/activate`-Endpunkt — Statuswechsel läuft über den bestehenden `PATCH`, ein eigener Endpunkt wäre hier keine Vereinfachung gewesen.
- `DepartmentListItemDto`/`DepartmentDetailDto` um `sportType` ergänzt (kleine, notwendige Erweiterung — ohne dieses Feld hätte weder das Web-Frontend noch ein Konsument der API die Fußballabteilung generisch finden können, ohne den Abteilungsnamen zu hardcoden).

## 9. Authorization

Bestehendes System wiederverwendet, **keine neuen Rollen**. Neue Methode `canOnSeason` (bewusst nicht `canOnDepartment` wiederverwendet, da Department-`create` TENANT_ADMIN-only ist, Season-`create`/`update` aber zusätzlich dem `DEPARTMENT_ADMIN` der jeweiligen Abteilung erlaubt sein muss — ein Kind-Ressourcen-Fall, kein Abteilungs-Fall). TeamSeason nutzt direkt die bestehende `canOnTeam`-Methode (keine neue Methode — Semantik ist identisch: TENANT_ADMIN immer, DEPARTMENT_ADMIN der Team-Abteilung für create/update, TEAM-Scope wie COACH nur lesend für das eigene Team). `canManageAgeGroups` (TENANT_ADMIN-only) und `canReadAgeGroups` (jede aktive Rolle) neu. Rollenmatrix wie im Auftrag: TENANT_ADMIN alles; DEPARTMENT_ADMIN Fußball liest/erstellt/bearbeitet Season+TeamSeason der eigenen Abteilung, nicht fremder Abteilungen; COACH liest aktive Season und eigenes TeamSeason, kann keines von beidem bearbeiten.

## 10. Cross-Tenant-Absicherung

Alle neuen Modelle sind tenant-pur mit zusammengesetzten Fremdschlüsseln nach dem etablierten Muster: `season` → `tenant`/`department` je über `(tenantId, X)` → `(tenantId, id)`; `age_group` → `tenant`; `team_season` → `tenant`/`team`/`season`/`age_group` alle über `(tenantId, X)`. Verifiziert durch dedizierte negative Tests (Abschnitt 16). **Bewusst nicht DB-seitig erzwungen**: dass das `Team` eines `TeamSeason` zu einer `FOOTBALL`-Abteilung gehört — ein Trigger, der über `team` auf `department` cross-referenziert, wurde als unverhältnismäßiger Aufwand für diese Phase bewertet (der Auftrag selbst erlaubt das mit "sofern DB-seitig sinnvoll möglich"). Stattdessen anwendungsseitig in `TeamSeasonsService.create()` geprüft (lädt Team → Department → prüft `sportType === "FOOTBALL"`, sonst `BadRequestException`) und durch einen dedizierten Test abgesichert (DB-Ebene: `packages/database/src/__tests__/football-season.integration.spec.ts`; API-Ebene: `apps/api/test/football-season.integration-spec.ts`, Test "rejects a team season for a non-football (Tennis) team").

## 11. RLS

Alle drei neuen Tabellen (`season`, `age_group`, `team_season`) haben `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + vier fail-closed Policies (SELECT/INSERT/UPDATE/DELETE), exakt nach dem etablierten Muster aus `20260817150231_add_rls_and_scope_constraint`. **Zusätzlich, wie im Auftrag explizit gefordert**: die in Phase 4 gefundene technische Schuld (hartcodierte `TENANT_SCOPED_MODELS`-Liste in `packages/database/src/tenant-prisma.ts`, siehe `PHASE_4_TEAM_MEMBERSHIP_REPORT.md` Abschnitt "Technische Schulden") wurde in dieser Phase behoben: die Liste wird jetzt **automatisch aus Prisma's DMMF abgeleitet** (jedes Modell mit einem `tenantId`-Feld, minus einer kleinen, dokumentierten Ausnahmeliste `TENANT_SCOPE_EXCLUSIONS = ["AccountInvitation"]`). Verifiziert per direktem Node-Skript und einer neuen Unit-Test-Suite (`packages/database/src/__tests__/tenant-scoped-models.spec.ts`, 5 Tests) — liefert exakt die erwarteten 9 Modelle (inkl. der drei neuen: `Season`, `AgeGroup`, `TeamSeason`) und schließt korrekt `AccountInvitation` sowie alle Identitätsschicht-Modelle ohne `tenantId` aus. Neue tenant-gebundene Modelle erfordern damit **keine manuelle Änderung** an `tenant-prisma.ts` mehr — die Korrektheit ist jetzt eine strukturelle Eigenschaft des Schemas, nicht mehr Handpflege. Dies war zugleich der Anlass, `packages/database` erstmals eine echte (DB-unabhängige) Unit-Test-Infrastruktur zu geben (`vitest.config.mts`, `"test": "prisma generate && vitest run"` statt des bisherigen Platzhalter-Skripts).

## 12. Constraints

`startsAt < endsAt` als DB-`CHECK`-Constraint auf `season` **und** applikationsseitig (`SeasonsService.assertValidDateRange`, `BadRequestException` bei Verletzung) — doppelt geprüft, DB als letzte Instanz. Überlappende Saisons werden **nicht** verboten (weder PLANNED/ACTIVE-Übergänge noch generell) — eine geplante Folgesaison kann sich mit der laufenden aktiven Saison zeitlich überschneiden, das ist ein legitimer, realer Vereinsablauf (Planung der nächsten Saison beginnt oft vor Ende der aktuellen). Einzige Uniqueness-Einschränkung ist die ACTIVE-Beschränkung (Abschnitt 13).

## 13. Aktive Saison

Höchstens eine `ACTIVE`-Saison je `Department` gleichzeitig, **DB-seitig erzwungen** über einen partiellen Unique-Index (`CREATE UNIQUE INDEX season_active_department_key ON season (departmentId) WHERE status = 'ACTIVE'`) — nicht nur applikationsseitig geprüft. Ein `POST`/`PATCH`-Versuch, eine zweite ACTIVE-Saison für dieselbe Abteilung anzulegen, schlägt mit `P2002` fehl und wird von `SeasonsService` in eine `409 ConflictException` übersetzt.

## 14. Web-UI

Neue Route `/fussball` (Fußball-Übersicht: aktive Saison, Mannschaften mit Altersklasse) und `/fussball/saisons` (Saisonverwaltung: Liste, Anlegen, Bearbeiten inkl. Status — nur sichtbar/nutzbar mit Berechtigung, serverseitig über `department.canEdit` bestimmt, das exakt derselben Formel wie `canOnSeason`-create/update entspricht). Ein neuer, immer sichtbarer Nav-Eintrag "Fußball" (konsistent mit der bestehenden Nav-Konvention: Links werden nicht versteckt, die Zielseite selbst entscheidet über Zugriff/leeren Zustand). Ausschließlich deutsche Fachbegriffe ("Saison", "Altersklasse", "Mannschaft", "Fußball") — keine technischen Begriffe wie "TeamSeason"/"AgeGroup ID"/"Department ID"/"Tenant" im UI-Text. Mobile-first, Karten-/Listen-Layout (kein `<table>`), identisch zum bestehenden Muster (`grid grid-cols-1 sm:grid-cols-2`). Kollisionsfund und -behebung: da die Nav jetzt ebenfalls einen Link "Fußball" hat und die Abteilung selbst (Seed) auch "Fußball" heißt, mussten drei bestehende E2E-Tests (`club-structure.spec.ts`, `team-membership.spec.ts`) auf `<main>`-scoped Selektoren umgestellt werden, um die Mehrdeutigkeit aufzulösen.

## 15. Seed

Erweitert um: `Department.sportType = FOOTBALL` (bestehende Abteilung "Fußball"), Saison "2026/2027" (`ACTIVE`), Altersklasse "E-Jugend", `TeamSeason`-Zuordnungen für E1 und E2. Vollständig idempotent (`upsert`/`findFirst`-vor-`create`-Muster wie der Rest des Seed-Skripts) — zweifacher Lauf lokal verifiziert (kein Fehler, keine Duplikate).

## 16. Tests

- **DB-Integrationstests** (`packages/database/src/__tests__/football-season.integration.spec.ts`, neu): Cross-Tenant Season↔Department, Cross-Tenant TeamSeason↔Team/Season/AgeGroup, Datumsbereichs-CHECK, zweite-ACTIVE-Saison-Ablehnung, `@@unique([teamId, seasonId])`-Ablehnung, RLS fail-closed ohne Tenant-Kontext (Season/AgeGroup/TeamSeason), Tenant-Isolation, AgeGroup-Eindeutigkeit je Tenant.
- **API-Integrationstests** (`apps/api/test/football-season.integration-spec.ts`, neu): 401 ohne Session, 403 ohne Mitgliedschaft, TENANT_ADMIN/DEPARTMENT_ADMIN-Fußball/COACH-Rollenmatrix für Season (create/update/read, inkl. expliziter Ablehnung DEPARTMENT_ADMIN-Fußball → Tennis-Saison), Datumsvalidierung, zweite-ACTIVE-Ablehnung (409), AgeGroups-Rollenprüfung (Lesen für jede Rolle, Anlegen nur TENANT_ADMIN), TeamSeason inkl. Fußball-only-Guardrail (400 bei Tennis-Team) und COACH-E1-vs-E2-Isolation.
- **Web-Unit-Tests** (`football-overview.test.tsx`, `season-management.test.tsx`, neu, 15 Tests): aktive Saison sichtbar, Mannschaften mit Altersklasse, leerer Zustand (keine Fußballabteilung/keine aktive Saison/keine Mannschaften/keine Saisons), berechtigungsabhängige Anzeige von Bearbeiten-/Anlegen-Formularen.
- **E2E** (`apps/web/e2e/football-season.spec.ts`, neu): Login DEV-Admin (bestehendes TENANT_ADMIN-Fixture) → Verein → Fußball (Nav) → Saison 2026/2027 sichtbar → E1/E2 mit Altersklasse E-Jugend sichtbar → Saisons verwalten → neue Saison anlegen → bearbeiten; zusätzlich COACH-E1-Unterfall (liest aktive Saison und eigenes Team, keine Saisonverwaltung sichtbar/nutzbar). Kein eigenes DEPARTMENT_ADMIN-E2E-Fixture ergänzt — das bestehende `global-setup.ts` stellt nur TENANT_ADMIN und COACH bereit; die DEPARTMENT_ADMIN-Rollenlogik ist bereits vollständig durch die API-Integrationstests (Abschnitt 16, zweiter Punkt) abgedeckt.

## 17. CI

Lokale Quality Gates vollständig grün: `pnpm install --frozen-lockfile`, `pnpm lint` (7 Pakete), `pnpm typecheck` (7 Pakete), `pnpm test` (alle DB-unabhängigen Unit-Tests: 5 + 52 + 61 = 118 Tests grün), `pnpm build` (inkl. `next build` mit den neuen Routen `/fussball`, `/fussball/saisons`), `prisma validate`. Die DB-abhängigen Integrations-/E2E-Suiten (`pnpm test:integration`, `pnpm test:e2e`) sind **noch nicht real gegen PostgreSQL gelaufen** — siehe Abschnitt 18.

## 18. DEV-Deployment-Status

**Noch nicht durchgeführt.** Für die reale Verifikation (Migration aus leerer PostgreSQL-17-Datenbank, Schema-Drift-Prüfung, doppelter Seed-Lauf, DB-/API-Integrationstests, volle E2E-Suite) wurde ein sitzungsgebundener, temporärer SSH-Key generiert und der Public Key dem Nutzer zur manuellen Hinterlegung vorgelegt (siehe Chat) — gemäß Auftrag Abschnitt 23 ausdrücklich ein Punkt, an dem auf eine manuelle Nutzeraktion gewartet wird, keine Umgehung. Sobald hinterlegt, wird ein temporärer, eindeutig gekennzeichneter PostgreSQL-17-Container auf dem VPS gestartet (nur an `127.0.0.1` gebunden), per SSH-Tunnel lokal erreichbar gemacht, alle Migrationen (inkl. der neuen `20260823120000_add_football_season_foundation`) aus leerer DB angewendet, Schema-Drift geprüft, Seed zweimal ausgeführt, die Integrations-/E2E-Suiten real ausgeführt, und danach vollständig aufgeräumt (Container/Volume entfernt, Tunnel geschlossen, temporärer Key aus `authorized_keys` entfernt und die Entfernung verifiziert). Erst danach PR-Erstellung und Merge-Freigabe im Chat — dieser Bericht wird nach Abschluss um die realen Ergebnisse ergänzt bzw. per Folgenachricht mitgeteilt.

## 19. Risiken

- Ohne die reale VPS-Verifikation (Abschnitt 18) ist die neue Migration bisher nur syntaktisch (`prisma validate`, statischer Diff), nicht gegen eine echte leere PostgreSQL-17-Instanz getestet — geringes, aber reales Restrisiko eines Migrationsfehlers, der erst dort sichtbar würde.
- Die Fußball-only-Prüfung für `TeamSeason` ist anwendungsseitig, nicht DB-seitig — ein direkter DB-Zugriff außerhalb der API (z. B. ein künftiges Batch-Skript) könnte diese Regel umgehen, wenn es nicht ebenfalls die Prüfung implementiert. Dokumentiert im Schema-Kommentar, damit dies bei künftigen direkten DB-Zugriffen nicht übersehen wird.
- `TeamMember` bleibt nicht saisonhistorisch (Abschnitt "Team vs. TeamSeason" in `Database.md`) — für reine Saison-/Altersklassenverwaltung kein Blocker, wird aber vor echten spielerbezogenen Statistiken über mehrere Saisons hinweg relevant.

## 20. Technische Schulden

- Behoben in dieser Phase: die hartcodierte `TENANT_SCOPED_MODELS`-Liste (siehe Abschnitt 11) — kein offener Posten mehr.
- Neu, bewusst in Kauf genommen (siehe Abschnitt 10/19): die Fußball-only-Prüfung für `TeamSeason` ist anwendungsseitig statt DB-seitig (Trigger). Für ein künftiges Arbeitspaket, falls direkte DB-Zugriffe außerhalb der API entstehen.
- `TeamMember` ohne Saisonhistorie (siehe Abschnitt 19) — bewusst zurückgestellt, bis echte spielerbezogene Auswertungen über mehrere Saisons anstehen.

## 21. Nächster Schritt

Reale VPS-Verifikation (Abschnitt 18) abschließen, sobald der Public Key hinterlegt ist, danach `feat/football-season-foundation` committen/pushen und einen PR (`feat(football): add season and team season foundation`) erstellen — **ohne Auto-Merge**, wie in jeder vorherigen Phase. Ausdrücklich weiterhin **nicht** Teil dieser Phase: Turnierplaner, Spiele, Training, Anwesenheit, Termine, Spielgemeinschaften, Tabellen/Liga, Verbandsschnittstellen, Kaderhistorie.
