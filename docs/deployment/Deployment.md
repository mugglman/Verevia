# Deployment

> Status: Entwurf. Es existiert noch keine lauffähige Anwendung und keine produktive Infrastruktur. Dieses Dokument beschreibt die geplante Zielausstattung.

## Grundsätze

- Docker-fähig: Anwendungen sollen containerisiert betrieben werden können.
- CI/CD-fähig: Auslieferung über automatisierte Pipelines (GitHub Actions).
- Trennung von Anwendung, Infrastruktur und Dokumentation im Repository.
- Saubere Trennung von Entwicklungs-, Test- und Produktivumgebung.

## Vorläufiger Infrastruktur-Stack

| Bereich | Vorläufige Technologie | Status |
|---|---|---|
| Container | Docker | Geplant |
| Reverse Proxy | Traefik oder Caddy | Offen |
| CI/CD | GitHub Actions | Geplant |
| Hosting | VPS | Geplant |
| Monitoring | Uptime Kuma, später eventuell Grafana | Geplant |
| Entwicklungs-E-Mail | Mailpit | Geplant |
| Produktive E-Mail | externer SMTP- oder Transaktionsmail-Anbieter | Offen |

## Geplante Domains

| Domain | Zweck | Status |
|---|---|---|
| verevia.app | Öffentliche Landingpage | Geplant |
| app.verevia.app | Hauptanwendung | Geplant |
| api.verevia.app | Backend-API | Geplant |
| auth.verevia.app | Authentifizierung | Geplant |
| admin.verevia.app | Plattformadministration | Geplant |
| docs.verevia.app | Dokumentation | Geplant |
| status.verevia.app | Statusseite | Geplant |

### Mögliche spätere Subdomains

Die folgenden Subdomains sind als mögliche spätere Ausbaustufen dokumentiert, aber **noch nicht umgesetzt und noch nicht final entschieden**:

- dev.verevia.app
- staging.verevia.app
- demo.verevia.app
- cdn.verevia.app
- media.verevia.app
- files.verevia.app
- push.verevia.app
- mail.verevia.app
- ws.verevia.app

## Umgebungen

Es ist eine Trennung zwischen Entwicklungs-, Test- und Produktivumgebung vorgesehen. Die konkrete technische Ausgestaltung jeder Umgebung (z. B. eigene Subdomains, eigene Datenbanken, eigene Konfigurationswerte über `.env`) wird im Rahmen von Phase 1 der [Roadmap](../roadmap/Roadmap.md) festgelegt.

## Monitoring

Vorgesehen ist zunächst eine einfache Verfügbarkeitsüberwachung über Uptime Kuma. Eine spätere Erweiterung um Grafana für detaillierteres Monitoring ist möglich, aber noch nicht beschlossen.

## Backups

Ein konkretes Backup-Konzept (Häufigkeit, Aufbewahrungsdauer, Wiederherstellungstests) ist noch nicht ausgearbeitet und muss vor Produktivbetrieb definiert werden.

## Offene Entscheidungen

- Traefik oder Caddy als Reverse Proxy
- konkreter VPS-Anbieter und Hosting-Konfiguration
- produktiver E-Mail-Anbieter
- detailliertes Backup- und Monitoring-Konzept
- Storage-Lösung für Dateien und Medien
