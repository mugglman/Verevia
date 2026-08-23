# Deployment

> Status (aktualisiert Phase 8, 2026-08-23): Die permanente DEV-Umgebung auf dem Hostinger-VPS (`https://app.verevia.app` / `https://api.verevia.app`, seit Phase 7) wird seit Phase 8 automatisiert betrieben — Merge nach `main` → CI grün → Docker-Images gebaut und nach GHCR gepusht → automatischer Rollout auf dem VPS inkl. Backup, Migration und Healthchecks. Siehe [PHASE_7_DEV_DEPLOYMENT_REPORT.md](../PHASE_7_DEV_DEPLOYMENT_REPORT.md) und [PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md](../PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md) für die vollständigen Berichte. **Produktivbetrieb existiert weiterhin nicht** — `verevia-prod` bleibt unangetastet, dieses Dokument beschreibt für den Produktivteil weiterhin die geplante Zielausstattung.

## Permanente DEV-Umgebung (Phase 7, automatisiert seit Phase 8)

| Aspekt | Wert |
|---|---|
| Web | `https://app.verevia.app` (Next.js, Container `verevia-dev-web`) |
| API | `https://api.verevia.app` (NestJS, Container `verevia-dev-api`) |
| Datenbank | PostgreSQL 17, Container `verevia-dev-postgres`, **kein** veröffentlichter Host-Port |
| Reverse Proxy | die bestehende, bereits produktiv laufende `verevia-traefik`-Instanz (unverändert, nur neue Router-Labels an den beiden neuen Containern) |
| HTTPS | Let's-Encrypt-Zertifikate über Traefiks bestehenden `letsencrypt`-Resolver |
| Deployment-Pfad auf dem VPS | `/srv/verevia/dev` — ein echter Git-Checkout dieses Repositories |
| Docker-Netzwerke | `verevia-dev` (intern, Postgres↔api/web), `verevia-proxy` (Traefik↔api/web) — beide bereits vor Phase 7 auf dem VPS vorbereitet |
| Images | `ghcr.io/mugglman/verevia-api`, `ghcr.io/mugglman/verevia-web` — gebaut und gepusht von `.github/workflows/deploy-dev.yml`, getaggt mit `:dev` und dem Git-Short-SHA |
| Rollout-Trigger | automatisch nach jedem erfolgreichen CI-Lauf auf `main` (`workflow_run`), oder manuell per `workflow_dispatch` |
| Deployment-User (VPS) | `verevia-deploy` — eigener Linux-User, dediziertes SSH-Deployment-Ziel, **kein** persönlicher Zugang |

Build-/Compose-/Deployment-Konfiguration: [infrastructure/docker/api.Dockerfile](../../infrastructure/docker/api.Dockerfile), [web.Dockerfile](../../infrastructure/docker/web.Dockerfile), [docker-compose.dev-deploy.yml](../../infrastructure/docker/docker-compose.dev-deploy.yml), [.github/workflows/deploy-dev.yml](../../.github/workflows/deploy-dev.yml), [infrastructure/scripts/deploy-dev.sh](../../infrastructure/scripts/deploy-dev.sh). Deployment-Ablauf, Secrets-Konzept, Backup, Rollback, Sicherheitsprüfung: siehe [PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md](../PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md) (Phase-7-Baseline: [PHASE_7_DEV_DEPLOYMENT_REPORT.md](../PHASE_7_DEV_DEPLOYMENT_REPORT.md)).

## Grundsätze

- Docker-fähig: Anwendungen sollen containerisiert betrieben werden können.
- CI/CD-fähig: Auslieferung über automatisierte Pipelines (GitHub Actions).
- Trennung von Anwendung, Infrastruktur und Dokumentation im Repository.
- Saubere Trennung von Entwicklungs-, Test- und Produktivumgebung.

## Vorläufiger Infrastruktur-Stack

