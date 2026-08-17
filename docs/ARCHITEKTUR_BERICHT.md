# Architektur-Bericht Verevia

> Status: Analyse abgeschlossen, Entscheidungen zur Freigabe vorgelegt. Kein Anwendungscode wurde im Rahmen dieser Analyse implementiert oder verändert.
>
> Erstellt: 2026-08-17

## 1. Executive Summary

Verevia befindet sich vollständig in der Dokumentations- und Planungsphase. Das Repository enthält **keinen einzigen Anwendungscode**, keine `package.json`, keine Docker-Compose- oder Turborepo-Konfiguration — ausschließlich Markdown-Dokumentation und leere Platzhalterverzeichnisse. Die vorhandene Dokumentation ist ungewöhnlich reif für diese Phase: Produktvision, MVP-Abgrenzung, Rollenmodell, Datenbank-Entwurf, Multi-Tenancy-Konzept und ein erstes ADR liegen bereits vor und sind inhaltlich konsistent.

Der in README.md und Architecture.md vorgeschlagene Stack (Next.js, NestJS, PostgreSQL, Prisma, Tailwind/shadcn, Turborepo/pnpm, Playwright, Docker, Traefik, GitHub Actions) ist für dieses Projekt **sinnvoll gewählt** und wird in diesem Bericht **übernommen**, nicht neu erfunden. Wesentliche noch offene Fragen sind: Authentifizierungslösung, ob eine eigene `admin`-App nötig ist, das genaue Multi-Tenancy-Isolationsmodell, die Rollen-/Scope-Granularität (Rolle pro Team statt nur pro Verein) sowie Storage-, Mail- und Backup-Strategie. Für alle diese Punkte enthält dieser Bericht eine konkrete Empfehlung.

Die parallel vorbereitete VPS-Infrastruktur (Traefik, Docker-Netzwerke, Verzeichnisstruktur `/srv/verevia/{prod,dev,shared,backups}`) ist zum Zielbild passend und wird unverändert weiterverwendet.

**Kernempfehlung:** Stack wie dokumentiert beibehalten, Auth selbst in NestJS bauen (kein Keycloak), keine separate `admin`-App im MVP, Shared-Database/Shared-Schema mit `tenant_id` + Postgres Row-Level-Security, Rollen-Scope auf Team-/Abteilungsebene statt nur Verein-Ebene erweitern.

---

## 2. Analyse des aktuellen Repository-Zustands

### Struktur

```text
Verevia/
├── apps/{web,admin,api}/README.md      # nur Platzhalter, kein Code
├── packages/{ui,types,config,utils}/README.md  # nur Platzhalter, kein Code
├── infrastructure/{docker,proxy,scripts}/README.md  # nur Platzhalter
├── docs/
│   ├── architecture/  Architecture.md, Multi-Tenancy.md, adr/0001-modular-monolith.md
│   ├── product/       Product-Vision.md, MVP-Scope.md, Roles-and-Permissions.md
│   ├── database/      Database.md (fachlicher Entwurf, kein Prisma-Schema)
│   ├── deployment/     Deployment.md
│   ├── branding/       Brand-Identity.md
│   ├── modules/        Module-Priorities.md
│   └── roadmap/        Roadmap.md
├── .env.example         # Platzhalterwerte, sinnvoll strukturiert
├── .github/workflows/markdown-check.yml   # einzige existierende CI-Pipeline
├── CODEOWNERS (* @mugglman), CONTRIBUTING.md, LICENSE.md (proprietär, "alle Rechte vorbehalten")
```

Git-Status: Branch `chore/initial-project-setup` ist auf `origin` vorhanden, aber **nicht in `main` gemerged**. `main` enthält nur den allerersten README-Commit.

### Bewertung

**Positiv:**

- Die Dokumentation ist widerspruchsfrei über alle Dateien hinweg (gleiche Entitäten, gleiche Rollenbegriffe, gleiche Statuskennzeichnung "Entwurf").
- ADR-Praxis ist bereits etabliert (0001 Modularer Monolith) — sollte fortgeführt werden.
- `Department`/`Sportart`-Trennung ist im Datenmodell bereits mitgedacht, obwohl MVP nur Fußball zeigt — genau die richtige Vorbereitung für spätere Sportarten ohne Kernumbau.
- `.env.example` ist bereits im Repo, echte Secrets korrekt in `.gitignore` ausgeschlossen.
- `TENANT_MODE=shared` in `.env.example` deutet bereits in Richtung Shared-Schema — deckt sich mit der Empfehlung in Abschnitt 6.

**Zu klären/korrigieren:**

- Mehrere Dokumente (README.md, Architecture.md, Deployment.md, infrastructure/proxy/README.md) listen "Traefik oder Caddy" noch als offen — laut aktuellem Infrastrukturstand läuft Traefik 3.7 bereits produktiv getestet unter `status.verevia.app`. Diese Dokumente sind veraltet und sollten aktualisiert werden (siehe Abschnitt 17).
- Kein Prisma-Schema, keine Migration — erwartungsgemäß für diese Phase.
- `README.md` erwähnt "Vorbereitet für zukünftige Microservices-Umstellung" als Kernprinzip, während ADR 0001 explizit den modularen Monolithen als Zielarchitektur für Phase 1 festlegt. Das ist kein Widerspruch, sollte aber im README präzisiert werden: nicht "Vorbereitung auf Microservices" als Ziel, sondern "Modulgrenzen, die eine spätere Auslagerung nicht verbauen".
- Datenmodell (`Database.md`) sieht pro `Membership` nur eine oder mehrere `Role`n auf Vereinsebene vor. Für Szenarien wie "Trainer E-Jugend + Spieler Alte Herren + Elternteil" reicht das nicht aus (siehe Abschnitt 9).
- `chore/initial-project-setup` sollte nach Abschluss der offenen Entscheidungen nach `main` gemerged werden, um eine gemeinsame Basis für Phase 1 zu haben.

