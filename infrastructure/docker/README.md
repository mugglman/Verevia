# infrastructure/docker

Docker-bezogene Infrastrukturkonfiguration der Verevia-Plattform.

## Zweck

Dieses Verzeichnis enthält Dockerfiles und Compose-Konfigurationen für lokale Entwicklung sowie für die permanente DEV-Umgebung auf dem VPS (Produktivumgebung: perspektivisch, noch nicht umgesetzt).

## Status

Zwei unterschiedliche, nicht zu verwechselnde Compose-Dateien (Details siehe [Deployment](../../docs/deployment/Deployment.md)):

| Datei | Zweck |
|---|---|
| `docker-compose.yml` | Lokale Entwicklungsinfrastruktur auf dem eigenen Rechner eines Mitwirkenden — aktuell nur PostgreSQL 17. `apps/web`/`apps/api` laufen dabei weiterhin lokal über `pnpm dev`, nicht in Docker. |
| `docker-compose.dev-deploy.yml` | Die permanente DEV-Umgebung auf dem VPS (Phase 7, siehe [PHASE_7_DEV_DEPLOYMENT_REPORT.md](../../docs/PHASE_7_DEV_DEPLOYMENT_REPORT.md)) — Postgres + api + web als echte Container hinter Traefik unter `app.verevia.app`/`api.verevia.app`. Wird von `/srv/verevia/dev` aus betrieben, nicht von einer lokalen Entwicklungsmaschine. |

`api.Dockerfile`/`web.Dockerfile`: mehrstufige, reproduzierbare Builds (turbo prune + separater Produktions-Install ohne DevDependencies + non-root Runtime-User) für `@verevia/api`/`@verevia/web` — siehe die ausführlichen Kommentare in den Dateien selbst.

## Verwendung (lokale Entwicklung)

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

## Verwendung (VPS-DEV-Deployment)

Siehe [PHASE_7_DEV_DEPLOYMENT_REPORT.md](../../docs/PHASE_7_DEV_DEPLOYMENT_REPORT.md), Abschnitt "Deployment-Ablauf" — kurz zusammengefasst, ausgeführt aus `/srv/verevia/dev`:

```bash
docker compose build
docker compose run --rm migrate
docker compose up -d postgres api web
```
