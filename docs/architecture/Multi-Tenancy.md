# Mandantenfähigkeit

> Status: Entwurf.

## Grundprinzip

Der Mandant in Verevia ist grundsätzlich **der Verein**. Jede vereinsbezogene Information wird eindeutig einem Mandanten zugeordnet.

## Benutzer und Vereine

- Ein Benutzer (`User`) kann mehreren Vereinen angehören.
- Die Zuordnung eines Benutzers zu einem Verein erfolgt über eine Mitgliedschaft (`Membership`).
- Rollen (`Role`) gelten immer im Kontext eines konkreten Vereins, nicht global über die gesamte Plattform hinweg.
- Ein Benutzer kann in unterschiedlichen Vereinen unterschiedliche Rollen besitzen.

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

## Domains je Mandant

- Die zentrale Anwendung läuft zunächst einheitlich unter `app.verevia.app` für alle Vereine.
- Eigene Domains oder Subdomains je Verein sind als spätere Ausbaustufe vorgesehen, aber noch nicht umgesetzt.

## Bezug

- [Architektur](./Architecture.md)
- [Datenbank-Entwurf](../database/Database.md)
- [Rollen und Berechtigungen](../product/Roles-and-Permissions.md)