---

## 3. Empfohlener Technologie-Stack

| Bereich | Empfehlung | Begründung kurz |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + React | bereits dokumentiert, PWA/SSR/Mobile-First aus einer Hand |
| Backend/API | NestJS + TypeScript | bereits dokumentiert, passt zu ADR 0001 (modulare Struktur via Nest-Module) |
| Datenbank | PostgreSQL | bereits dokumentiert, relational passend zu strikter Mandantentrennung |
| ORM | Prisma | bereits dokumentiert, gute DX, Migrations-Tooling |
| Authentifizierung | Eigene Lösung in NestJS (Passport.js + Sessions/JWT, Argon2-Hashing) | siehe Abschnitt 10 |
| Autorisierung | RBAC-Datenmodell (Membership/RoleAssignment/Permission) + CASL | feingranular, kontextabhängig, siehe Abschnitt 9 |
| UI Framework | shadcn/ui | bereits dokumentiert, passt zu Tailwind + Brand-Identity (Light/Dark) |
| CSS | Tailwind CSS | bereits dokumentiert |
| Monorepo Tooling | Turborepo | bereits dokumentiert |
| Package Manager | pnpm | bereits dokumentiert |
| Validation | class-validator/class-transformer (NestJS DTOs) + Zod (Next.js-Formulare, react-hook-form) | jeweils natives Werkzeug pro Layer, kein zusätzliches Framework nötig |
| Testing (Unit) | Jest für `apps/api` (Nest-Standard), Vitest für `apps/web` und `packages/*` | Reibungsverlust vermeiden, Nest-CLI-Generatoren erzeugen Jest-Tests nativ |
| E2E Testing | Playwright | bereits dokumentiert |
| Logging | Pino (`nestjs-pino`) | strukturiertes JSON-Logging, leichtgewichtig, gut für Docker/Traefik-Logs |
| Caching | Redis | ab Phase 3 (Sessions, Rate-Limiting, BullMQ), nicht sofort nötig |
| Object Storage | Cloudflare R2 (S3-kompatibel), lokal MinIO für Dev | siehe Abschnitt 13 |
| E-Mail | Mailpit (Dev, bereits dokumentiert), Resend (Prod) | einfache API, gute Zustellbarkeit ohne eigene SMTP-Reputation |
| Background Jobs | BullMQ (auf Redis) | ab Phase 3 für Push-Mitteilungen/E-Mail-Versand |
| Monitoring | Uptime Kuma (bereits vorhanden) + Sentry (Error-Tracking) | Sentry ist Buy-vs-Build-Gewinner für Fehlerverfolgung |
| CI/CD | GitHub Actions | bereits dokumentiert, siehe Abschnitt 14 |

### Begründung der wichtigsten Abweichungen/Ergänzungen zum bisherigen Stack

**Auth: eigene NestJS-Lösung statt Auth.js oder Keycloak.**

- *Auth.js (NextAuth)* ist eng an Next.js gekoppelt und würde die Session-/Rollenlogik ins Frontend ziehen, obwohl die fachliche Autorisierung laut Architecture.md klar im Backend (NestJS, API-First) liegen soll. Das erzeugt eine unsaubere Verantwortungsteilung zwischen `apps/web` und `apps/api`.
- *Keycloak* ist funktional stark (SSO, SAML, OIDC), aber ein eigenständiger Java-Dienst mit spürbarem RAM-Bedarf (typisch 500 MB–1 GB) auf einem VPS mit insgesamt 8 GB RAM, der neben Postgres, Redis, Traefik und den Anwendungscontainern laufen muss. Für die Anforderungen bis Phase 6 (E-Mail/Passwort, Reset, Verifizierung, später MFA) ist das Overengineering nach den eigenen Grundprinzipien ("keine unnötige Infrastruktur").
- Empfehlung: Passport.js-Strategien direkt in `apps/api`, Passwort-Hashing mit Argon2, Sessions oder kurzlebige JWTs mit Refresh-Token in httpOnly-Cookies, MFA (TOTP) als späterer Ausbauschritt. Das hält die Auth-Domäne dort, wo laut eigener Architektur die Mandanten- und Rechteprüfung ohnehin stattfindet, und die vorbereitete Subdomain `auth.verevia.app` kann später auf ein eigenständiges Nest-Modul oder einen ausgelagerten Dienst zeigen, ohne dass sich am Datenmodell etwas ändert.
- Falls in Phase 7 (SaaS/Verbands-SSO) echte SSO-/SAML-Anforderungen externer Organisationen entstehen, ist Keycloak oder ein Managed-Auth-Dienst (z. B. WorkOS) dann gezielt nachrüstbar — bewusst **jetzt nicht** vorwegnehmen.

**Object Storage: R2 statt MinIO in Produktion.**

