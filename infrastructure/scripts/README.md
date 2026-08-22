# infrastructure/scripts

Betriebs- und Hilfsskripte der Verevia-Plattform.

## Zweck

Dieses Verzeichnis enthält Skripte für wiederkehrende Aufgaben im Betrieb, etwa Backups, Deployments oder Wartungsarbeiten.

## Status

`backup-dev-db.sh` (Phase 7, siehe [PHASE_7_DEV_DEPLOYMENT_REPORT.md](../../docs/PHASE_7_DEV_DEPLOYMENT_REPORT.md)): einfacher `pg_dump` der permanenten DEV-Datenbank nach `/srv/verevia/backups`, liest Zugangsdaten aus der (nicht versionierten) `.env` im Deployment-Verzeichnis. Bewusst minimal — kein Retention-/Rotations-/Offsite-Konzept, das bleibt ein späteres Arbeitspaket. Wird auf dem VPS nach `/srv/verevia/dev/backup-dev-db.sh` kopiert und von dort ausgeführt (erwartet die `.env` im selben Verzeichnis).
