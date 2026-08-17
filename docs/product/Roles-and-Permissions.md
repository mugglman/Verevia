# Rollen und Berechtigungen

> Status: Entwurf. Dies ist eine kompakte Rollenübersicht, noch keine vollständige Berechtigungsmatrix.
>
> **Synchronisiert am 2026-08-17** mit [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md) und [ARCHITEKTUR_FINALISIERUNG.md](../ARCHITEKTUR_FINALISIERUNG.md). Der vollständige Permission-Katalog befindet sich in `ARCHITEKTUR_FINALISIERUNG.md`, Abschnitt 5.

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