- MinIO ist voll dokumentkonform (selbst gehostet, S3-kompatibel), verbraucht aber dauerhaft RAM/Disk auf demselben knappen VPS. Cloudflare R2 ist S3-API-kompatibel, hat keine Egress-Kosten und keinen Betriebsaufwand. Für lokale Entwicklung bleibt MinIO via Docker Compose sinnvoll (identische S3-API, kein Internetzugriff nötig).

**class-validator statt Zod im Backend.**

- NestJS ist um `class-validator`/`class-transformer` herum gebaut (Decorator-basierte DTOs, native Pipe-Integration). Zod zusätzlich einzuführen würde zwei Validierungssysteme im selben Backend erzeugen. Zod bleibt sinnvoll auf Frontend-Seite für Formulare (`react-hook-form` + `@hookform/resolvers/zod`).

---

## 4. Vorgeschlagene Monorepo-Struktur

Grundstruktur wie in README.md/Architecture.md bereits angelegt, mit einer wesentlichen Änderung: **keine eigenständige `apps/admin` im MVP.**

```text
Verevia/
├── apps/
│   ├── web/                # Next.js: Vereins-App UND Plattform-Admin-Bereich
│   │   └── app/(platform-admin)/...   # geschützte Routengruppe, nur Platform-Rollen
│   └── api/                # NestJS
│       └── src/modules/{tenant,membership,team,department,calendar,tournament,...}/
├── packages/
│   ├── ui/                 # shadcn-basierte, geteilte Komponenten
│   ├── database/           # Prisma-Schema + generierter Client (neu ggü. Ursprungsvorschlag)
│   ├── auth/                # geteilte Auth-Typen/Guards/Decorators (Backend+Frontend-Typen)
│   ├── config/              # ESLint/TS/Tailwind-Basis-Configs
│   └── types/                # geteilte DTO-/Domain-Typen
├── infrastructure/
│   ├── docker/               # Dockerfiles pro App, docker-compose.dev.yml
│   ├── proxy/                 # Traefik dynamic config (Labels, Middlewares)
│   └── scripts/                # Backup-, Deploy-, Seed-Skripte
├── docs/
└── .github/workflows/
```

### Bewertung: Ist `apps/admin` nötig?

**Empfehlung: Nein, nicht im MVP.** Begründung:

- Die Plattformadministration betrifft im MVP nur eine Handvoll Funktionen (Mandanten anlegen/deaktivieren, Plattform-Support-Zugriffe) und keinen eigenständigen Nutzerkreis mit eigenen UX-Anforderungen.
- Eine zweite Next.js-App bedeutet: eigenes Deployment, eigene Domain-Konfiguration in Traefik, eigenes CI-Pipeline-Target, eigenen Auth-Flow-Test — zusätzlicher Betriebsaufwand ohne fachlichen Gegenwert in dieser Phase.
- Stattdessen: geschützte Routengruppe `(platform-admin)` innerhalb von `apps/web`, serverseitig durch Platform-Rollen-Check abgesichert (die Rollen `Platform Owner/Administrator/Support` existieren bereits im Rollenmodell). Die Subdomain `admin.verevia.app` kann per Traefik-Routing weiterhin auf denselben Next.js-Container zeigen, nur mit anderem Pfadpräfix oder Host-Header-Routing zur `(platform-admin)`-Gruppe.
- **Trigger für Auslagerung in eine echte eigenständige App:** sobald die Plattformadministration eigene, komplexere Workflows bekommt (z. B. Abrechnung, Multi-Verband-Verwaltung) oder ein separates Team dafür zuständig wird — realistisch erst ab Phase 7.

---

## 5. Multi-Tenancy-Konzept

### Bewertung der drei Optionen

| Modell | Bewertung für Verevia |
|---|---|
| **Shared Database / Shared Schema + `tenant_id`** | Geringster Betriebsaufwand, eine Migration betrifft alle Mandanten gleichzeitig, passt zu Single-VPS-Budget und Pilotphase mit einem Verein. Isolationsrisiko muss durch Disziplin (Guards, RLS) kompensiert werden. |
| **Schema per Tenant** | Bessere Isolation, aber Migrationsaufwand wächst linear mit Vereinszahl (jede Migration muss über N Schemata laufen), Prisma-Unterstützung dafür ist umständlich (kein natives Multi-Schema-Tenanting). Für eine Plattform mit potenziell hunderten kleinen Vereinen ungeeignet. |
| **Database per Tenant** | Beste Isolation, aber Betriebsaufwand (Connections, Backups, Migrationen) skaliert nicht wirtschaftlich für viele kleine, kostenbewusste Vereinskunden. Passt eher zu wenigen Großkunden. |

### Empfehlung

**Shared Database / Shared Schema mit `tenant_id`**, ergänzt um zwei Verteidigungslinien statt nur einer:

1. **Anwendungsebene:** Jede Query läuft durch einen Tenant-Scoping-Layer (z. B. Prisma Middleware oder ein Repository-Pattern, das `tenant_id` automatisch injiziert) — kein Repository-Zugriff ohne Tenant-Kontext.
2. **Datenbankebene:** PostgreSQL Row-Level-Security (RLS) Policies auf allen mandantenbezogenen Tabellen als zweite, vom Anwendungscode unabhängige Absicherung — schützt auch vor Bugs im Anwendungscode (Defense in Depth), ist mit vertretbarem Aufwand einführbar und in `Database.md` bereits inhaltlich vorbereitet (jede mandantenbezogene Entität hat verpflichtende `tenant_id`).