| Bereich | Technologie | Status |
|---|---|---|
| Container | Docker | **Im DEV-Einsatz** (Phase 7) |
| Reverse Proxy | Traefik | **Entschieden, im Einsatz** (seit vor Phase 1, DEV-Router seit Phase 7) |
| CI/CD | GitHub Actions | **Vollständig im Einsatz**: Quality Gates (`.github/workflows/ci.yml`, unverändert seit Phase 1) + Image-Build/-Push nach GHCR + automatischer DEV-Rollout (`.github/workflows/deploy-dev.yml`, Phase 8) |
| Hosting | Hostinger-VPS | **Im DEV-Einsatz** |
| Monitoring | Uptime Kuma, später eventuell Grafana | Geplant, noch nicht eingerichtet |
| Entwicklungs-E-Mail | Aktuell `ConsoleMailProvider` (siehe `apps/api/src/mail/`, Phase 6) statt Mailpit | Bewusst vereinfacht, kein Blocker |
| Produktive E-Mail | externer SMTP- oder Transaktionsmail-Anbieter | Offen |

## Geplante Domains

| Domain | Zweck | Status |
|---|---|---|
| verevia.app | Öffentliche Landingpage | Geplant |
| app.verevia.app | Hauptanwendung | **Live (DEV)** seit Phase 7 — zeigt die permanente DEV-Umgebung, kein Produktivbetrieb |
| api.verevia.app | Backend-API | **Live (DEV)** seit Phase 7 — siehe app.verevia.app |
| auth.verevia.app | Authentifizierung | Geplant — Auth läuft aktuell mit unter api.verevia.app (`/api/auth/*`), keine eigene Subdomain nötig, siehe [ADR 0002](../architecture/adr/0002-authentication-strategy.md) |
| admin.verevia.app | Plattformadministration | Geplant |
| docs.verevia.app | Dokumentation | Geplant |
| status.verevia.app | Statusseite | Geplant (DNS/Zertifikat bereits vorbereitet, kein Router konfiguriert) |

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

DEV ist seit Phase 7 real umgesetzt (siehe oben) — eigene Domains (`app.`/`api.verevia.app`), eigene Datenbank (`verevia-dev-postgres`, eigenes Docker-Netzwerk `verevia-dev`), eigene `.env` (`infrastructure/docker/.env` auf dem VPS, nie committed). Test-/Staging-Umgebung existiert weiterhin nicht (keine akute Notwendigkeit vor echtem Produktivbetrieb mit mehreren Vereinen — siehe `docs/ARCHITEKTUR_BERICHT.md`, Abschnitt 10). Produktivumgebung (`verevia-prod`-Netzwerk existiert bereits vorbereitet auf dem VPS, aber unbenutzt) bleibt ein späteres, eigenes Arbeitspaket.

## Monitoring

Vorgesehen ist zunächst eine einfache Verfügbarkeitsüberwachung über Uptime Kuma. Eine spätere Erweiterung um Grafana für detaillierteres Monitoring ist möglich, aber noch nicht beschlossen. Für die DEV-Umgebung existieren aktuell nur die Docker-Healthchecks der einzelnen Container (siehe `docker-compose.dev-deploy.yml`) — kein externes Monitoring/Alerting.

## Backups

[`infrastructure/scripts/backup-dev-db.sh`](../../infrastructure/scripts/backup-dev-db.sh) (Phase 7, erweitert Phase 8): ein `pg_dump` nach `/srv/verevia/backups`, jetzt mit SHA-taggten Dateinamen und einfacher zählbasierter Retention (Standard: die letzten 14 Dumps, siehe Skript-Kommentar). Läuft automatisch vor jedem automatisierten Deployment (siehe `deploy-dev.sh`) — ein fehlgeschlagenes Backup bricht das Deployment ab, bevor irgendetwas verändert wird. Ein echter Restore (in eine isolierte temporäre Datenbank, nicht die laufende DEV-DB) wurde in Phase 8 real getestet, siehe [PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md](../PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md). Weiterhin bewusst ohne Offsite-Kopie — das bleibt ein späteres Arbeitspaket, ausdrücklich auch **vor** jedem Produktivbetrieb nachzuholen.

## Offene Entscheidungen

- produktiver E-Mail-Anbieter
- Backup-Offsite-Kopie
- regelmäßiger (statt punktueller) Restore-Test
- Monitoring/Alerting über Docker-Healthchecks hinaus
- Storage-Lösung für Dateien und Medien
- Produktivumgebung insgesamt (eigenes Arbeitspaket, siehe [PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md](../PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md), „nächster empfohlener Schritt")
