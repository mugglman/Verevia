# Phase 2 — Core-Datenmodell-Bericht

> Status: Abschlussbericht. Baut auf [PHASE_1_BASELINE_REPORT.md](./PHASE_1_BASELINE_REPORT.md) (BASELINE READY) auf. Implementiert das technische Core-Datenmodell für Multi-Tenancy/Identity/RBAC — **keine** fachliche Oberfläche, kein Fußball/Turnier-Feature.
>
> Erstellt: 2026-08-17.

## 1. Git-/Branch-Ausgangslage

- Ausgangszustand: Branch `chore/initial-project-setup`, 3 Commits vor `main` (2 aus der Baseline-Sitzung + 1 neuer Fix in diesem Arbeitspaket), `origin` aktuell.
- `gh` (GitHub CLI) war zu Beginn nicht installiert — auf explizite Anweisung wurde es via Homebrew installiert und über das bereits in `git`s Credential-Helper (`osxkeychain`) hinterlegte Token authentifiziert, um selbstständig auf GitHub zuzugreifen (PR erstellen/mergen), statt nur manuelle Schritte zu liefern.

## 2. PR-/Merge-Status Phase 1

1. PR [#1](https://github.com/mugglman/Verevia/pull/1) `chore/initial-project-setup` → `main` erstellt.
2. CI schlug zunächst am `markdown-lint`-Check fehl (26 Verstöße, ausschließlich in den in den vorangegangenen Sitzungen neu erstellten Dateien: fehlende Sprachangabe an Codeblöcken, fehlende Leerzeilen um Listen, eine Fettschrift-als-Überschrift-Stelle) — behoben (Commit `8686859`), CI danach vollständig grün.
3. Merge-Bedingungen geprüft: sauberer Working Tree, CI grün, `mergeable_state: clean`, keine Konflikte, keine Secrets — erfüllt.
4. Gemerged (Merge-Commit, kein Squash/Rebase, kein Force-Push) → `main` bei `74f98fa`.
5. Lokal `main` aktualisiert (Fast-Forward), `feat/core-data-model` von diesem `main` abgezweigt.

## 3. Implementierte Entities

`Tenant`, `Department`, `Team`, `Person`, `User`/`Session`/`Account`/`Verification` (better-auth-eigen, um `User.status` erweitert), `Membership`, `RoleAssignment`, `PlatformRoleAssignment`, `PersonRelationship` — alle neun aus dem Auftrag geforderten Entities. Noch nicht enthalten (bewusst, eigenes fachliches Arbeitspaket): `Season`, `Event`, `Attendance`, `Task`, `Tournament`, `TournamentTeam`, `Match`, `Venue`, `Notification`, `AuditLog`, `JointTeam`.

## 4. Finales Prisma-Schema

`packages/database/prisma/schema.prisma`. Enums: `TenantStatus`, `UserStatus`, `MembershipStatus`, `Role` (fester Katalog, siehe Abschnitt 9), `PlatformRole`, `ScopeType`, `RelationshipType`, `RelationshipStatus` — exakt die im Auftrag geforderte Liste, keine vorsorglichen Zusatzwerte.

IDs: `String @id @default(uuid())` durchgängig (UUID v4) — bereits in `ARCHITEKTUR_FINALISIERUNG.md`/`AUTH_IDENTITY_RBAC_ARCHITEKTUR.md` konsistent so verwendet (Notation `id uuid` in allen dortigen Modellskizzen), hier ohne neue Grundsatzdiskussion übernommen. UUIDs sind nicht fortlaufend erratbar, geeignet für einen SaaS-Kontext mit potenziell vielen Mandanten.

Drei Migrationen (siehe Abschnitt 14).

## 5. Auth-/User-Integration

better-auth ist in `apps/api/src/main.ts` gemountet — exakt nach dem im Phase-1-Spike verifizierten Muster (`bodyParser: false`, Mount auf der rohen Express-Instanz **vor** erneuter Body-Parser-Aktivierung, Express-5-Wildcard `{*splat}`). `packages/auth/src/index.ts` erweitert das better-auth-eigene `User`-Modell um `status` (`UserStatus`-Enum, per `user.additionalFields`) — **keine parallele, inkompatible User-Struktur**, sondern dieselbe von better-auth generierte Tabelle, ergänzt.

Real end-to-end verifiziert: kompilierter `apps/api`-Build gestartet, `POST /api/auth/sign-up/email` liefert `200` mit gültigem Session-Cookie (siehe Abschnitt 18).

## 6. Tenant-Modell

`Tenant` (id, name, slug **unique**, status, timestamps) — SaaS-Mandantengrenze, für den MVP 1:1 ein Verein. **Keine RLS-Policy auf `Tenant` selbst** (bewusst, siehe `schema.prisma`-Kommentar): der Tenant ist die Wurzel der Mandantenhierarchie, nicht durch seine eigene `tenant_id` gefiltert; Zugriff (Slug-Lookup beim Login, "meine Vereine" über `Membership`→`Person`) erfolgt applikationsseitig.

## 7. Identity-Modell

`User` (global, Login) ↔ `Membership` (reine Verknüpfung, **kein** Rollenträger, `@@unique([personId])` erzwingt "eine Person hat höchstens einen Login") ↔ `Person` (mandantenbezogen, existiert unabhängig von einem `User`). Exakt das in `AUTH_IDENTITY_RBAC_ARCHITEKTUR.md` (ADR 0003) beschriebene Modell, ohne Abweichung.

## 8. RoleAssignment

Wie in ADR 0004 vorgegeben: `tenantId`, `personId`, `role` (Enum, **kein** `roleId` auf eine dynamische Tabelle — siehe Abschnitt 9), `scopeType`, `departmentId?`, `teamId?`. **Keine polymorphe generische `scopeId`** — scope-spezifische, echte Fremdschlüssel. `departmentId` wird bei `TEAM`-Scope **nicht** redundant gespeichert (bleibt über `Team → Department` ableitbar), wie in `ARCHITEKTUR_FINALISIERUNG.md` Abschnitt 4 entschieden.

## 9. PersonRelationship

Gerichtete Beziehung (`fromPersonId` → `toPersonId`), Typen `PARENT`/`LEGAL_GUARDIAN`/`EMERGENCY_CONTACT`, `status` (`PENDING`/`VERIFIED`/`REVOKED`) zusätzlich zum bereits vorgesehenen `verifiedByPersonId`, `isLegalGuardian`, `validFrom`/`validUntil`. `@@unique([fromPersonId, toPersonId, type])` verhindert exakte Duplikate. **Keine RBAC-Rolle** — vollständig getrennt von `RoleAssignment`, wie in ADR 0005 festgelegt.

## 10. Constraints

- **CHECK-Constraint** (`role_assignment_scope_consistency`, manuelle SQL-Migration, da Prisma 6 mehrspaltige CHECK-Constraints nicht deklarativ unterstützt): `TENANT` ⇒ `departmentId`/`teamId` NULL; `DEPARTMENT` ⇒ `departmentId` gesetzt, `teamId` NULL; `TEAM` ⇒ `teamId` gesetzt. Per Integrationstest verifiziert (Abschnitt 16).
- **Foreign Keys**: durchgängig scope-spezifische, echte FKs statt polymorpher Referenzen.
- **onDelete-Verhalten**: bewusst **kein pauschales CASCADE**. `Restrict` als Standard für alle Beziehungen, die Person-/Mitgliedsdaten oder die Organisationsstruktur betreffen (`Tenant→Department`, `Department→Team`, `Tenant→Person`, `User/Person→Membership`, `Person→RoleAssignment`, `Person→PersonRelationship` als `fromPerson`/`toPerson`) — löschen erfordert explizite, absichtliche Aufräumreihenfolge, kein stilles Mitlöschen. `SetNull` nur für rein informative, nicht-blockierende Zuordnungen (`RoleAssignment.grantedByPersonId`, `PersonRelationship.verifiedByPersonId`). `Cascade` nur dort, wo die Kind-Zeile ohne die Eltern-Zeile bedeutungslos und nicht sensibel ist (better-auth `Session`/`Account` → `User`; `PlatformRoleAssignment` → `User`).
- **Unique Constraints**: `User.email`, `Tenant.slug`, `Department(tenantId, name)`, `Team(departmentId, name)`, `Membership.personId`, `PlatformRoleAssignment(userId, role)`, `PersonRelationship(fromPersonId, toPersonId, type)`.

**Bekannte Lücke (Risiko, siehe Abschnitt 21):** kein DB-seitiger Constraint verhindert, dass ein `RoleAssignment.departmentId`/`.teamId` auf ein Department/Team eines **anderen** Tenants zeigt als `RoleAssignment.tenantId` — Postgres-CHECK-Constraints können keine Cross-Table-Lookups; das erfordert einen Trigger oder applikationsseitige Validierung (in `TenantPrismaService`/späteren Domain-Services nachzuziehen).

## 11. Indizes

`@@index([tenantId])` auf allen tenant-partitionierten Tabellen (`Department`, `Team`, `Person`, `RoleAssignment`, `PersonRelationship`), zusätzlich `@@index([personId])`/`@@index([departmentId])`/`@@index([teamId])` auf `RoleAssignment`, `@@index([fromPersonId])`/`@@index([toPersonId])` auf `PersonRelationship`, `@@index([userId])` auf `Membership`/`Session`/`Account`.

## 12. RLS-Implementierung

**Kritischer, während der Umsetzung gefundener Befund** (siehe auch Abschnitt 19): Die über `POSTGRES_USER` im offiziellen `postgres`-Docker-Image angelegte Rolle ist automatisch **PostgreSQL-Superuser**. Superuser umgehen Row-Level-Security **immer**, unabhängig von `FORCE ROW LEVEL SECURITY` — ohne Gegenmaßnahme wäre die gesamte RLS-Implementierung wirkungslos gewesen, obwohl alle Policies korrekt definiert sind.

**Lösung:** dedizierte, nicht-privilegierte Rolle `verevia_app` (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`), angelegt durch die Migration `add_non_superuser_app_role`. Migrationen laufen weiterhin über die Superuser-Rolle; die Anwendung (und alle Tests) verbinden ausschließlich über `verevia_app`. Diese Trennung gilt für jede Umgebung (lokal wie VPS) gleichermaßen und ist in `docs/architecture/Multi-Tenancy.md` und `.env.example` dokumentiert.

RLS aktiv auf: `department`, `team`, `person`, `role_assignment`, `person_relationship` (`ENABLE` + `FORCE ROW LEVEL SECURITY`, je vier Policies für SELECT/INSERT/UPDATE/DELETE). Fail-closed: `USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), ''))` — fehlt der Kontext, ist die Bedingung nie wahr, es werden keine Zeilen sichtbar. **Keine** RLS auf `tenant` (siehe Abschnitt 6) und der globalen Identitätsebene (`user`, `session`, `account`, `verification`, `platform_role_assignment`).

## 13. TenantPrismaService

Implementiert als `getTenantPrisma(tenantId: string): PrismaClient` in `packages/database/src/tenant-prisma.ts` — **abweichend von der ursprünglich in `ARCHITEKTUR_FINALISIERUNG.md` skizzierten Variante**, mit konkreter, dokumentierter Begründung (siehe Abschnitt 19, Punkt 3): eine erste Implementierung las den Tenant-Kontext per `AsyncLocalStorage` **innerhalb** des Prisma-Extension-Callbacks (`$allOperations`) — das funktionierte nicht zuverlässig, da Prismas Query-Engine-Dispatch die `AsyncLocalStorage`-Kontinuität in diesen Callback nicht verlässlich weiterreicht (empirisch verifiziert). Die finale, funktionierende Lösung nimmt `tenantId` als Funktionsparameter (Closure) entgegen, statt sie zur Laufzeit erneut aus dem Async-Kontext zu lesen.

`AsyncLocalStorage` (`runWithTenantContext`/`getTenantContext`) bleibt das richtige Werkzeug für die Tenant-Kontext-Weitergabe durch normalen Anwendungscode (z. B. den `TenantContextInterceptor`, der den validierten Tenant für die Dauer des Requests hält und daraus `getTenantPrisma(tenantId)` ableitet) — nur nicht für die Prisma-interne Extension selbst.

Jede Operation auf einem tenant-gebundenen Modell läuft in einer einzelnen Prisma-Interactive-Transaction, die zuerst `set_config('app.tenant_id', …, true)` setzt und dann die eigentliche Operation über **denselben** Transaktions-Client (`tx`) ausführt — garantiert dieselbe Datenbankverbindung für beide Schritte. Fehlt `tenantId`, wird sofort geworfen (Fail-loud im Code, zusätzlich zum Fail-closed in der Datenbank).

Der `TenantContextInterceptor` (`apps/api/src/tenant/tenant-context.interceptor.ts`) implementiert den geforderten Ablauf `Request → Tenant validieren (X-Tenant-Id-Header, Platzhalter bis zur Subdomain-Auflösung) → Session via better-auth → Membership prüfen → AsyncLocalStorage → Domain Query`. Noch an keinen fachlichen Controller angeschlossen (keine fachliche Oberfläche vorhanden), aber vollständig implementiert und per Integrationstest verifiziert (Abschnitt 16).

## 14. Migrationen

Drei Development-Migrationen in `packages/database/prisma/migrations/`:

1. `20260817150212_init_core_data_model` — Prisma-generiertes Schema (alle Tabellen).
2. `20260817150231_add_rls_and_scope_constraint` — manuelle SQL-Erweiterung: CHECK-Constraint + RLS-Policies (siehe Abschnitt 10/12).
3. `20260817150935_add_non_superuser_app_role` — manuelle SQL-Erweiterung: `verevia_app`-Rolle + Grants (siehe Abschnitt 12).

Alle drei gegen eine echte, isolierte PostgreSQL-17-Instanz erstellt und angewendet (Abschnitt 17). Keine Production-Migration durchgeführt. Reproduzierbar: dieselben drei Migrationen laufen unverändert gegen die lokale Docker-Compose-Postgres.

## 15. Seeds

`packages/database/prisma/seed.ts` (`pnpm --filter @verevia/database db:seed`, per `prisma.seed`-Konfiguration auch über `prisma db seed` aufrufbar): Tenant "TSV Benediktbeuern", Department "Fußball", zwei rein fiktive Demo-Personen ("Max Mustermann", "Erika Musterfrau" — keine echten Personendaten, keine Daten realer Vereinsmitglieder oder des Kindes des Auftraggebers). Idempotent (`upsert` für Tenant/Department, Existenzprüfung für Personen) — zweifacher Testlauf verifiziert, keine Duplikate. Nutzt bewusst denselben Code-Pfad (`getTenantPrisma`) wie eine echte Anwendung, keine Admin-Bypass-Abkürzung.

## 16. RLS-Testfälle

**12 von 12 Tests grün** in `packages/database/src/__tests__/rls.integration.spec.ts` (`pnpm --filter @verevia/database test:integration`), gegen eine echte, isolierte PostgreSQL-17-Instanz über die nicht-privilegierte `verevia_app`-Rolle:

- Tenant A sieht Person A ✅ / sieht Person B **nicht** ✅
- Tenant B sieht Person B ✅ / sieht Person A **nicht** ✅
- `findMany()` liefert für Tenant A ausschließlich Tenant-A-Zeilen ✅
- Ohne Tenant-Kontext: keine tenantgebundenen Zeilen sichtbar (0 von 2 erwarteten) ✅
- INSERT mit falscher `tenantId` (abweichend vom aktiven Kontext) schlägt fehl ✅
- UPDATE cross-tenant schlägt fehl, Zieldatensatz unverändert (verifiziert durch erneutes Lesen über den Ziel-Tenant) ✅
- DELETE cross-tenant schlägt fehl, Zieldatensatz existiert weiterhin ✅
- CHECK-Constraint: `TEAM`-Scope ohne `teamId` abgelehnt ✅ / `TENANT`-Scope mit gesetztem `departmentId` abgelehnt (roher SQL-Insert) ✅ / gültige `TENANT`-Scope-Zuweisung akzeptiert ✅

Zusätzlich **4 von 4 Tests grün** in `apps/api/test/tenant-context.integration-spec.ts` (End-to-End über echten better-auth-Signup + echte HTTP-Requests via Supertest): fehlender `X-Tenant-Id`-Header → 403; fehlendes Session-Cookie → 401; gültige Session ohne Membership im angefragten Tenant → 403; gültige Session **mit** aktiver Membership → 200.

Diese Tests prüfen die **echte PostgreSQL-RLS-Schutzschicht** (nicht nur Prisma-`where`-Filter) — bestätigt insbesondere durch den in Abschnitt 12/19 beschriebenen Superuser-Fund, der beim ersten Testlauf durchfiel (beide Tenants sahen beide Personen), bevor die Rollentrennung eingeführt wurde.

## 17. VPS-Verifikation

Migrationen, Seed und alle Integrationstests liefen gegen einen **temporären, eindeutig gekennzeichneten** PostgreSQL-17-Container (`verevia-tmp-dev-postgres`, Labels `verevia.purpose=temporary-phase2-dev`) auf dem `verevia-dev`-Netzwerk des VPS — nicht lokal, da hier kein Docker verfügbar ist (siehe [PHASE_1_BASELINE_REPORT.md](./PHASE_1_BASELINE_REPORT.md)). Zugriff über einen neuen, sitzungsgebundenen SSH-Key (Host-Key erneut von dir bestätigt, Key von dir manuell hinterlegt). Der Postgres-Container war **ausschließlich auf `127.0.0.1` des VPS gebunden** (kein `0.0.0.0`, kein öffentlicher Zugriff); die eigentliche Verbindung von diesem Rechner erfolgte über einen SSH-Local-Port-Forward-Tunnel (`-L 5433:127.0.0.1:5432`), sodass Migrationen/Tests mit dem lokal installierten Prisma-CLI/Vitest liefen, während PostgreSQL selbst nie öffentlich erreichbar war.

Nach Abschluss vollständig aufgeräumt: Container gestoppt und entfernt, dediziertes Volume entfernt, SSH-Tunnel geschlossen, temporärer SSH-Key aus `~/.ssh/authorized_keys` entfernt (verifiziert durch fehlschlagenden Verbindungsversuch) und lokal gelöscht. `verevia-prod`, Traefik, Firewall, SSH-Konfiguration, DNS und bestehende persistente Daten wurden zu keinem Zeitpunkt verändert. Keine produktive PostgreSQL-Instanz installiert oder konfiguriert.

## 18. Quality Gates

Aus vollständig bereinigtem Zustand (kein Turbo-Cache, keine `dist/`/`.next/`, keine `.tsbuildinfo`):

| Prüfung | Ergebnis |
|---|---|
| `pnpm lint` | ✅ 8/8 Pakete |
| `pnpm typecheck` | ✅ 8/8 Pakete |
| `pnpm test` (ohne DB) | ✅ alle grün, keine Regression |
| `pnpm build` | ✅ alle Pakete, vollständige Outputs verifiziert |
| `prisma validate` | ✅ |
| Migrationstest (`migrate dev` gegen echtes Postgres) | ✅ (Abschnitt 14) |
| Seed-Test | ✅, idempotent (Abschnitt 15) |
| RLS-Integrationstests | ✅ 12/12 + 4/4 (Abschnitt 16) |

Zusätzlich manuell verifiziert: kompilierter `apps/api`-Build bootet mit echter DB-Verbindung, `GET /health` → `{"status":"ok"}`, `GET /health/ready` → `{"status":"ok","database":"ok"}`, `POST /api/auth/sign-up/email` → `200` mit gültigem Session-Cookie. Keine Prüfung deaktiviert oder umgangen.

## 19. Gefundene Probleme

1. **PostgreSQL-Superuser umgeht RLS** (Abschnitt 12) — schwerwiegendster Fund, da er RLS beim ersten Testlauf vollständig wirkungslos machte, ohne dass Policies/Migration selbst fehlerhaft waren. Behoben durch dedizierte `verevia_app`-Rolle.
2. **Zirkulärer Import** zwischen `index.ts` und `tenant-prisma.ts` (beide importierten `prisma` übereinander) führte zu `ReferenceError: Cannot access 'prisma' before initialization`. Behoben durch Auslagerung des Singletons in ein eigenes `client.ts`.
3. **`AsyncLocalStorage` nicht verlässlich innerhalb von Prisma-Extension-Callbacks** — führte dazu, dass `getTenantContext()` innerhalb von `$allOperations` konsequent `undefined` lieferte, obwohl der Kontext eine Ebene höher nachweislich gesetzt war. Behoben durch Closure-Parameter statt erneutem Async-Kontext-Lookup (Abschnitt 13).
4. **RLS-geschützte Relation in einer Nicht-RLS-Abfrage unsichtbar**: Die Membership-Validierung im `TenantContextInterceptor` joint von `Membership` (nicht RLS-geschützt) auf `Person` (RLS-geschützt) — ohne vorher `app.tenant_id` zu setzen, war die verknüpfte `Person`-Zeile für die Abfrage unsichtbar, jede sonst legitime Anfrage wurde mit 403 abgelehnt. Behoben, indem diese Validierungs-Abfrage selbst in einer kleinen Transaktion mit vorherigem `set_config` auf den **behaupteten** Tenant läuft (sicher, da nur die Behauptung geprüft, keine Berechtigung vorab gewährt wird).
5. **TS2742-Portabilitätsfehler** beim Deklarations-Export von `getTenantPrisma` (inferred type referenziert einen pnpm-Store-internen Pfad). Behoben durch explizite Rückgabetyp-Annotation `PrismaClient`.
6. **`tsc -p tsconfig.json` kompilierte Testdateien mit in den Build**, da `packages/database` (anders als `apps/api`) noch keine separate `tsconfig.build.json` hatte. Behoben nach demselben, bereits in Phase 1 etablierten Muster.
7. Kleinere Versions-/Konfigurationskorrekturen (fehlende `@types/express`, `express` als explizite Dependency in `apps/api`).

## 20. Technische Schulden

- ~~Kein Cross-Tenant-Referenzintegritäts-Check für `RoleAssignment.departmentId`/`.teamId`~~ **Geschlossen** (Migration `20260820080847_add_cross_tenant_fk_consistency`, Composite Foreign Keys `(tenantId, departmentId) → department(tenantId, id)` bzw. `(tenantId, teamId) → team(tenantId, id)`, ebenso für `team.departmentId → department`; per Negativtests verifiziert). Details siehe Phase-3-Bericht.
- `TenantContextInterceptor` ist implementiert und getestet, aber an **keinen** fachlichen Controller angeschlossen (kein Controller existiert).
- `X-Tenant-Id`-Header ist ein bewusster Platzhalter-Mechanismus zur Tenant-Auswahl — die eigentlich vorgesehene Subdomain-/Session-basierte Auflösung (siehe `AUTH_IDENTITY_RBAC_ARCHITEKTUR.md`) ist noch nicht gebaut.
- `packages/database` und `apps/api` melden weiterhin die aus Phase 1 bekannte `package.json#prisma`-Deprecation-Warnung (Migration zu `prisma.config.ts` erst mit einem künftigen Prisma-7-Wechsel relevant, siehe ADR 0002).