Das deckt sich mit `TENANT_MODE=shared` in der bereits vorhandenen `.env.example`.

**Migrationspfad, falls später ein einzelner Großkunde harte Isolation verlangt:** einzelne Tenants gezielt in eine eigene Datenbankinstanz "ausschneiden" (Prisma unterstützt mehrere Datenquellen über Connection-Strings) — als gezielte Ausnahme, nicht als Standardarchitektur.

---

## 6. Domainmodell

Erweiterung des bestehenden Entwurfs aus `Database.md`, mit einer neuen zentralen Entität **`Sport`** (bisher implizit über `Department` gedacht, jetzt explizit), damit das Modell nicht auf Fußball zugeschnitten bleibt:

### Neue/angepasste Entitäten gegenüber Database.md

| Entität | Änderung | Begründung |
|---|---|---|
| `Sport` (neu) | Plattformweite, nicht mandantenbezogene Stammdatentabelle (Fußball, Tennis, Stockschützen, Radsport, …) | Ermöglicht, dass `Department` eine Sportart referenziert, statt Sportart im Namen zu kodieren. Neue Sportarten = neue Zeile, kein Schema-Umbau. |
| `Department.sportId` (neu) | Pflicht-Fremdschlüssel auf `Sport` | Macht MVP-Fokussierung auf Fußball rein datengetrieben: nur `Sport = Fußball` ist im MVP in der UI sichtbar/aktivierbar, das Schema unterstützt den Rest bereits. |
| `Tenant.enabledSports` (spätere Erweiterung, nicht MVP) | Verknüpfungstabelle `TenantSport`, welche Sportarten ein Verein aktiviert hat | Steuert Sichtbarkeit in der UI ohne Code-Änderung, wenn ein Verein z. B. Tennis dazuschaltet. |

### Kernstruktur (Beispiel TSV Benediktbeuern)

```text
Tenant (TSV Benediktbeuern)
├── Department (Fußball) → Sport: Fußball
│   ├── Team (E-Jugend)
│   ├── Team (Alte Herren)
│   └── Season (2026/27)
├── Department (Tennis) → Sport: Tennis        [vorbereitet, im MVP nicht aktiviert]
├── Department (Stockschützen) → Sport: Stocksport  [vorbereitet, im MVP nicht aktiviert]
└── Membership (User ↔ Tenant, Träger von RoleAssignments)
```

Alle übrigen Entitäten aus `Database.md` (`Person`, `Guardian`, `GuardianRelation`, `Coach`, `Event`, `Attendance`, `Task`, `Tournament`, `TournamentTeam`, `Match`, `Venue`, `Notification`, `AuditLog`, `JointTeam`, `JointTeamTenant`) bleiben inhaltlich unverändert gültig und werden übernommen.

---

## 7. Spielgemeinschafts-Konzept

Das bestehende Konzept aus `Multi-Tenancy.md` und `Database.md` (`JointTeam` + `JointTeamTenant`, mit einem federführenden Verein) ist bereits sauber und wird bestätigt, mit einer konkreten Umsetzungsergänzung:

- `JointTeam` referenziert weiterhin ein `Team`, das organisatorisch **keinem einzelnen Tenant, sondern der Spielgemeinschaft** zugeordnet ist.
- `JointTeamTenant` verknüpft die beteiligten Vereine, mit Flag `isLead: boolean` (genau ein federführender Verein pro `JointTeam`, durchsetzbar per DB-Constraint).
- **Zugriffssteuerung:** Mitglieder eines beteiligten Vereins erhalten Zugriff auf das gemeinsame Team nur über eine explizite `RoleAssignment` mit `scopeType = TEAM` und `scopeId = jointTeam.id` (siehe Rollenkonzept, Abschnitt 9) — nicht implizit über ihre normale Vereinsmitgliedschaft. Das verhindert, dass z. B. Elternkontaktdaten eines Vereins automatisch für den Partnerverein sichtbar werden.
- Die RLS-Policy für `Team`-bezogene Tabellen muss diesen Fall explizit abbilden: Zugriff, wenn `tenant_id = current_tenant` **oder** eine gültige `RoleAssignment` auf die `JointTeam` existiert.

---

## 8. Rollen-/Berechtigungskonzept

### Problem im bisherigen Datenmodell

`Database.md` sieht `Membership` als Verknüpfung `User ↔ Tenant` mit einer oder mehreren `Role`n vor — Rollen gelten dort implizit auf **Vereinsebene**. Das im Auftrag genannte Beispiel (Trainer E-Jugend + Spieler Alte Herren + Elternteil eines Jugendspielers, alles im selben Verein) erfordert aber **unterschiedliche Rollen in unterschiedlichen Scopes innerhalb desselben Vereins** — das aktuelle Modell kann das nicht abbilden.

### Empfohlene Erweiterung

Neue Entität **`RoleAssignment`** statt einer reinen `Role`-Liste auf `Membership`:

```text
Membership (User ↔ Tenant)
└── RoleAssignment[]
      ├── role: Role
      ├── scopeType: TENANT | DEPARTMENT | TEAM
      └── scopeId: UUID (nullable bei TENANT-Scope)
```

