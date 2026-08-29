# Rollen und Berechtigungen

> Status: Entwurf. Dies ist eine kompakte Rollenübersicht, noch keine vollständige Berechtigungsmatrix.
>
> **Synchronisiert am 2026-08-17** mit [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md) und [ARCHITEKTUR_FINALISIERUNG.md](../ARCHITEKTUR_FINALISIERUNG.md). Der vollständige Permission-Katalog befindet sich in `ARCHITEKTUR_FINALISIERUNG.md`, Abschnitt 5.
>
> **Ergänzt am 2026-08-20 (Phase 5):** Vereinsrollen sind erstmals über die Anwendung verwaltbar (`GET/POST /api/v1/persons/:personId/roles`, `DELETE .../roles/:roleAssignmentId`, Web-UI in der Personenverwaltung) — ausschließlich durch `TENANT_ADMIN` des eigenen Vereins, siehe [PHASE_5_ROLE_MANAGEMENT_REPORT.md](../PHASE_5_ROLE_MANAGEMENT_REPORT.md). Die Scope-Spalte der Vereinsrollen-Tabelle unten ist dabei kein reiner Fachhinweis mehr, sondern wird applikationsseitig durchgesetzt (eine Rolle kann nur mit ihrem dokumentierten Scope vergeben werden). Weiterhin **nicht** verwaltbar: Plattformrollen (`PlatformRoleAssignment`, siehe unten) und individuelle Einzelberechtigungen (kein Permission-Editor).
>
> **Ergänzt am 2026-08-23 (Phase 9):** Fußball-Saisonverwaltung (`Season`/`AgeGroup`/`TeamSeason`) verwendet ausschließlich den bestehenden Rollenkatalog — **keine neuen Rollen**. `TENANT_ADMIN` kann Saisons/Altersklassen/Mannschaftszuordnungen aller Abteilungen lesen/anlegen/bearbeiten. `DEPARTMENT_ADMIN` einer `DEPARTMENT`-Scope-Rolle in einer Fußballabteilung kann Saisons und `TeamSeason`-Einträge **nur seiner eigenen Abteilung** lesen/anlegen/bearbeiten (z. B. keine Tennis-Saison). Ein `TEAM`-Scope wie `COACH` kann die aktive Saison seiner Abteilung sowie den `TeamSeason`-Eintrag des eigenen Teams lesen, aber weder die Saison noch fremde `TeamSeason`-Einträge bearbeiten. `AgeGroup` ist tenant-weite Stammdatenverwaltung: Lesen für jede aktive `RoleAssignment`, Anlegen/Bearbeiten ausschließlich `TENANT_ADMIN` (bewusst kein `DEPARTMENT_ADMIN`-Sonderfall, da Altersklassen abteilungsübergreifend gültige Stammdaten sind). Details: [PHASE_9_FOOTBALL_SEASON_REPORT.md](../PHASE_9_FOOTBALL_SEASON_REPORT.md).
>
> **Ergänzt am 2026-08-27 (Phase 10):** Spielstätten-/Spielverwaltung (`Venue`/`FootballMatch`) — weiterhin **keine neuen Rollen**. `Venue` ist tenant-weite Stammdatenverwaltung nach demselben Muster wie `AgeGroup`: Lesen für jede aktive `RoleAssignment`, Anlegen/Bearbeiten ausschließlich `TENANT_ADMIN` (bewusst kein `DEPARTMENT_ADMIN`-Sonderfall, eine Spielstätte kann abteilungs-/sportartenübergreifend geteilt werden). `FootballMatch` hingegen erlaubt — anders als `TeamSeason` — auch `COACH` und `TEAM_MANAGER` des eigenen Teams, Spiele anzulegen/zu bearbeiten (nicht nur zu lesen): ein Spiel ist eine alltägliche Trainer-Aufgabe, keine administrative Mannschaftsverwaltung. `ASSISTANT_COACH` und andere `TEAM`-Scope-Rollen (z. B. `PLAYER`) dürfen die Spiele des eigenen Teams lesen, aber nicht anlegen/bearbeiten. `DEPARTMENT_ADMIN` verwaltet weiterhin alle Spiele der eigenen Abteilung, nicht fremder Abteilungen. Details: [PHASE_10_MATCH_FOUNDATION_REPORT.md](../PHASE_10_MATCH_FOUNDATION_REPORT.md).
>
> **Ergänzt am 2026-08-29 (Phase 11):** Turnier-Grundmodell (`FootballTournament`/`TournamentParticipant`/`TournamentVenue`/`TournamentGroup`) — weiterhin **keine neuen Rollen** (insbesondere kein `TURNIERLEITER`, bewusst zurückgestellt, siehe [PHASE_11_TOURNAMENT_CORE_REPORT.md](../PHASE_11_TOURNAMENT_CORE_REPORT.md)). Abweichend vom `FootballMatch`-Muster (Phase 10) ist die Turnierverwaltung enger gefasst: **nur** `TENANT_ADMIN` und `DEPARTMENT_ADMIN` der eigenen Fußballabteilung dürfen Turniere/Teilnehmer/Gruppen/Spielstätten-Zuordnungen anlegen und bearbeiten. `COACH`/`TEAM_MANAGER`/`ASSISTANT_COACH` (`TEAM`-Scope) dürfen Turniere ihrer Abteilung nur **lesen**, nicht anlegen — anders als bei normalen Vereinsmatches ist eine Turnieranmeldung/-organisation für den MVP bewusst eine administrative, keine alltägliche Trainer-Aufgabe. Die Autorisierung ist technisch eine direkte Wiederverwendung von `canOnSeason` (kein eigenständiges `canOnTournament`), da die Regeln identisch sind. Turniermatches (`FootballMatch` mit `tournamentId`) werden **nicht** über `canOnMatch` autorisiert wie normale Vereinsmatches, sondern ebenfalls über `canOnSeason` der Turnier-Abteilung — es gibt bei einem Turniermatch kein eindeutiges "eigenes Team", über das `canOnMatch` entscheiden könnte (beide Seiten sind `TournamentParticipant`, ggf. beide extern). Details: [PHASE_11_TOURNAMENT_CORE_REPORT.md](../PHASE_11_TOURNAMENT_CORE_REPORT.md), [ADR 0008](../architecture/adr/0008-tournament-match-model.md).

