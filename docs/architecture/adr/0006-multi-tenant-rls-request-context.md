# 0006 – Multi-Tenant Authorization: Request-scoped Tenant-Kontext und PostgreSQL-RLS-Kopplung

## Status

**ACCEPTED** (2026-08-17)

## Kontext

Die Grundsatzentscheidung "Shared Database / Shared Schema + `tenant_id` + PostgreSQL Row-Level-Security" ist bereits freigegeben (siehe [ARCHITEKTUR_BERICHT.md](../../ARCHITEKTUR_BERICHT.md), Abschnitt 5). Ungeklärt war bisher die konkrete technische Mechanik: wie der aktive Tenant-Kontext pro Request bestimmt, validiert und bis in die PostgreSQL-Session (`SET LOCAL app.tenant_id`) durchgereicht wird — insbesondere im Zusammenspiel mit Prisma's Connection-Pooling, bei dem ein naiver Ansatz (separater `SET LOCAL`-Aufruf gefolgt von einer eigenständigen Query) auf einer anderen gepoolten Verbindung landen und die Tenant-Isolation stillschweigend brechen kann. Da ein `User` Mitglied mehrerer Tenants sein kann (siehe [0003](./0003-identity-account-person-model.md)), darf der aktive Tenant zudem niemals allein aus einem clientseitig gelieferten Wert übernommen werden.

## Entscheidung

1. Der Client (Next.js) übermittelt den gewünschten Tenant-Kontext explizit (Subdomain oder Header), dieser Wert wird nie ungeprüft übernommen.
2. Ein `TenantContextGuard` validiert serverseitig vor jedem geschützten Request, ob eine `Membership` mit `status=ACTIVE` zu einer `Person` mit exakt diesem `tenantId` existiert.
3. Der validierte Kontext wird über `AsyncLocalStorage` request-scoped gespeichert.
4. **Jede Datenzugriffs-Operation eines Requests läuft innerhalb eines einzigen `prisma.$transaction(...)`-Blocks**, dessen erste Anweisung ein parametrisiertes `SET LOCAL app.tenant_id = …` ist. Feature-Code greift ausschließlich über einen gekapselten `TenantPrismaService` (Prisma-Client-Extension) zu, nie über den rohen globalen `PrismaClient`.
5. RLS-Policies werden **fail-closed** formuliert: ein fehlendes `app.tenant_id` (z. B. `current_setting(..., true)` liefert `NULL`) führt zu keinem Treffer, nicht zu ungefiltertem Zugriff.

Ausführliche technische Herleitung siehe [ARCHITEKTUR_FINALISIERUNG.md](../../ARCHITEKTUR_FINALISIERUNG.md), Abschnitte 7–8.

## Konsequenzen

- Mehrfach-Mitgliedschaft eines `User` in mehreren Tenants führt nicht zu einer Aufweichung der Mandantentrennung — jeder Request operiert strikt innerhalb genau eines validierten Tenant-Kontexts.
- Die `SET LOCAL`/Transaktions-Kopplung ist eine harte Implementierungsregel für `apps/api`, keine Empfehlung — ihre Verletzung wäre ein Sicherheitsfehler, kein Stilproblem.
- Zusätzlicher Implementierungsaufwand für die `TenantPrismaService`-Abstraktion zu Beginn von Phase 1; noch nicht implementiert oder unter Last getestet (siehe [ARCHITEKTUR_FINALISIERUNG.md](../../ARCHITEKTUR_FINALISIERUNG.md), Abschnitt 12, Risiko 2).
- RLS bleibt eine zweite, vom Anwendungscode unabhängige Schutzschicht (Defense in Depth) — schützt auch bei einem Bug in der Guard-/Extension-Logik.

## Bezug

- [Architektur-Finalisierung](../../ARCHITEKTUR_FINALISIERUNG.md)
- [Mandantenfähigkeit](../Multi-Tenancy.md)
- [0003 – Identity Model](./0003-identity-account-person-model.md)
- [0004 – Scoped RBAC](./0004-scoped-rbac-role-assignment.md)