- Eine `Membership` bündelt weiterhin die Zugehörigkeit eines Users zu genau einem Verein.
- Jede `RoleAssignment` ist eine konkrete Rolle **in einem konkreten Kontext**: `Trainer` mit `scopeType=TEAM, scopeId=E-Jugend`, `Mitglied`/`Spieler` mit `scopeType=TEAM, scopeId=Alte-Herren`, `Elternteil` mit `scopeType=TEAM, scopeId=<Kind-Team>` (oder direkt an die `GuardianRelation` gekoppelt).
- Rechteprüfung: ein NestJS `Guard` löst aus dem angefragten Kontext (z. B. `teamId` aus der Route) auf, ob eine passende `RoleAssignment` existiert — entweder direkt auf diesem Scope oder auf einem übergeordneten Scope (Department-Rolle wirkt auf alle Teams der Abteilung, Tenant-Rolle wirkt auf den ganzen Verein). Empfehlung: **CASL** zur deklarativen Formulierung dieser Ableitungsregeln, statt Ableitung hart zu verdrahten.

### Rollenkatalog

Übernahme des bereits dokumentierten Katalogs (`Roles-and-Permissions.md`) unverändert:

- **Plattformrollen** (mandantenübergreifend): Platform Owner, Platform Administrator, Platform Support.
- **Vereinsrollen** (scope-fähig wie oben beschrieben): Vereinsadministrator, Vorstand, Abteilungsleiter, Jugendleiter, Mannschaftsadministrator, Trainer, Betreuer, Mitglied, Elternteil/Sorgeberechtigter, Gast.

Diese Entscheidung ist eine **Ergänzung** von `Database.md`, kein Widerspruch — sie sollte vor Implementierungsbeginn dort nachgezogen werden (siehe Abschnitt 17).

---

## 9. Authentifizierungskonzept

- **Build statt Buy**, in NestJS umgesetzt (Begründung siehe Abschnitt 3).
- E-Mail/Passwort mit Argon2id-Hashing (aktueller OWASP-Standard, resistenter gegen GPU-Angriffe als bcrypt).
- Passwort-Reset und E-Mail-Verifizierung über zeitlich begrenzte, signierte Tokens (JWT oder zufällige Tokens mit Hash in der DB), Versand über den E-Mail-Provider (Resend/Mailpit).
- Sessions: httpOnly, `SameSite=Lax`, `Secure`-Cookies; Session-Speicherung serverseitig (Postgres oder später Redis) statt reiner JWT-Selbstvalidierung, um Sessions serverseitig invalidieren zu können (Logout, Sperrung).
- MFA (TOTP) als vorbereiteter, aber erst später aktivierter Ausbauschritt (Datenmodell von Anfang an mit `mfaSecret`-Feld vorsehen, UI erst in späterer Phase).
- Social Login/Passkeys: architektonisch über zusätzliche Passport-Strategien nachrüstbar, nicht Teil des MVP.
- Rate-Limiting auf Login/Reset-Endpunkten von Anfang an (z. B. `@nestjs/throttler`), da diese Endpunkte öffentlich erreichbar sind.

---

## 10. Dev-/Prod-Konzept

**Empfehlung: Dev und Prod vorerst auf demselben VPS**, da:

- nur ein Pilotverein, keine produktionskritische Last zu erwarten,
- die Docker-Netzwerke (`verevia-dev`, `verevia-prod`, `verevia-proxy`) sowie die Verzeichnisse (`/srv/verevia/dev`, `/srv/verevia/prod`) bereits für genau diese Trennung vorbereitet sind,
- ein zweiter VPS in dieser Phase reine Kostensteigerung ohne fachlichen Nutzen wäre.

**Notwendige Isolation trotz gemeinsamem Host:**

- Getrennte Postgres-Instanzen (eigene Container) für dev/prod — niemals dieselbe Datenbank mit unterschiedlichen Schemas "spielen".
- Getrennte `.env`-Dateien pro Umgebung, unterschiedliche Secrets (siehe Abschnitt 11).
- Dev-Umgebung nicht öffentlich über `app.verevia.app` erreichbar; eigene Subdomain (`dev.verevia.app`, bereits als mögliche spätere Subdomain dokumentiert) hinter Traefik-Basic-Auth oder IP-Allowlist.
- Docker-Ressourcenlimits (`mem_limit`/`cpus` in Compose) für Dev-Container, damit ein Dev-Fehlverhalten nicht die Produktivumgebung auf der gemeinsamen VM verdrängt (8 GB RAM ist knapp bemessen für 2 vollständige Stacks parallel — im Blick behalten, ggf. Dev-Stack nur bei Bedarf hochfahren statt dauerhaft laufen lassen).

**Trigger für physische Trennung:** sobald echter Produktivbetrieb mit mehreren zahlenden Vereinen läuft (ab Phase 7) — dann eigener Dev-/Staging-VPS.

---

## 11. Docker-/Deployment-Konzept

