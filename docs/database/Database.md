# Datenbank

> Status: Fachlicher Entwurf. Es existiert noch **kein** endgültiges Prisma-Schema und keine Datenbankmigration. Dieses Dokument beschreibt die fachlichen Entitäten und ihre Beziehungen als Grundlage für die spätere technische Umsetzung.
>
> **Synchronisiert am 2026-08-17** mit den Entscheidungen aus [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md) und [ARCHITEKTUR_FINALISIERUNG.md](../ARCHITEKTUR_FINALISIERUNG.md): `Membership` ist kein Rollenträger mehr, Rollen sind scope-basiert (`RoleAssignment`), Eltern-Kind-Beziehungen sind ein eigenständiges Konzept (`PersonRelationship`), Plattformrollen sind von Vereinsrollen technisch getrennt (`PlatformRoleAssignment`). Details und Begründung siehe dort.

## Zweck

Dieses Dokument beschreibt den fachlichen Entwurf des Datenmodells von Verevia. Es dient als gemeinsames Verständnis zwischen Fachlichkeit und technischer Umsetzung, bevor ein konkretes Datenbankschema erstellt wird.

## Zentrale Entitäten

| Entität | Beschreibung |
|---|---|
| Tenant (Verein) | Der Mandant. Jeder Verein ist ein eigener Tenant. |
| Sport (Sportart) | Plattformweite, nicht mandantenbezogene Stammdatentabelle (Fußball, Tennis, Stockschützen, …). Wird von `Department` referenziert. |
| Department (Abteilung) | Eine Abteilung innerhalb eines Vereins (z. B. Fußball), referenziert genau eine `Sport`. Gehört zu genau einem Tenant. |
| Team (Mannschaft) | Eine Mannschaft innerhalb einer Abteilung. Gehört zu einem Verein oder ist einer Spielgemeinschaft zugeordnet. |
| User | Ein technischer Login-Account. **Nicht** mandantenbezogen, enthält ausschließlich Auth-relevante Daten (E-Mail, Passwort-Hash, Verifizierungsstatus). Kann über `Membership` mit `Person`-Datensätzen in mehreren Vereinen verknüpft sein. Existiert unabhängig davon, ob eine Person tatsächlich einen Account hat. |
| Person (Mitglied) | Eine natürliche Person als Vereinsmitglied, **mandantenbezogen** (`tenantId` Pflichtfeld), unabhängig davon, ob sie einen `User`-Account besitzt. Trägerin aller fachlichen Verknüpfungen (Rollen, Beziehungen, Anwesenheit). |
| Membership | Reine Verknüpfung zwischen `User` (Login) und `Person` (Vereinsmitglied) — **kein Rollenträger**. Bedeutet "dieser Login-Account ist diese Person". Rollen hängen an `Person`, siehe `RoleAssignment`. |
| RoleAssignment | Verknüpft eine `Person` mit einer `Role` in einem konkreten Scope (`TENANT`, `DEPARTMENT` oder `TEAM`, über nullable Fremdschlüssel `departmentId`/`teamId`). Eine Person kann beliebig viele `RoleAssignment`s in unterschiedlichen Scopes gleichzeitig besitzen. |
| Role | Eine Rolle innerhalb eines Vereins (z. B. Trainer, Vereinsadministrator), einsetzbar über `RoleAssignment` mit beliebigem Scope. |
| Permission | Eine einzelne Berechtigung, die einer Rolle zugeordnet werden kann. |
| PlatformRoleAssignment | Verknüpft einen `User` direkt (ohne Umweg über `Person`/Tenant) mit einer mandantenübergreifenden Plattformrolle (`Platform Owner/Administrator/Support`). |
| PersonRelationship | Gerichtete, verifizierungspflichtige Beziehung zwischen zwei `Person`-Datensätzen desselben Tenants (z. B. `PARENT`, `LEGAL_GUARDIAN`, `EMERGENCY_CONTACT`). Bildet Eltern-Kind-Beziehungen ab — **keine RBAC-Rolle**, siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md), Abschnitt 6. Ersetzt die früheren Entitäten `Guardian`/`GuardianRelation`. |
| Coach (Trainer) | Fachlich abgebildet über `RoleAssignment` mit Rolle `COACH`/`ASSISTANT_COACH` und Scope `TEAM` — keine eigene Entität mehr nötig. |
| Season (Saison) | Zeitlicher Rahmen, dem Mannschaften, Kalendereinträge und Turniere zugeordnet werden. |
| Event (Termin) | Ein Kalendereintrag, z. B. Training oder Besprechung. |
| Attendance (Anwesenheit) | Zu- oder Absage sowie tatsächliche Anwesenheit einer Person zu einem `Event`. |
| Task (Aufgabe) | Eine einer Mannschaft oder Person zugeordnete Aufgabe. |
| Tournament (Turnier) | Ein geplantes oder durchgeführtes Turnier. |
| TournamentTeam | Zuordnung einer teilnehmenden Mannschaft zu einem Turnier. |
| Match (Spiel) | Eine einzelne Begegnung innerhalb eines Turniers oder Spielplans. |
| Venue (Austragungsort) | Ort, an dem ein `Event` oder `Match` stattfindet. |
| Notification | Eine an einen Benutzer gesendete Mitteilung (z. B. Push-Mitteilung). |
| AuditLog | Protokoll sicherheits- oder nachvollziehbarkeitsrelevanter Änderungen. |
| JointTeam (Spielgemeinschaft) | Zusammenschluss mehrerer Vereine zu einer gemeinsamen Mannschaft. |
| JointTeamTenant | Zuordnung eines beteiligten Vereins (Tenant) zu einer `JointTeam`, inklusive Kennzeichnung des federführenden Vereins. |

