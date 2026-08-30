# Architecture Decision Records (ADR)

Dieses Verzeichnis enthält dokumentierte Architekturentscheidungen für Verevia im ADR-Format.

## Zweck

Jede wesentliche architektonische Entscheidung wird als eigenes ADR-Dokument festgehalten: Kontext, Entscheidung, Konsequenzen. So bleibt nachvollziehbar, warum eine Entscheidung getroffen wurde, auch wenn sich der Kontext später ändert.

## Konvention

- Dateien werden fortlaufend nummeriert: `0001-titel.md`, `0002-titel.md`, ...
- Bereits getroffene Entscheidungen werden nicht rückwirkend verändert; Änderungen erfolgen über ein neues ADR, das auf das vorherige verweist.

## Vorhandene ADRs

- [0001 – Modularer Monolith](./0001-modular-monolith.md)
- [0002 – Authentication Strategy](./0002-authentication-strategy.md) — ACCEPTED
- [0003 – Identity Model: Account/Person-Trennung](./0003-identity-account-person-model.md) — ACCEPTED
- [0004 – Scoped RBAC via RoleAssignment](./0004-scoped-rbac-role-assignment.md) — ACCEPTED
- [0005 – Minderjährigen-/Guardian-Modell](./0005-minor-guardian-relationship-model.md) — ACCEPTED
- [0006 – Multi-Tenant Authorization / RLS Request Context](./0006-multi-tenant-rls-request-context.md) — ACCEPTED
- [0007 – API-Versionierung](./0007-api-versioning.md) — ACCEPTED
- [0008 – Turnierspiele erweitern FootballMatch](./0008-tournament-match-model.md) — ACCEPTED
- [0009 – Tenant-gebundene Mehrfach-Statement-Transaktionen](./0009-tenant-scoped-multi-statement-transactions.md) — ACCEPTED
