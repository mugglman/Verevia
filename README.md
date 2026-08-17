# Verevia

> Die Plattform für moderne Vereine

**Status:** Phase 1 — technisches Skeleton (Monorepo, Next.js, NestJS, Prisma, Docker-Dev-Infrastruktur). Noch keine fachlichen Verevia-Features.

---

## Schnellstart

Voraussetzungen: Node.js ≥ 20 (empfohlen: 22 LTS), pnpm ≥ 9, Docker.

```bash
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d   # lokale PostgreSQL
cp .env.example .env.local                                          # und Werte anpassen
pnpm --filter @verevia/database db:push                             # Schema gegen lokale DB pushen
pnpm dev                                                             # apps/web (Port 3000) + apps/api (Port 3001)
```

Ausführliche Anleitung: [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).

---

## Übersicht

Verevia ist eine moderne, intuitive und mandantenfähige SaaS-Plattform zur Planung, Organisation und Verwaltung aller Abteilungen, Mannschaften und Vereinsabläufe.

Die Plattform richtet sich primär an Vereine und bietet eine zentrale Lösung zur digitalen Vernetzung von Mitgliedern, Trainern, Abteilungsleitern und dem Vereinsvorstand.

### Aktueller Fokus

Verevia startet mit dem Schwerpunkt:

```text
Verein → Fußball → Mannschaften → Turnierplan
```

Andere Module werden architektonisch vorbereitet, aber noch nicht technisch implementiert.

---

## Vision & Mission

### Vision

Verevia ist die zentrale Plattform zur Planung, Organisation und Verwaltung aller Abteilungen, Mannschaften und Vereinsabläufe.

### Mission

Verevia vereinfacht das Vereinsleben durch eine moderne, intuitive und digitale Plattform, die alle Beteiligten verbindet – vom Mitglied und den Eltern über Trainer und Abteilungsleiter bis zum Vereinsvorstand.

### Langfristiges Ziel

Verevia soll innerhalb der kommenden zehn Jahre eine führende Vereinsplattform im deutschsprachigen Raum werden und für alle Abteilungen und Mannschaften eines Vereins einen messbaren Mehrwert bieten.

---

## Kernprinzipien

- **Modular**: Saubere Trennung von Modulen ermöglicht flexible Erweiterbarkeit
- **Mandantenfähig**: Mehrere Vereine auf einer Instanz, strikte Datentrennung
- **API-First**: Alle Funktionen über eine robuste REST-API verfügbar
- **Mobile-First**: Responsive Design für alle Geräte
- **Sicherheit**: Datenschutz und Sicherheit von Anfang an
- **Skalierbar**: modularer Monolith mit klaren Modulgrenzen, die eine spätere Auslagerung einzelner Module nicht verbauen (kein Microservices-Ziel für Phase 1, siehe [ADR 0001](./docs/architecture/adr/0001-modular-monolith.md))

---

## Modulstruktur

### Priorität 1 (MVP - Sofort)

| Modul | Beschreibung |
|-------|-------------|
| Mannschaften | Team-Verwaltung und Hierarchie |
| Turnierplan | Turniererstellung, Spielpläne, Ergebnisse |
| Kalender | Vereins- und Mannschaftstermine |
| Aufgaben | Aufgabenverwaltung für Teams |
| Mitglieder | Mitgliederdatenbank und Profile |
| Eltern | Eltern- und Sorgeberechtigten-Verwaltung |
| Trainer | Trainer-Profile und Zuweisung |
| Push-Mitteilungen | Benachrichtigungen für Nutzer |
| Anwesenheit | Zu- und Absagen, Teilnehmer-Listen |
| Statistik | Grundlegende Auswertungen |
| Website | Öffentliche Vereinsdarstellung |

### Priorität 2 (Mittelfristig)

- Platzbelegung
- Vereinsverwaltung

### Priorität 3 (Zukunft)

- Chat
- Dokumentenverwaltung
- Finanzen

### Priorität 4-5 (Später)

- Inventar
- Abteilungen (umfassend)
- Sponsoren
- Verbände
- Schiedsrichter

---

## Technologiestack

> Details und Begründung: [ARCHITEKTUR_BERICHT.md](./docs/ARCHITEKTUR_BERICHT.md), [ARCHITEKTUR_FINALISIERUNG.md](./docs/ARCHITEKTUR_FINALISIERUNG.md).

| Bereich | Technologie | Status |
|---------|-------------|--------|
| Monorepo | pnpm Workspaces (9.15.9) + Turborepo (2.10.10) | Skeleton implementiert |
| Web-Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 | Skeleton implementiert (technische Startseite) |
| Backend | NestJS 11 + TypeScript | Skeleton implementiert (`GET /health`) |
| Datenbank | PostgreSQL 17 (lokal via Docker) | Grundkonfiguration (Prisma-Client, noch kein fachliches Schema) |
| ORM | Prisma **^6.x** (bewusst nicht 7, siehe ADR 0002) | Grundkonfiguration |
| Authentifizierung | better-auth, selbst gehostet in `apps/api` | Struktur vorbereitet, noch nicht produktiv verdrahtet |
| Mobile | Progressive Web App | Geplant |
| Container | Docker (lokal: Postgres; Produktion: Traefik/VPS) | Lokale Dev-Infrastruktur implementiert |
| Reverse Proxy | Traefik (VPS, produktiv bereits im Betrieb) | Entschieden |
| CI/CD | GitHub Actions (Install → Lint → Typecheck → Test → Build) | Implementiert, noch kein automatisches Deployment |
| Hosting | Hostinger VPS | Vorbereitet |
| Monitoring | Uptime Kuma / Grafana | Geplant |