## Grundprinzipien

- rollenbasierte Zugriffssteuerung (RBAC) + kontextabhängige Beziehungs-Policies (siehe letzter Punkt)
- Rechte gelten grundsätzlich im Kontext eines Mandanten (Vereins), siehe [Multi-Tenancy.md](../architecture/Multi-Tenancy.md)
- Rollen sind zusätzlich scope-basiert: eine Rolle gilt auf Vereinsebene (`TENANT`), Abteilungsebene (`DEPARTMENT`) oder Mannschaftsebene (`TEAM`); eine Person kann mehrere Rollen in unterschiedlichen Scopes gleichzeitig innehaben
- Least Privilege: Jede Rolle erhält nur die Rechte, die für ihre Aufgabe notwendig sind
- normale Vereinsrollen besitzen keine globalen Plattformrechte
- feinere, granularere Berechtigungen sind später möglich, aber nicht Teil dieser ersten Übersicht
- **Elternschaft/Sorgeberechtigung ist keine RBAC-Rolle**, sondern eine eigenständige, verifizierungspflichtige Beziehung zwischen zwei Personen (`PersonRelationship`). Eltern beziehungsweise Sorgeberechtigte sehen ausschließlich die ihnen über diese Beziehung zugeordneten Kinder — durchgesetzt über eine kontextabhängige Policy, nicht über den Rollenkatalog unten. Details siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md), Abschnitt 6.

## Plattformrollen

Plattformrollen sind organisatorisch von Vereinsrollen getrennt und wirken mandantenübergreifend auf Plattformebene.

| Rolle | Beschreibung |
|---|---|
| Platform Owner | Höchste plattformweite Verantwortung |
| Platform Administrator | Administrative Verwaltung der Plattform |
| Platform Support | Unterstützung und Support auf Plattformebene |

## Vereinsrollen

Vereinsrollen gelten jeweils im Kontext eines konkreten Vereins (Mandanten) und zusätzlich innerhalb eines konkreten Scopes.

| Rolle | Technischer Bezeichner | Scope | Beschreibung |
|---|---|---|---|
| Vereinsadministrator (inkl. Vorstand) | `TENANT_ADMIN` | TENANT | Administrative Verwaltung des Vereins. Vorstand erhält im MVP dieselben Rechte wie Vereinsadministrator, keine separate Rolle ohne konkreten Differenzierungsbedarf. |
| Abteilungsleiter | `DEPARTMENT_ADMIN` | DEPARTMENT | Verantwortung für eine Abteilung |
| Jugendleiter | `YOUTH_DIRECTOR` | DEPARTMENT | Verantwortung für den Jugendbereich einer Abteilung |
| Mannschaftsadministrator | `TEAM_MANAGER` | TEAM | Administrative Verwaltung einer Mannschaft |
| Trainer | `COACH` | TEAM | Fachliche Leitung einer Mannschaft |
| Betreuer | `ASSISTANT_COACH` | TEAM | Unterstützung von Trainer und Mannschaft |
| Spieler | `PLAYER` | TEAM | Mitglied einer konkreten Mannschaft |
| Mitglied | `MEMBER` | TENANT | Vereinsmitglied ohne (weitere) Mannschaftszuordnung |
| Gast | `GUEST` | TENANT | Eingeschränkter, nicht-mitgliedschaftlicher Zugriff |

**Elternteil/Sorgeberechtigter ist bewusst nicht Teil dieses Katalogs** — siehe Grundprinzipien oben und `PersonRelationship`.

## Mandantenkontext

Ein Benutzer (`User`) kann in mehreren Vereinen jeweils unterschiedliche Rollen innehaben — technisch vermittelt über je eine `Person` pro Verein, mit eigenen `RoleAssignment`s. Eine Rolle in Verein A gilt ausschließlich für Verein A und gewährt keinen Zugriff auf Daten von Verein B. Details zur technischen Durchsetzung (Tenant-Kontext-Validierung, Row-Level-Security) siehe [ARCHITEKTUR_FINALISIERUNG.md](../ARCHITEKTUR_FINALISIERUNG.md), Abschnitte 7–8.

## Bezug

- [Mandantenfähigkeit](../architecture/Multi-Tenancy.md)
- [Datenbank-Entwurf](../database/Database.md)
