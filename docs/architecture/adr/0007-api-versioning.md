# 0007 – API-Versionierung: URI-basiert unter `/api/v1`

## Status

Angenommen

## Kontext

Mit dem ersten fachlichen Vertical Slice (Verein → Abteilung → Mannschaft, Phase 3) entstehen die ersten öffentlichen REST-Endpunkte in `apps/api`. Es existierte bisher keine dokumentierte Entscheidung zur API-Versionierung.

## Entscheidung

URI-basierte Versionierung unter dem Präfix `/api/v1/…`, umgesetzt über NestJS' eingebautes Versionierungssystem (`VersioningType.URI`, `defaultVersion: "1"`) kombiniert mit einem globalen Pfad-Präfix `api` (`app.setGlobalPrefix("api")`). Controller deklarieren keine Version explizit, sondern erhalten sie über die globale Standardversion — neue Versionen werden erst eingeführt, wenn ein Breaking Change tatsächlich eintritt (`@Controller({ version: "2" })` auf den betroffenen Controllern), nicht vorsorglich für jeden Endpunkt einzeln.

Bewusst **nicht** gewählt:

- Header-basierte Versionierung (`Accept-Version`) — für REST-Clients (Web-App, künftige mobile Clients) ist eine sichtbare URL einfacher zu debuggen und zu cachen.
- Media-Type-Versionierung (`Accept: application/vnd.verevia.v1+json`) — unnötige Komplexität für den aktuellen Bedarf.
- Eigenes Versionierungs-Middleware/-Modul — NestJS bringt URI-Versionierung nativ mit, keine zusätzliche Abhängigkeit nötig.

## Konsequenzen

- Alle fachlichen Endpunkte liegen unter `/api/v1/…` (z. B. `/api/v1/club`, `/api/v1/departments`, `/api/v1/teams`).
- `/health`, `/health/ready` und `/api/auth/*` (better-auth) bleiben bewusst **außerhalb** der Versionierung/des `api`-Präfixes — betriebliche bzw. bereits extern (better-auth-Konvention) festgelegte Pfade, keine fachlichen Domain-Endpunkte.
- Eine spätere v2 erfordert keine Änderung an bestehenden v1-Controllern, nur einen neuen, parallel existierenden Controller-Satz mit `version: "2"`.

## Bezug

- [Architektur](../Architecture.md)
- [Phase-3-Bericht](../../PHASE_3_CLUB_STRUCTURE_REPORT.md)
