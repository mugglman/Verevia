# infrastructure/docker

Docker-bezogene Infrastrukturkonfiguration der Verevia-Plattform.

## Zweck

Dieses Verzeichnis enthält perspektivisch Dockerfiles und Compose-Konfigurationen für lokale Entwicklung sowie für Test- und Produktivumgebungen.

## Status

`docker-compose.yml` stellt die lokale Entwicklungsinfrastruktur bereit (aktuell nur PostgreSQL 17; Redis wird erst ergänzt, wenn technisch benötigt). Dies ist **nicht** die Produktions-Infrastruktur — siehe [Deployment](../../docs/deployment/Deployment.md) für Traefik/VPS.

## Verwendung

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

`apps/web` und `apps/api` laufen weiterhin lokal über `pnpm dev`, nicht in Docker.
