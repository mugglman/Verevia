# Architektur

> Status: Entwurf. Diese Architektur beschreibt die geplante Zielarchitektur für Verevia. Sie wird mit fortschreitender Umsetzung verfeinert.

## Systemkontext

Verevia ist eine SaaS-Plattform, die Vereine, deren Abteilungen, Mannschaften und alle beteiligten Personen (Mitglieder, Trainer, Eltern, Vorstand, Organisatoren) digital verbindet. Der zahlende Kunde ist grundsätzlich der Verein. Die Plattform wird zentral betrieben und ist von Beginn an mandantenfähig ausgelegt.

## Modularer Monolith

Verevia wird in Phase 1 als **modularer SaaS-Monolith** aufgebaut, nicht als Microservices-Architektur.

Grundsätze:

- klare fachliche Modulgrenzen innerhalb der Anwendung (z. B. Mannschaften, Kalender, Turnierplan als eigenständige Module)
- Module kommunizieren über klar definierte Schnittstellen
- eine spätere Auslagerung einzelner Module in eigenständige Dienste bleibt architektonisch möglich, ist aber kein Ziel von Phase 1
- API-First: Alle Funktionen werden über eine Backend-API bereitgestellt, die auch von unterschiedlichen Frontends genutzt werden kann
- Mobile-First: alle Oberflächen werden für mobile Endgeräte priorisiert entworfen

## Monorepo

Der Code wird in einem Monorepo organisiert (pnpm Workspaces und Turborepo, vorläufig), unterteilt in:

- `apps/` – eigenständig lauffähige Anwendungen (Web-Frontend, Backend-API, Admin-Dashboard)
- `packages/` – gemeinsam genutzte Bibliotheken (UI-Komponenten, Typen, Konfiguration, Hilfsfunktionen)
- `infrastructure/` – Infrastruktur- und Betriebsressourcen (Docker, Reverse Proxy, Skripte)
- `docs/` – Dokumentation

## Frontend

Vorläufig geplant: Next.js mit TypeScript und React, umgesetzt als Progressive Web App für mobile Nutzbarkeit. Die Oberfläche folgt dem in [Brand-Identity.md](../branding/Brand-Identity.md) beschriebenen UI-Stil (Dashboard-orientiert, Light/Dark Mode, barrierearm).

## Backend

Vorläufig geplant: NestJS mit TypeScript als API-First-Backend. Das Backend stellt sämtliche fachliche Logik bereit, einschließlich Mandantentrennung, Rollen- und Rechteprüfung sowie der fachlichen Module.

## Datenbank

Vorläufig geplant: PostgreSQL als relationale Datenbank, Zugriff über Prisma als ORM. Der fachliche Entwurf der Entitäten ist in [Database.md](../database/Database.md) beschrieben. Es existiert noch kein endgültiges Datenbankschema.

## Authentifizierung

Die konkrete Authentifizierungslösung ist noch **nicht entschieden**. In Betracht gezogen werden unter anderem Auth.js und Keycloak. Unabhängig von der konkreten Lösung gilt:

- Benutzer können mehreren Vereinen angehören
- Rollen und Rechte gelten im Kontext eines Vereins (Mandanten), nicht global
- Plattformadministratoren sind organisatorisch von Vereinsadministratoren getrennt

## Mandantenfähigkeit

Details zur Mandantenfähigkeit sind in [Multi-Tenancy.md](./Multi-Tenancy.md) beschrieben. Kernprinzip: Der Mandant ist grundsätzlich der Verein, Daten werden strikt nach `tenant_id` getrennt.

## Rollen und Rechte

Verevia nutzt rollenbasierte Zugriffssteuerung (RBAC) nach dem Prinzip der geringsten Rechte (Least Privilege). Eine Übersicht der geplanten Rollen findet sich in [Roles-and-Permissions.md](../product/Roles-and-Permissions.md).

## Infrastruktur

Vorläufig geplant:

- Containerisierung mit Docker
- Reverse Proxy: Traefik oder Caddy (**noch nicht entschieden**)
- Hosting auf einem VPS
- CI/CD über GitHub Actions
- Monitoring über Uptime Kuma, perspektivisch ergänzt um Grafana
- Entwicklungs-E-Mail über Mailpit, produktiv über einen externen SMTP- oder Transaktionsmail-Anbieter (**noch nicht entschieden**)

Details siehe [Deployment.md](../deployment/Deployment.md).

## Domains und Routing

Die geplante Domainstruktur ist in [Deployment.md](../deployment/Deployment.md) sowie in der Haupt-README dokumentiert. Zentrale Anwendung zunächst unter `app.verevia.app`, mit Möglichkeit für eigene Domains je Verein zu einem späteren Zeitpunkt.

## Umgebungen

Es ist vorgesehen, zwischen Entwicklungs-, Test- und Produktivumgebung zu unterscheiden. Die konkrete Ausgestaltung (Hosting, CI/CD-Stufen, Datenhaltung je Umgebung) ist noch offen.

## Logging

Ein konkretes Logging-Konzept ist noch nicht festgelegt. Grundsätzlich soll Logging so gestaltet werden, dass keine personenbezogenen oder sensiblen Daten im Klartext protokolliert werden.

## Monitoring

Vorläufig geplant: Uptime Kuma für Basis-Verfügbarkeitsüberwachung, perspektivisch ergänzt um Grafana für tiefergehendes Monitoring.

## Backups

Ein konkretes Backup-Konzept (Frequenz, Aufbewahrung, Wiederherstellungstests) ist noch nicht festgelegt und wird vor Produktivbetrieb ausgearbeitet.

## Datenschutz

Verevia verarbeitet personenbezogene Daten, unter anderem von Minderjährigen (Mitglieder) und deren Sorgeberechtigten. Datenschutz wird als Grundprinzip von Beginn an berücksichtigt, unter anderem durch:

- strikte Mandantentrennung
- Zugriffsbeschränkung nach Rollen (z. B. sehen Eltern nur die ihnen zugeordneten Kinder)
- Vermeidung unnötiger Datenspeicherung

Eine vollständige datenschutzrechtliche Prüfung erfolgt vor Produktivbetrieb, siehe [Roadmap.md](../roadmap/Roadmap.md).

## Sicherheitsgrundsätze

- Least Privilege bei Rollen und Rechten
- strikte Trennung von Mandantendaten
- keine Zugangsdaten oder Geheimnisse im Repository (siehe `.env.example` und `.gitignore`)
- verantwortungsvoller Umgang mit Sicherheitsmeldungen, siehe [SECURITY.md](../../SECURITY.md)

## Offene Entscheidungen

- Reverse Proxy: Traefik oder Caddy
- Authentifizierungslösung (unter anderem Auth.js oder Keycloak in Betrachtung)
- konkrete Ausgestaltung von Logging und Monitoring im Detail
- Backup-Konzept
- Storage-Lösung für Dateien und Medien
- produktiver E-Mail-Anbieter
- endgültiges Lizenzmodell (siehe [LICENSE.md](../../LICENSE.md))
