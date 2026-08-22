# Deployment

> Status (aktualisiert Phase 7, 2026-08-22): Eine permanente DEV-Umgebung läuft real auf dem Hostinger-VPS unter `https://app.verevia.app` / `https://api.verevia.app`, siehe [PHASE_7_DEV_DEPLOYMENT_REPORT.md](../PHASE_7_DEV_DEPLOYMENT_REPORT.md) für den vollständigen Bericht. **Produktivbetrieb existiert weiterhin nicht** — `verevia-prod` bleibt unangetastet, dieses Dokument beschreibt für den Produktivteil weiterhin die geplante Zielausstattung.

## Permanente DEV-Umgebung (Phase 7)

| Aspekt | Wert |
|---|---|
| Web | `https://app.verevia.app` (Next.js, Container `verevia-dev-web`) |
| API | `https://api.verevia.app` (NestJS, Container `verevia-dev-api`) |
| Datenbank | PostgreSQL 17, Container `verevia-dev-postgres`, **kein** veröffentlichter Host-Port |
| Reverse Proxy | die bestehende, bereits produktiv laufende `verevia-traefik`-Instanz (unverändert, nur neue Router-Labels an den beiden neuen Containern) |
| HTTPS | Let's-Encrypt-Zertifikate über Traefiks bestehenden `letsencrypt`-Resolver |
| Deployment-Pfad auf dem VPS | `/srv/verevia/dev` — ein echter Git-Checkout dieses Repositories |
| Docker-Netzwerke | `verevia-dev` (intern, Postgres↔api/web), `verevia-proxy` (Traefik↔api/web) — beide bereits vor Phase 7 auf dem VPS vorbereitet |

Build-/Compose-Konfiguration: [infrastructure/docker/api.Dockerfile](../../infrastructure/docker/api.Dockerfile), [web.Dockerfile](../../infrastructure/docker/web.Dockerfile), [docker-compose.dev-deploy.yml](../../infrastructure/docker/docker-compose.dev-deploy.yml). Deployment-Ablauf, Secrets-Konzept, Backup, Sicherheitsprüfung: siehe [PHASE_7_DEV_DEPLOYMENT_REPORT.md](../PHASE_7_DEV_DEPLOYMENT_REPORT.md).

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
| CI/CD | GitHub Actions | Im Einsatz für Quality Gates (`.github/workflows/ci.yml`); Image-Build/-Push (GHCR) für Deployments noch nicht automatisiert — Images werden aktuell direkt auf dem VPS gebaut, siehe [PHASE_7_DEV_DEPLOYMENT_REPORT.md](../PHASE_7_DEV_DEPLOYMENT_REPORT.md) |
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

Für die DEV-Umgebung existiert seit Phase 7 eine Baseline: [`infrastructure/scripts/backup-dev-db.sh`](../../infrastructure/scripts/backup-dev-db.sh), ein einfacher `pg_dump` nach `/srv/verevia/backups`, manuell oder per Cron ausführbar. Bewusst ohne Retention/Rotation/Offsite-Kopie — das bleibt, ebenso wie ein Restore-Test, ein späteres Arbeitspaket, ausdrücklich auch **vor** jedem Produktivbetrieb nachzuholen.

## Offene Entscheidungen

- produktiver E-Mail-Anbieter
- Backup-Retention/-Rotation/Offsite-Kopie, regelmäßiger Restore-Test
- Monitoring/Alerting über Docker-Healthchecks hinaus
- Storage-Lösung für Dateien und Medien
- automatisierter Image-Build/-Push (z. B. GHCR) statt Build direkt auf dem VPS
- Produktivumgebung insgesamt (eigenes Arbeitspaket, siehe [PHASE_7_DEV_DEPLOYMENT_REPORT.md](../PHASE_7_DEV_DEPLOYMENT_REPORT.md), „nächster empfohlener Schritt")