## Mandantenzuordnung

Jede mandantenbezogene Entität (unter anderem `Department`, `Team`, `Person`, `Event`, `Task`, `Tournament`) besitzt eine eindeutige, verpflichtende Zuordnung zu einem `Tenant` (Verein). Diese Zuordnung ist Grundlage der strikten Datenisolation, siehe [Multi-Tenancy.md](../architecture/Multi-Tenancy.md).

## Beziehungen (Auswahl)

- Ein `Tenant` hat mehrere `Department`.
- Ein `Department` hat mehrere `Team`.
- Ein `Team` gehört zu genau einem `Tenant` oder ist über `JointTeamTenant` mehreren an einer Spielgemeinschaft beteiligten Vereinen zugeordnet.
- Ein `User` hat mehrere `Membership`-Einträge, jeweils verknüpft mit genau einer `Person` (die wiederum genau einem `Tenant` zugeordnet ist). `Membership` selbst trägt keine Rolle.
- Eine `Person` hat mehrere `RoleAssignment`, jeweils mit genau einer `Role` und einem Scope (`TENANT`, `DEPARTMENT` oder `TEAM`).
- Eine `Role` hat mehrere `Permission`.
- Ein `User` kann mehrere `PlatformRoleAssignment` besitzen (mandantenübergreifend, unabhängig von `Person`/`Membership`).
- Eine `Person` kann mehrere `PersonRelationship` als Ursprung (z. B. Elternteil) und/oder als Ziel (z. B. Kind) besitzen — gerichtet, nicht bidirektional gespeichert.
- Rolle "Trainer" wird als `RoleAssignment` (Rolle `COACH`/`ASSISTANT_COACH`, Scope `TEAM`) abgebildet, nicht als eigene Entität.
- Ein `Event` gehört zu einem `Team` oder `Department` und optional zu einer `Season` und einem `Venue`.
- Eine `Attendance` verknüpft eine `Person` mit einem `Event`.
- Ein `Tournament` hat mehrere `TournamentTeam`, die wiederum mehrere `Match` austragen.
- Eine `JointTeam` hat mehrere `JointTeamTenant`, von denen genau einer als federführend gekennzeichnet ist.

## Spielgemeinschaften im Datenmodell

Die Entitäten `JointTeam` und `JointTeamTenant` bilden ab, dass mehrere Vereine gemeinsam eine Mannschaft stellen können, ohne dass die beteiligten Vereine ihre Eigenständigkeit als Mandant verlieren. Zugriffsrechte auf gemeinsame Mannschaftsdaten werden über die Rollen- und Rechteverwaltung je beteiligtem Verein gesteuert.

## Auditierbarkeit

Sicherheits- und nachvollziehbarkeitsrelevante Änderungen (z. B. Rollenänderungen, Zugriffe auf sensible Daten) werden über `AuditLog`-Einträge dokumentiert. Der konkrete Umfang der Protokollierung wird im Zuge der technischen Umsetzung festgelegt.

## Datenschutz

Das Datenmodell enthält personenbezogene Daten, unter anderem von Minderjährigen (`Person`) und deren Erziehungsberechtigten (verknüpft über `PersonRelationship`). Bei der technischen Umsetzung ist zu berücksichtigen:

- Datensparsamkeit: Es werden nur Daten erhoben, die für den jeweiligen Zweck erforderlich sind.
- Zugriffsbeschränkung entsprechend der Rollen- und Rechteverwaltung (siehe [Roles-and-Permissions.md](../product/Roles-and-Permissions.md)).
- Strikte Mandantentrennung über `tenant_id` beziehungsweise die entsprechende Zuordnung zu `Tenant`.

## Hinweis

Dieses Datenmodell ist ein **fachlicher Entwurf**. Es dient der Abstimmung vor der technischen Umsetzung und wird im Rahmen der Implementierung (Prisma-Schema) verfeinert und kann sich ändern.
