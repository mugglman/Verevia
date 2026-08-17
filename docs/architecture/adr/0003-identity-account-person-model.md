# 0003 – Identity-Modell: strikte Trennung von Account (User) und Person

## Status

**ACCEPTED** (2026-08-17) — im technischen Spike zu [0002](./0002-authentication-strategy.md) verifiziert: better-auths generiertes `User`-Schema (E-Mail, Name, Verifizierungsstatus; Passwort-Hash getrennt in `Account` gespeichert) entspricht exakt dem hier beschriebenen architektonischen `User` und lässt sich konfliktfrei um die eigenständigen `Person`/`Membership`/`RoleAssignment`/`PersonRelationship`-Tabellen ergänzen.

## Kontext

Verevia verwaltet viele minderjährige Vereinsmitglieder, die häufig keinen eigenen Login-Account benötigen oder haben dürfen, aber trotzdem vollwertig im System existieren müssen (Kaderzugehörigkeit, Anwesenheit, Turnierteilnahme). Gleichzeitig können Erziehungsberechtigte eigene Accounts besitzen, mit mehreren Kindern verknüpft sein und selbst zusätzlich eigenständige Vereinsmitglieder (z. B. Trainer) sein. Das bisher in [Database.md](../../database/Database.md) beschriebene Modell verknüpft `Membership` direkt mit `Role` auf Vereinsebene und geht implizit von einer 1:1-Beziehung zwischen Login und Mitgliedschaft aus — das bildet die oben genannten Fälle nicht ab.

## Entscheidung

Striktes Prinzip: **`User` ist ein Login. `Person` ist ein dem Verein bekannter Mensch — mit oder ohne Login.**

- `User`: global, nicht mandantenbezogen, enthält ausschließlich Auth-relevante Daten.
- `Person`: mandantenbezogen (`tenantId` Pflichtfeld), enthält Stammdaten und ist Grundlage aller fachlichen Verknüpfungen (Rollen, Beziehungen, Anwesenheit etc.). Existiert unabhängig von einem `User`.
- `Membership`: reine Verknüpfung `User ↔ Person` ("dieser Login ist diese Person"), kein Rollenträger mehr.
- Fachliche Berechtigungen hängen an `Person` (siehe [0004](./0004-scoped-rbac-role-assignment.md)), nicht an `User` oder `Membership`.

Ausführliche Herleitung siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md), Abschnitte 4–5.

## Konsequenzen

- Minderjährige Mitglieder ohne Account sind vollständig abbildbar, ohne Sonderfälle im Datenmodell.
- Übergang minderjährig → volljährig (später eigener Account) erfordert nur eine neue `Membership` auf dieselbe, bereits bestehende `Person` — keine Datenmigration, keine Duplizierung.
- Ein `User` kann mit `Person`-Datensätzen in mehreren Vereinen (mehreren Tenants) verknüpft sein, ohne dass Vereinsdaten vermischt werden.
- **Dokumentations-Sync abgeschlossen (2026-08-17):** [Database.md](../../database/Database.md) und [Multi-Tenancy.md](../Multi-Tenancy.md) wurden an dieses ADR angepasst.

## Bezug

- [Auth-, Identity- und RBAC-Architektur](../../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)
- [Datenbank-Entwurf](../../database/Database.md)
- [Mandantenfähigkeit](../Multi-Tenancy.md)
- [0004 – Scoped RBAC](./0004-scoped-rbac-role-assignment.md)
- [0005 – Minderjährigen-/Guardian-Modell](./0005-minor-guardian-relationship-model.md)