- Je App (`web`, `api`) ein eigenes, mehrstufiges Dockerfile (Build-Stage mit vollem Toolchain, Runtime-Stage minimal/`node:slim`).
- `infrastructure/docker/docker-compose.prod.yml` und `docker-compose.dev.yml` orchestrieren App-Container + Postgres (+ später Redis) je Umgebung, angebunden an die jeweiligen vorhandenen Netzwerke.
- Traefik-Konfiguration bleibt wie vorhanden (Labels an den Containern, `exposedByDefault=false`), keine Änderung nötig — nur neue Service-Labels für `web`/`api` ergänzen, sobald Container existieren.
- Interne Dienste (Postgres, Redis, MinIO-Dev) laufen ausschließlich im internen Docker-Netzwerk, ohne Traefik-Label, kein öffentlicher Port (deckt sich mit vorhandener Security-Vorgabe).
- Images werden in CI gebaut und in die GitHub Container Registry (GHCR) gepusht, Deployment zieht das Image auf dem VPS (siehe Abschnitt 14).

---

## 12. Secrets-Konzept

| Umgebung | Ablage | Zugriff |
|---|---|---|
| Lokale Entwicklung | `.env.local` (gitignored), befüllt aus `.env.example` | Entwickler manuell |
| CI (GitHub Actions) | GitHub Actions Secrets (Repo- oder Environment-Secrets) | Nur in Workflow-Runs, maskiert in Logs |
| Produktion/Dev auf VPS | `.env`-Dateien direkt auf dem Server unter `/srv/verevia/{prod,dev}/.env`, Dateirechte `600`, Owner = Deploy-User | Nur `maik`/Deploy-Prozess, niemals im Git |

- `.env.example` bleibt die einzige Quelle für Struktur/Doku der benötigten Variablen (bereits korrekt so eingerichtet).
- Keine Secrets in Docker-Images backen — ausschließlich über Environment-Variablen/Compose zur Laufzeit injizieren.
- Ein dedizierter Secrets-Manager (Infisical, Doppler o. Ä.) ist bei aktueller Teamgröße (Einzelperson/kleines Team) **nicht nötig** — Empfehlung: erst einführen, wenn mehrere Personen produktiv Zugriff auf Secrets benötigen.

---

## 13. CI/CD-Konzept

Aktuell existiert nur `markdown-check.yml`. Empfohlene Ergänzung, sobald Code existiert:

```text
Feature-Branch → Pull Request
   → Lint (ESLint) + Typecheck (tsc) + Unit-Tests (Jest/Vitest)   [Turborepo: nur betroffene Pakete]
   → Build (Turborepo)
   → (optional ab Phase 4) Playwright-E2E gegen Preview
→ Merge nach main
   → Docker-Images bauen (web, api) → Push zu GHCR, getaggt mit Commit-SHA
   → Deploy-Schritt: SSH auf VPS, docker compose pull + up -d im jeweiligen Zielverzeichnis (zunächst manuell/nach Freigabe getriggert, kein automatisches Prod-Deploy ohne manuellen Schritt in der Frühphase)
```

- **Jetzt sinnvoll:** Lint/Typecheck/Unit-Tests als Pflicht-Check auf PRs, sobald erster Code existiert — verhindert von Anfang an Verfall.
- **Später sinnvoll (ab Phase 4/5):** automatisches Deployment nach Merge, E2E-Gate vor Prod-Deploy, Staging-Umgebung als Zwischenstufe.
- **Nicht jetzt nötig:** Canary-Deployments, Blue/Green, Kubernetes-basiertes Rollout — Overengineering für eine Single-VPS-Instanz mit einem Pilotverein.

---

## 14. Backup-/Recovery-Konzept

| Bestandteil | Strategie |
|---|---|
| PostgreSQL | Nächtlicher `pg_dump` (bzw. `pg_basebackup` für größere Datenmengen später) via Cron-Skript in `infrastructure/scripts/`, Ablage in `/srv/verevia/backups/` |
| Offsite-Kopie | Automatischer Sync der Backups (z. B. via `rclone`) zu einem externen Ziel (Hetzner Storage Box oder Backblaze B2) — **zwingend**, da `/srv/verevia/backups` auf derselben physischen VPS-Disk liegt und bei Server-/Provider-Ausfall keine Kopie mehr existiert |
| Object Storage (falls R2) | Durch Cloudflare-Redundanz abgedeckt, keine zusätzliche Backup-Pflicht |
| Object Storage (falls doch MinIO) | Eigenes Backup nötig, zusätzlicher Aufwand — spricht zusätzlich für R2 |
| Konfiguration/Compose/Traefik | Bereits über Git versioniert, keine zusätzliche Sicherung nötig |
| Restore-Test | Regelmäßiger (z. B. quartalsweiser) Test-Restore in eine isolierte Umgebung, um Backup-Validität zu verifizieren — **vor Produktivbetrieb erstmals durchführen** |

Aufbewahrungsfrist und genaue Frequenz sind eine bewusste spätere Entscheidung (siehe Abschnitt 17), aber die Offsite-Pflicht sollte jetzt schon als Prinzip festgehalten werden.

---

## 15. Security-Empfehlungen

