# Rollen und Berechtigungen

> Status: Entwurf. Dies ist eine kompakte Rollenübersicht, noch keine vollständige Berechtigungsmatrix.

## Grundprinzipien

- rollenbasierte Zugriffssteuerung (RBAC)
- Rechte gelten grundsätzlich im Kontext eines Mandanten (Vereins), siehe [Multi-Tenancy.md](../architecture/Multi-Tenancy.md)
- Least Privilege: Jede Rolle erhält nur die Rechte, die für ihre Aufgabe notwendig sind
- normale Vereinsrollen besitzen keine globalen Plattformrechte
- feinere, granularere Berechtigungen sind später möglich, aber nicht Teil dieser ersten Übersicht
- Eltern beziehungsweise Sorgeberechtigte sehen ausschließlich die ihnen zugeordneten Kinder und die für sie freigegebenen Mannschaftsinformationen

## Plattformrollen

Plattformrollen sind organisatorisch von Vereinsrollen getrennt und wirken mandantenübergreifend auf Plattformebene.

| Rolle | Beschreibung |
|---|---|
| Platform Owner | Höchste plattformweite Verantwortung |
| Platform Administrator | Administrative Verwaltung der Plattform |
| Platform Support | Unterstützung und Support auf Plattformebene |

## Vereinsrollen

Vereinsrollen gelten jeweils im Kontext eines konkreten Vereins (Mandanten).

| Rolle | Beschreibung |
|---|---|
| Vereinsadministrator | Administrative Verwaltung des Vereins |
| Vorstand | Vereinsführung |
| Abteilungsleiter | Verantwortung für eine Abteilung |
| Jugendleiter | Verantwortung für den Jugendbereich |
| Mannschaftsadministrator | Administrative Verwaltung einer Mannschaft |
| Trainer | Fachliche Leitung einer Mannschaft |
| Betreuer | Unterstützung von Trainer und Mannschaft |
| Mitglied | Vereinsmitglied |
| Elternteil / Sorgeberechtigter | Sorgeberechtigte Person eines minderjährigen Mitglieds |
| Gast | Eingeschränkter, nicht-mitgliedschaftlicher Zugriff |

## Mandantenkontext

Ein Benutzer kann in mehreren Vereinen jeweils unterschiedliche Rollen innehaben. Eine Rolle in Verein A gilt ausschließlich für Verein A und gewährt keinen Zugriff auf Daten von Verein B.

## Bezug

- [Mandantenfähigkeit](../architecture/Multi-Tenancy.md)
- [Datenbank-Entwurf](../database/Database.md)
