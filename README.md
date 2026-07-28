# Verevia

> Die Plattform für moderne Vereine

**Status:** Frühe Planungs- und Aufbauphase

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
- **Skalierbar**: Vorbereitet für zukünftige Microservices-Umstellung

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

## Technologiestack (Vorläufig)

> **Hinweis**: Der Stack ist vorbereitend gewählt und kann sich noch ändern. Keine Frameworks sind noch installiert.

| Bereich | Technologie | Status |
|---------|-------------|--------|
| Monorepo | pnpm Workspaces + Turborepo | Geplant |
| Web-Frontend | Next.js + TypeScript + React | Geplant |
| Backend | NestJS + TypeScript | Geplant |
| Datenbank | PostgreSQL | Geplant |
| ORM | Prisma | Geplant |
| Mobile | Progressive Web App | Geplant |
| Container | Docker | Geplant |
| Reverse Proxy | Traefik / Caddy | Offen |
| CI/CD | GitHub Actions | Geplant |
| Hosting | VPS | Geplant |
| Monitoring | Uptime Kuma / Grafana | Geplant |

---

## Verzeichnisstruktur

```text
Verevia/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── apps/
│   ├── web/           (Next.js Frontend)
│   ├── api/           (NestJS Backend)
│   └── admin/         (Admin Dashboard)
├── packages/
│   ├── ui/            (Shared UI Components)
│   ├── types/         (Shared TypeScript Types)
│   ├── config/        (Shared Config)
│   └── utils/         (Shared Utilities)
├── docs/
│   ├── architecture/  (Technische Architektur)
│   ├── branding/      (Markenrichtlinien)
│   ├── database/      (Datenbankschema)
│   ├── deployment/    (Deployment-Guide)
│   ├── modules/       (Modulbeschreibungen)
│   ├── product/       (Produktdokumentation)
│   └── roadmap/       (Projekt-Roadmap)
├── infrastructure/
│   ├── docker/
│   ├── proxy/
│   └── scripts/
├── .editorconfig
├── .env.example
├── .gitattributes
├── .gitignore
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE.md
└── SECURITY.md
```

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

⚠️ **Wichtig**: Dieses Repository enthält derzeit **keine lauffähige Anwendung**.

Es dokumentiert:

- Projektstruktur und Organisation
- Technische Architektur
- Marken- und Produktidentität
- Entwicklungsrichtlinien
- Roadmap und Phase

Die eigentliche Entwicklung startet in Phase 1.

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