- RLS in Postgres von Anfang an mitdenken (siehe Abschnitt 6), nicht nachträglich.
- Argon2id für Passwörter, keine Eigenentwicklung kryptografischer Primitiven.
- Rate-Limiting auf Auth-Endpunkten (`@nestjs/throttler`) von Anfang an.
- `helmet` (HTTP-Security-Header) und CORS-Whitelist (nur `app.verevia.app`, `admin.verevia.app`) in NestJS von Anfang an aktiv.
- AuditLog-Entität (bereits in `Database.md` vorgesehen) für sicherheitsrelevante Änderungen (Rollenänderungen, Zugriff auf sensible Kinddaten) bereits im MVP-Datenmodell mitziehen, auch wenn UI dafür erst später kommt.
- SSH-Key-Härtung (in Infrastruktur-Status als offen markiert) sollte **vor** dem ersten produktiven Datenbank-Deployment nachgeholt werden — Passwort-Auth auf einem öffentlich erreichbaren Port 22 ist das schwächste Glied der aktuellen Kette.
- Secrets-Scan (z. B. `gitleaks`) als zusätzlicher CI-Check, sobald Code existiert, um versehentliche Secret-Commits zu verhindern.

---

## 16. Offene Architekturentscheidungen

| Entscheidung | Empfehlung dieses Berichts | Muss noch final freigegeben werden |
|---|---|---|
| Auth-Lösung | Eigene NestJS-Lösung (Passport + Argon2 + Sessions) | Ja |
| Reverse Proxy | Traefik (faktisch bereits entschieden/im Betrieb) | Nur Doku nachziehen |
| Object Storage | Cloudflare R2 (Prod), MinIO (Dev) | Ja |
| E-Mail-Anbieter Prod | Resend | Ja |
| Lizenzmodell | Keine Empfehlung dieses Berichts (reine Produkt-/Rechtsentscheidung, kein Architekturthema) | Ja, unabhängig |
| Zahlungsmodell | Keine Empfehlung dieses Berichts (Produktentscheidung) | Ja, unabhängig |
| Genaues Backup-Intervall/Retention | Nächtlich, Retention TBD (Vorschlag: 14 Tage rolling + 1 monatlich, 6 Monate) | Ja |
| Zeitpunkt physische Dev/Prod-Trennung | Ab Phase 7 (Multi-Tenant-Produktivbetrieb) | Ja |

---

## 17. Risiken

1. **RAM-Engpass auf dem 8 GB VPS**, sobald Postgres + Redis + web + api + Traefik + (Dev-Spiegel) gleichzeitig laufen. Mitigation: Dev-Stack nur bei aktivem Entwickeln hochfahren, `mem_limit` je Container setzen, frühzeitig Monitoring der tatsächlichen Auslastung (Uptime Kuma reicht dafür nicht — einfaches `docker stats`-Logging oder Node-Exporter früh ergänzen).
2. **SSH-Passwort-Auth** auf öffentlichem Port 22 ist der aktuell schwächste Sicherheitspunkt der Infrastruktur.
3. **Rollenmodell-Lücke** (Rolle nur auf Vereinsebene statt Team-/Abteilungsebene) — wird ohne die in Abschnitt 9 vorgeschlagene `RoleAssignment`-Erweiterung zu einer nachträglich sehr aufwändigen Migration, wenn erst nach MVP-Launch bemerkt.
4. **Fehlende Offsite-Backups** wären ein Totalverlustrisiko für alle Vereins- und Mitgliederdaten, solange nur `/srv/verevia/backups` auf derselben Maschine existiert.
5. **Veraltete Doku-Stellen** (Traefik/Caddy als "offen") können zu falschen Annahmen bei künftigen Entscheidungen führen, wenn sie nicht zeitnah korrigiert werden.
6. **Datenschutz Minderjähriger**: Person/Guardian-Daten sind besonders sensibel; eine formale datenschutzrechtliche Prüfung ist laut Roadmap erst für Phase 6 vorgesehen — Risiko, dass Datenmodell-Entscheidungen in Phase 1–4 getroffen werden, bevor diese Prüfung stattfindet. Empfehlung: mindestens eine informelle Datenschutz-Kurzprüfung vorziehen, bevor das `Person`/`Guardian`-Schema in Prisma finalisiert wird.

---

## 18. Technische Schulden bzw. bestehende Probleme

- Keine, da noch kein Code existiert — die einzigen "Schulden" sind dokumentarischer Natur (siehe veraltete Traefik/Caddy-Stellen, README-Formulierung zu Microservices, fehlende `RoleAssignment`-Modellierung in `Database.md`).
- `chore/initial-project-setup` sollte gemerged werden, um zu verhindern, dass zukünftige Doku-Änderungen unbemerkt divergieren.

---

## 19. Priorisierte Roadmap

**Phase 0 – Projektgrundlage** *(weitgehend abgeschlossen)*
Marke, Domains, Repo-Struktur, VPS, Traefik, Docker-Netzwerke — offen: SSH-Key-Härtung, Merge nach `main`, Korrektur veralteter Doku-Stellen.

**Phase 1 – Verevia Core**
Monorepo-Skeleton (Turborepo/pnpm, leere Next.js- und NestJS-Apps, `packages/database` mit erstem Prisma-Schema aus `Database.md` + `RoleAssignment`-Erweiterung), CI-Pipeline (Lint/Typecheck/Test/Build), Auth-Modul (E-Mail/Passwort, Sessions), Tenant/Membership/RoleAssignment-Kern, RLS-Grundgerüst.

**Phase 2 – Verein**
Tenant-Onboarding, Department/Sport-Stammdaten (nur Fußball aktiviert), Vereinsadministrator- und Vorstandsrollen, Basis-UI (Dashboard-Shell gemäß Brand-Identity).