---

## Verzeichnisstruktur

```text
Verevia/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/      (ci.yml, markdown-check.yml)
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── apps/
│   ├── web/            (Next.js 16 Frontend, inkl. künftiger Plattform-Admin-Bereich)
│   └── api/             (NestJS 11 Backend, GET /health)
├── packages/
│   ├── ui/              (Shared UI Components — Grundgerüst)
│   ├── database/          (Prisma + PostgreSQL — Grundkonfiguration)
│   ├── auth/               (better-auth — Struktur vorbereitet)
│   ├── types/               (Shared TypeScript Types — Grundgerüst)
│   ├── config/               (Shared TypeScript-/ESLint-Konfiguration)
│   └── utils/                 (Shared Utilities — Platzhalter)
├── docs/
│   ├── architecture/    (Technische Architektur, ADRs)
│   ├── branding/          (Markenrichtlinien)
│   ├── database/            (Datenbankschema)
│   ├── deployment/            (Deployment-Guide)
│   ├── modules/                (Modulbeschreibungen)
│   ├── product/                 (Produktdokumentation)
│   ├── roadmap/                  (Projekt-Roadmap)
│   ├── DEVELOPMENT.md              (lokale Entwicklung)
│   ├── ARCHITEKTUR_BERICHT.md
│   ├── AUTH_IDENTITY_RBAC_ARCHITEKTUR.md
│   ├── ARCHITEKTUR_FINALISIERUNG.md
│   └── PHASE_1_SKELETON_REPORT.md
├── infrastructure/
│   ├── docker/           (lokale Dev-Infrastruktur: docker-compose.yml)
│   ├── proxy/
│   └── scripts/
├── .editorconfig
├── .env.example
├── .gitattributes
├── .gitignore
├── .npmrc
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE.md
├── SECURITY.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── turbo.json
```

**Keine separate `apps/admin`** — Plattformadministration wird als geschützte Routengruppe innerhalb von `apps/web` umgesetzt (siehe [ARCHITEKTUR_BERICHT.md](./docs/ARCHITEKTUR_BERICHT.md), Abschnitt 4).

---

## Geplante Domains

### Produktionsumgebung

- **verevia.app** - Öffentliche Landingpage
- **app.verevia.app** - Hauptanwendung
- **api.verevia.app** - Backend-API
- **auth.verevia.app** - Authentifizierung
- **admin.verevia.app** - Plattformadministration
- **docs.verevia.app** - Dokumentation
- **status.verevia.app** - Statusseite

### Zukünftige Subdomains (in Planung)

- dev.verevia.app
- staging.verevia.app
- demo.verevia.app
- cdn.verevia.app
- media.verevia.app
- files.verevia.app
- push.verevia.app
- mail.verevia.app
- ws.verevia.app

---

## Lokaler Entwicklungsstand

Das technische Skeleton ist lauffähig: Next.js-Startseite, NestJS-Health-Endpunkt, Prisma-Grundkonfiguration, lokale PostgreSQL-Infrastruktur, vollständige Quality-Gate-Pipeline (Lint/Typecheck/Test/Build) und CI.

**Bewusst noch nicht enthalten**: fachliche Verevia-Features (Verein, Mannschaften, Turnierplan, Mitgliederverwaltung), produktive Authentifizierung, das vollständige Datenmodell aus [Database.md](./docs/database/Database.md). Details zum Umfang dieses Arbeitspakets: [PHASE_1_SKELETON_REPORT.md](./docs/PHASE_1_SKELETON_REPORT.md).

---

## Dokumentation

Weiterführende Dokumentation befindet sich im Verzeichnis [`docs/`](./docs):

- [Produktvision](./docs/product/Product-Vision.md)
- [MVP-Abgrenzung](./docs/product/MVP-Scope.md)
- [Rollen und Berechtigungen](./docs/product/Roles-and-Permissions.md)
- [Architektur](./docs/architecture/Architecture.md)
- [Mandantenfähigkeit](./docs/architecture/Multi-Tenancy.md)
- [Architekturentscheidungen (ADR)](./docs/architecture/adr/README.md)
- [Datenbank-Entwurf](./docs/database/Database.md)
- [Markenidentität](./docs/branding/Brand-Identity.md)
- [Modulübersicht](./docs/modules/README.md)
- [Roadmap](./docs/roadmap/Roadmap.md)
- [Architektur-Bericht](./docs/ARCHITEKTUR_BERICHT.md)
- [Auth-, Identity- und RBAC-Architektur](./docs/AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)
- [Architektur-Finalisierung](./docs/ARCHITEKTUR_FINALISIERUNG.md)
- [Lokale Entwicklung](./docs/DEVELOPMENT.md)
- [Phase-1-Skeleton-Bericht](./docs/PHASE_1_SKELETON_REPORT.md)

---

## Mitwirkung

Wir freuen uns über Beiträge! Bitte beachte unsere [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Sicherheit

Für Sicherheitsmeldungen siehe [SECURITY.md](./SECURITY.md).

---

## Lizenz

Derzeit ohne Open-Source-Lizenz. Siehe [LICENSE.md](./LICENSE.md).

---

## Kontakt

Projektleitung: [@mugglman](https://github.com/mugglman)
