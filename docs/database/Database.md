# Datenbank

> Status: Fachlicher Entwurf. Es existiert noch **kein** endgültiges Prisma-Schema und keine Datenbankmigration. Dieses Dokument beschreibt die fachlichen Entitäten und ihre Beziehungen als Grundlage für die spätere technische Umsetzung.

## Zweck

Dieses Dokument beschreibt den fachlichen Entwurf des Datenmodells von Verevia. Es dient als gemeinsames Verständnis zwischen Fachlichkeit und technischer Umsetzung, bevor ein konkretes Datenbankschema erstellt wird.

## Zentrale Entitäten

| Entität | Beschreibung |
|---|---|
| Tenant (Verein) | Der Mandant. Jeder Verein ist ein eigener Tenant. |
| Department (Abteilung) | Eine Abteilung innerhalb eines Vereins (z. B. Fußball). Gehört zu genau einem Tenant. |
| Team (Mannschaft) | Eine Mannschaft innerhalb einer Abteilung. Gehört zu einem Verein oder ist einer Spielgemeinschaft zugeordnet. |
| User | Ein technischer Benutzeraccount. Kann mehreren Vereinen über `Membership` angehören. |
| Membership | Verknüpfung zwischen `User` und `Tenant`, Träger der Rollenzuordnung. |
| Role | Eine Rolle innerhalb eines Vereins (z. B. Trainer, Vorstand). |
| Permission | Eine einzelne Berechtigung, die einer Rolle zugeordnet werden kann. |
| Person (Mitglied) | Eine natürliche Person als Vereinsmitglied, unabhängig davon, ob sie einen `User`-Account besitzt. |
| Guardian (Sorgeberechtigter) | Eine Person mit Sorgeberechtigung für ein minderjähriges Mitglied. |
| GuardianRelation | Verknüpfung zwischen `Guardian` und `Person` (Mitglied). |
| Coach (Trainer) | Zuordnung einer Person als Trainer zu einer oder mehreren Mannschaften. |
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
- Ein `User` hat mehrere `Membership`-Einträge, jeweils verknüpft mit genau einem `Tenant` und einer oder mehreren `Role`.
- Eine `Role` hat mehrere `Permission`.
- Eine `Person` kann mehrere `GuardianRelation` zu einem oder mehreren `Guardian` besitzen.
- Ein `Coach` ist einer `Person` sowie einem oder mehreren `Team` zugeordnet.
- Ein `Event` gehört zu einem `Team` oder `Department` und optional zu einer `Season` und einem `Venue`.
- Eine `Attendance` verknüpft eine `Person` mit einem `Event`.
- Ein `Tournament` hat mehrere `TournamentTeam`, die wiederum mehrere `Match` austragen.
- Eine `JointTeam` hat mehrere `JointTeamTenant`, von denen genau einer als federführend gekennzeichnet ist.

## Spielgemeinschaften im Datenmodell

Die Entitäten `JointTeam` und `JointTeamTenant` bilden ab, dass mehrere Vereine gemeinsam eine Mannschaft stellen können, ohne dass die beteiligten Vereine ihre Eigenständigkeit als Mandant verlieren. Zugriffsrechte auf gemeinsame Mannschaftsdaten werden über die Rollen- und Rechteverwaltung je beteiligtem Verein gesteuert.

## Auditierbarkeit

Sicherheits- und nachvollziehbarkeitsrelevante Änderungen (z. B. Rollenänderungen, Zugriffe auf sensible Daten) werden über `AuditLog`-Einträge dokumentiert. Der konkrete Umfang der Protokollierung wird im Zuge der technischen Umsetzung festgelegt.

## Datenschutz

Das Datenmodell enthält personenbezogene Daten, unter anderem von Minderjährigen (`Person`) und deren Sorgeberechtigten (`Guardian`). Bei der technischen Umsetzung ist zu berücksichtigen:

- Datensparsamkeit: Es werden nur Daten erhoben, die für den jeweiligen Zweck erforderlich sind.
- Zugriffsbeschränkung entsprechend der Rollen- und Rechteverwaltung (siehe [Roles-and-Permissions.md](../product/Roles-and-Permissions.md)).
- Strikte Mandantentrennung über `tenant_id` beziehungsweise die entsprechende Zuordnung zu `Tenant`.

## Hinweis

Dieses Datenmodell ist ein **fachlicher Entwurf**. Es dient der Abstimmung vor der technischen Umsetzung und wird im Rahmen der Implementierung (Prisma-Schema) verfeinert und kann sich ändern.
