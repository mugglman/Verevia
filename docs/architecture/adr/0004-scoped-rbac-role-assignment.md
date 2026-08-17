# 0004 – Scope-basiertes RBAC über RoleAssignment statt einer Rolle pro Mitgliedschaft

## Status

**ACCEPTED** (2026-08-17) — die zuvor offene Modellierungsfrage (generische `scopeId` vs. scope-spezifische Fremdschlüssel) wurde final entschieden: scope-spezifische, nullable Fremdschlüssel (`departmentId`, `teamId`) mit `CHECK`-Constraint statt polymorpher `scopeId`. Details siehe [ARCHITEKTUR_FINALISIERUNG.md](../../ARCHITEKTUR_FINALISIERUNG.md), Abschnitt 4.

## Kontext

Ein Vereinsmitglied kann gleichzeitig mehrere, fachlich unterschiedliche Rollen in unterschiedlichen Kontexten desselben Vereins innehaben (z. B. Trainer einer Jugendmannschaft, Spieler einer anderen Mannschaft, gleichzeitig einfaches Vereinsmitglied). Das bisher in [Database.md](../../database/Database.md) und [Roles-and-Permissions.md](../../product/Roles-and-Permissions.md) beschriebene Modell sieht Rollen implizit auf Vereinsebene (`Membership ↔ Role`) vor und kann diese Mehrfach-Kontext-Fälle nicht abbilden.

Zusätzlich existieren Plattformrollen (`Platform Owner/Administrator/Support`), die mandantenübergreifend wirken und nicht an eine Vereinsmitgliedschaft gebunden sind.

## Entscheidung

Einführung von zwei getrennten Rollenzuweisungs-Konzepten:

1. **`RoleAssignment`**: verknüpft eine `Person` (siehe [0003](./0003-identity-account-person-model.md)) mit einer `Role` in einem konkreten Scope (`TENANT`, `DEPARTMENT` oder `TEAM`), modelliert über **scope-spezifische, nullable Fremdschlüssel** (`departmentId?`, `teamId?`) statt einer polymorphen generischen `scopeId` — durchgesetzt über einen `CHECK`-Constraint, der ungültige Kombinationen (z. B. `scopeType=TEAM` ohne `teamId`) ausschließt. `departmentId` wird bei `scopeType=TEAM` **nicht** redundant gespeichert, sondern bleibt über `Team → Department` ableitbar (vermeidet Inkonsistenzen bei Team-Umzügen zwischen Abteilungen). Eine `Person` kann beliebig viele `RoleAssignment`s in unterschiedlichen Scopes gleichzeitig besitzen. Rollen auf höherem Scope kaskadieren auf untergeordnete Scopes (`TENANT` → `DEPARTMENT` → `TEAM`).
2. **`PlatformRoleAssignment`**: verknüpft einen `User` direkt mit einer Plattformrolle, unabhängig von Tenant/Person, für mandantenübergreifende Plattformadministration.

Zeitliche Befristung (z. B. saisonale Trainer-Zuweisungen) wird generisch über `validFrom`/`validUntil` auf `RoleAssignment` gelöst, nicht über einen eigenen `SEASON`-Scope.

Ausführliche Herleitung siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md), Abschnitte 7–9.

## Konsequenzen

- Beliebige Kombinationen von Rollen in unterschiedlichen Scopes pro Person sind ohne Modelländerung abbildbar (siehe Beispiel Maik: Vereinsmitglied + Trainer E-Jugend + Spieler Alte Herren).
- Autorisierungsprüfungen benötigen eine Scope-Kaskadenlogik (in CASL abzubilden), nicht nur einen einfachen Rollen-Check.
- Referenzielle Integrität wird von der Datenbank selbst garantiert (echte Fremdschlüssel statt polymorpher Referenz).
- **Dokumentations-Sync abgeschlossen (2026-08-17):** `Database.md` und `Roles-and-Permissions.md` wurden an dieses ADR angepasst (Scope-Konzept, aktualisierter Rollenkatalog).

## Bezug

- [Auth-, Identity- und RBAC-Architektur](../../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)
- [Rollen und Berechtigungen](../../product/Roles-and-Permissions.md)
- [0003 – Identity Model](./0003-identity-account-person-model.md)