## 21. Sicherheitsrisiken

- ~~Die unter Abschnitt 20 genannte fehlende Cross-Tenant-FK-Konsistenzprüfung...~~ **Geschlossen**, siehe Abschnitt 20.
- `verevia_app`-Passwort ist aktuell der Platzhalter `change-me` (konsistent mit den übrigen Dev-Zugangsdaten) — muss vor jeder über lokale Entwicklung hinausgehenden Umgebung zwingend geändert werden (bereits in der Migration und `.env.example` als Hinweis dokumentiert).
- `TenantContextInterceptor` ist funktional korrekt, aber noch nirgends angeschlossen — das eigentliche Sicherheitsrisiko entsteht erst, wenn ein künftiger Controller versehentlich **ohne** diesen Interceptor auf tenant-gebundene Daten zugreift; die RLS-Schutzschicht in der Datenbank bleibt dabei die entscheidende zweite Verteidigungslinie.

## 22. Empfohlener nächster Schritt

1. Diesen Bericht durchsehen und freigeben.
2. ~~Cross-Tenant-FK-Konsistenzprüfung nachziehen~~ — erledigt in Phase 3, siehe [PHASE_3_CLUB_STRUCTURE_REPORT.md](./PHASE_3_CLUB_STRUCTURE_REPORT.md).
3. Fachliches Arbeitspaket für Verein → Fußball → Mannschaften (MVP-Fokus laut `Roadmap.md`), inklusive erster Controller, die `TenantContextInterceptor` tatsächlich verwenden.
4. `feat/core-data-model` nach main gemerged (Phase 3), siehe dort.

## Bezug

- [Architektur-Finalisierung](./ARCHITEKTUR_FINALISIERUNG.md)
- [Auth-, Identity- und RBAC-Architektur](./AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)
- [Datenbank-Entwurf](./database/Database.md)
- [Mandantenfähigkeit](./architecture/Multi-Tenancy.md)
- [Phase-1-Baseline-Bericht](./PHASE_1_BASELINE_REPORT.md)
