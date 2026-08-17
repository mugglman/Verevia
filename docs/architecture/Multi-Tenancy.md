# Mandantenfähigkeit

> Status: Entwurf.
>
> **Synchronisiert am 2026-08-17** mit [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md) und [ARCHITEKTUR_FINALISIERUNG.md](../ARCHITEKTUR_FINALISIERUNG.md).

## Grundprinzip

Der Mandant in Verevia ist grundsätzlich **der Verein**. Jede vereinsbezogene Information wird eindeutig einem Mandanten zugeordnet.

## Benutzer, Personen und Vereine

- Ein Login-Account (`User`) ist **nicht** mandantenbezogen und enthält ausschließlich Auth-relevante Daten. Ein `User` kann über `Membership` mit `Person`-Datensätzen in mehreren Vereinen verknüpft sein.
- Eine `Person` (Vereinsmitglied) ist **mandantenbezogen** (`tenantId` Pflichtfeld) und existiert unabhängig davon, ob ein `User`-Account existiert — relevant insbesondere für minderjährige Mitglieder ohne eigenen Login. Details siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md), Abschnitt 4.
- `Membership` verknüpft `User` und `Person` ("dieser Login ist diese Person") und ist **kein Rollenträger**.
- Rollen (`RoleAssignment`) gelten immer im Kontext eines konkreten Vereins und zusätzlich innerhalb eines Scopes (`TENANT`, `DEPARTMENT` oder `TEAM`) — nicht global über die gesamte Plattform hinweg. Eine Rolle auf höherem Scope kaskadiert auf untergeordnete Scopes.
- Eine Person kann in unterschiedlichen Vereinen unterschiedliche Rollen besitzen, und innerhalb desselben Vereins gleichzeitig mehrere Rollen in unterschiedlichen Scopes (z. B. Trainer einer Jugendmannschaft und Spieler einer anderen Mannschaft).
- Eltern-Kind-Beziehungen sind **keine Rolle**, sondern eine eigenständige, gerichtete Beziehung (`PersonRelationship`) zwischen zwei `Person`-Datensätzen desselben Tenants.
- Der aktive Tenant-Kontext eines Requests wird serverseitig gegen die aktiven `Membership`-Einträge des `User` validiert, nie allein aus einem clientseitig übermittelten Wert übernommen. Details zur technischen Umsetzung (`SET LOCAL app.tenant_id`, Prisma-Transaktionskopplung) siehe [ARCHITEKTUR_FINALISIERUNG.md](../ARCHITEKTUR_FINALISIERUNG.md), Abschnitt 7.

## Datenisolation

- Sämtliche mandantenbezogenen Daten werden strikt über eine `tenant_id` (Verein) voneinander getrennt.
- Abfragen und Zugriffe erfolgen grundsätzlich im Kontext eines Mandanten.
- Normale Vereinsrollen besitzen keine globalen Plattformrechte und keinen Zugriff auf Daten anderer Vereine.

## Abteilungen und Mannschaften

- Abteilungen (`Department`) gehören zu genau einem Verein.
- Mannschaften (`Team`) gehören zu einem Verein oder, im Fall einer Spielgemeinschaft, organisatorisch zu einer Spielgemeinschaft mehrerer Vereine.

## Spielgemeinschaften

Mehrere Vereine können gemeinsam eine Spielgemeinschaft (`JointTeam`) bilden, um beispielsweise in bestimmten Altersklassen gemeinsame Mannschaften zu stellen.

Dabei gilt:

- Die beteiligten Vereine bleiben eigenständige Mandanten mit eigener Datenhoheit.
- Vertrauliche Daten eines beteiligten Vereins dürfen nicht mit anderen beteiligten Vereinen vermischt werden.
- Eine Mannschaft kann organisatorisch einer Spielgemeinschaft zugeordnet sein, ohne dass die beteiligten Vereine ihre Eigenständigkeit verlieren.
- Für jede Spielgemeinschaft muss ein federführender Verein bestimmbar sein.
- Der Zugriff auf gemeinsame Mannschaftsdaten (z. B. Kalender, Aufstellung) benötigt klar definierte Zugriffsrechte für alle beteiligten Vereine.

Die beteiligten Vereine einer Spielgemeinschaft werden über eine eigene Zuordnung (`JointTeamTenant`) verwaltet, siehe [Database.md](../database/Database.md).

## Plattformadministration

Plattformadministratoren (`Platform Owner`, `Platform Administrator`, `Platform Support`) sind organisatorisch strikt von Vereinsadministratoren getrennt. Sie besitzen plattformweite, mandantenübergreifende Rechte, die ausschließlich für den Betrieb der Plattform benötigt werden – nicht für den fachlichen Vereinsbetrieb.

## RLS-Implementierung (Phase 2, technischer Befund)

Row-Level-Security ist implementiert (`packages/database/prisma/migrations/`) und per Integrationstest gegen echtes PostgreSQL 17 verifiziert (siehe [PHASE_2_CORE_REPORT.md](../PHASE_2_CORE_REPORT.md)). Ein wichtiger, zunächst überraschender Befund dabei: Die über `POSTGRES_USER` im offiziellen `postgres`-Docker-Image angelegte Rolle ist automatisch **PostgreSQL-Superuser** — und Superuser umgehen Row-Level-Security **immer**, unabhängig von `FORCE ROW LEVEL SECURITY`. Die Anwendung (und alle Tests) verbinden deshalb über eine dedizierte, nicht-privilegierte Rolle (`verevia_app`, angelegt durch die Migration `add_non_superuser_app_role`) — die Superuser-Rolle wird ausschließlich für Migrationen verwendet. Diese Trennung gilt für jede Umgebung (lokal wie produktiv) gleichermaßen.

## Domains je Mandant

- Die zentrale Anwendung läuft zunächst einheitlich unter `app.verevia.app` für alle Vereine.
- Eigene Domains oder Subdomains je Verein sind als spätere Ausbaustufe vorgesehen, aber noch nicht umgesetzt.

## Bezug

- [Architektur](./Architecture.md)
- [Datenbank-Entwurf](../database/Database.md)
- [Rollen und Berechtigungen](../product/Roles-and-Permissions.md)