**Phase 3 – Fußball**
Team-/Mannschaftsverwaltung, Trainer-/Betreuer-Zuordnung, Kalender/Termine, Zu-/Absagen, Anwesenheit, Aufgaben, Push-Mitteilungen (hier erstmals Redis/BullMQ nötig).

**Phase 4 – Mannschaften/Spielgemeinschaften**
JointTeam/JointTeamTenant-Umsetzung, scope-basierte RoleAssignments über Vereinsgrenzen hinweg, einfache Statistiken.

**Phase 5 – Turnierplanung**
Turnier, Teilnehmer, Gruppen, Spielplan, Ergebnisse, Tabellen, K.-o.-Runden, öffentliche Turnierseite (erste öffentlich ohne Login erreichbare Fläche — eigene Betrachtung von Caching/Rate-Limiting nötig).

**Phase 6 – Pilot TSV Benediktbeuern**
Echtbetrieb, Feedback-Zyklen, formale Datenschutzprüfung, Backup-Restore-Test, Monitoring-Ausbau (Sentry, ggf. Grafana), SSH-Härtung final verifiziert.

**Phase 7 – SaaS-Vorbereitung**
Onboarding weiterer Vereine, Zahlungsmodell final, ggf. physische Dev/Prod-Trennung, Re-Evaluation Auth (SSO/Verbandsanbindung), ggf. `admin`-App auslagern, ggf. Tenant-Ausnahmen mit dedizierter DB.

---

## 20. Entscheidungsübersicht

| Entscheidung | Empfehlung | Alternative | Begründung | Jetzt/Später |
|---|---|---|---|---|
| Frontend | Next.js 15 (App Router) | Remix, SvelteKit | Bereits dokumentiert, größtes Ökosystem, PWA/SSR aus einer Hand, gute shadcn-Integration | Jetzt |
| Backend | NestJS | Express/Fastify minimal, tRPC-only | Modulare DI-Struktur passt direkt zu ADR 0001 (modularer Monolith) | Jetzt |
| Datenbank | PostgreSQL | MySQL, MongoDB | Relational passend zu strikter Mandanten-/Rollenstruktur, RLS-Unterstützung | Jetzt |
| ORM | Prisma | Drizzle | Bessere DX/Migrations-Tooling jetzt; Drizzle bei RLS-lastigem Query-Bedarf später neu bewerten | Jetzt |
| Auth | Eigene NestJS-Lösung (Passport+Argon2) | Auth.js, Keycloak, better-auth | Vermeidet zusätzlichen Dienst auf knappem VPS, hält Autorisierung im Backend, Keycloak erst bei echtem SSO-Bedarf | Jetzt |
| Autorisierung | RoleAssignment + CASL | Rolle nur auf Membership-Ebene (Status quo) | Bildet Mehrfachrollen in unterschiedlichen Team-/Abteilungs-Scopes ab | Jetzt |
| Multi-Tenancy | Shared DB/Schema + `tenant_id` + RLS | Schema-per-Tenant, DB-per-Tenant | Kosteneffizient bei vielen kleinen Vereinskunden, RLS als zweite Verteidigungslinie | Jetzt |
| Admin-App | Keine eigene App, Routengruppe in `web` | Eigenständige `apps/admin` | Kein eigener Nutzerkreis/Workflow im MVP, spart Betriebsaufwand | Jetzt (später auslagerbar) |
| UI Framework | shadcn/ui | MUI, Chakra | Passt zu Tailwind, gut anpassbar an Brand-Farben/Dark-Mode | Jetzt |
| Object Storage | Cloudflare R2 (Prod), MinIO (Dev) | MinIO auch in Prod | Kein zusätzlicher RAM-Verbrauch auf VPS, keine Egress-Kosten | Später (ab Phase 3/4 Dateiuploads) |
| E-Mail Prod | Resend | Eigener SMTP-Server | Bessere Zustellbarkeit ohne eigene IP-Reputation, geringer Ops-Aufwand | Später (Phase 3) |
| Caching/Queue | Redis + BullMQ | Keine Queue, synchron | Nötig ab Push-Mitteilungen/E-Mail-Versand in Phase 3 | Später (Phase 3) |
| Monitoring | Uptime Kuma + Sentry | Nur Uptime Kuma | Sentry ist günstiger Buy-vs-Build-Gewinn für Fehlerverfolgung | Sentry: Phase 1, Grafana: später |
| CI/CD | GitHub Actions, manuelles Prod-Deploy-Gate | Vollautomatisches Deploy ab Tag 1 | Sicherheitsnetz in früher Phase mit noch dünner Testabdeckung | Jetzt (Pipeline), manuelles Gate bis Phase 5 |
| SSH-Härtung | Key-only Auth | Passwort-Auth beibehalten | Aktuell schwächstes Glied der Infrastruktur | Jetzt |
| Backup Offsite | rclone zu externem Storage | Nur lokal auf VPS | Verhindert Totalverlust bei VPS-/Provider-Ausfall | Jetzt (vor Pilotbetrieb) |

---

## Bezug

- [Architektur](./architecture/Architecture.md)
- [Mandantenfähigkeit](./architecture/Multi-Tenancy.md)
- [Datenbank-Entwurf](./database/Database.md)
- [Rollen und Berechtigungen](./product/Roles-and-Permissions.md)
- [Roadmap](./roadmap/Roadmap.md)
- [Deployment](./deployment/Deployment.md)
