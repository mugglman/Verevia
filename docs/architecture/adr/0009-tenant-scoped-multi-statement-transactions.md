# 0009 – `withTenantTransaction`: atomare Mehrfach-Operationen im Tenant-Kontext

## Status

**ACCEPTED** (2026-08-30)

## Kontext

`getTenantPrisma(tenantId)` (Phase 2, ADR 0006) kapselt RLS-Enforcement, indem **jede einzelne** Prisma-Client-Operation auf einem tenant-gebundenen Modell in ihre eigene `prisma.$transaction(...)` gewrappt wird — dort wird per `set_config('app.tenant_id', …, true)` (funktional `SET LOCAL`) der Tenant für genau diese eine Operation gesetzt. Das garantiert korrektes RLS-Verhalten für jeden einzelnen Aufruf, ohne dass Aufrufer selbst an Transaktionen denken müssen — für praktisch den gesamten bisherigen Code (Phasen 2–11) ausreichend, da bislang keine Stelle mehrere tenant-gebundene Schreiboperationen **gemeinsam atomar** ausführen musste.

Phase 12 (Turnier-Spielplan-Generator) braucht genau das zum ersten Mal: das Committen eines generierten Spielplans muss

1. die `football_tournament`-Zeile sperren (verhindert einen zweiten, nahezu gleichzeitigen Commit-Versuch für dasselbe Turnier),
2. innerhalb derselben Transaktion erneut prüfen, ob zwischenzeitlich bereits ein Spielplan existiert (Race-Bedingung, siehe Auftrag Abschnitt 25/27),
3. den aktuellen Turnier-/Teilnehmer-/Gruppen-/Spielstätten-Stand frisch laden, den Spielplan serverseitig neu berechnen und mit dem vom Client übermittelten Fingerprint vergleichen,
4. bei Übereinstimmung alle generierten `FootballMatch`-Zeilen in einem Schritt persistieren,

— und das alles **in genau einer** Datenbanktransaktion, sonst ist weder echte Atomarität (Auftrag Abschnitt 26) noch der Schutz gegen doppelte Commits (Abschnitt 27) erreichbar.

Ein naiver Versuch, dafür mehrere Aufrufe über den von `getTenantPrisma()` zurückgegebenen Client abzusetzen, funktioniert nicht: `getTenantPrisma()` liefert einen `$extends(...)`-erweiterten Client, dessen `$allOperations`-Hook bei **jeder** Operation intern erneut `prisma.$transaction(...)` auf der ursprünglichen, nicht erweiterten `prisma`-Singleton-Instanz aufruft — nicht auf einem vom Aufrufer bereits offenen `tx`. Ein Aufruf wie `extended.$transaction(async (tx) => { await tx.footballMatch.createMany(...) })` würde für die innere Operation eine **zweite, unabhängige** Transaktion öffnen statt an der äußeren teilzunehmen — keine echte Atomarität, potenziell sogar Deadlock-Risiko.

## Entscheidung

Eine neue, additive Funktion `withTenantTransaction<T>(tenantId, callback)` in `packages/database/src/tenant-prisma.ts`, exportiert aus `@verevia/database`:

- Öffnet **eine** `prisma.$transaction(async (tx) => { … })`.
- Setzt `app.tenant_id` **einmal** zu Beginn auf demselben `tx` (identischer `set_config(..., true)`-Mechanismus wie in `getTenantPrisma()`).
- Übergibt den rohen `Prisma.TransactionClient` (`tx`) an den Callback — der Aufrufer kann darauf **beliebig viele** Operationen ausführen, alle auf derselben Connection/Transaktion, alle unter demselben RLS-Kontext.

`getTenantPrisma()` selbst bleibt **unverändert** — kein bestehender Aufrufer muss angepasst werden, keine Verhaltensänderung für die Phasen 1–11. `withTenantTransaction()` ist ein bewusst schmaler, zusätzlicher Baustein für den (weiterhin seltenen) Fall echter Mehrfach-Statement-Atomarität, kein Ersatz für `getTenantPrisma()`.

Innerhalb des Callbacks nutzt der Aufrufer normales Prisma-Locking (`SELECT … FOR UPDATE` per `tx.$queryRaw`) für die Zeilen-Sperre — kein neuer, projektfremder Locking-Mechanismus, sondern Standard-PostgreSQL/Prisma-Vokabular.

## Verworfene Alternativen

- **`getTenantPrisma()` selbst um einen `$transaction`-Passthrough erweitern**: hätte das bestehende, bewährte "jede Operation ist automatisch atomar"-Verhalten für alle bisherigen Aufrufer verändert oder zumindest verkompliziert (zwei unterschiedliche Aufrufmuster je nachdem, ob man sich "innerhalb" oder "außerhalb" einer Transaktion befindet) — höheres Risiko, ohne dass irgendein bestehender Call-Site das bräuchte.
- **Eine DB-seitige Advisory-Lock-/Unique-Constraint-Lösung ohne Anwendungscode-Transaktion** (z. B. ein partieller Unique-Index, der einen zweiten vollständigen Spielplan verhindert): unzuverlässig für das eigentliche Ziel (Race zwischen "existiert schon ein Spielplan?"-Prüfung und dem Insert selbst) und löst nicht das allgemeinere Bedürfnis nach echter Mehrfach-Statement-Atomarität, die Phase 12 ohnehin für den atomaren `createMany` aller generierten Spiele braucht.
- **Mehrere Einzel-`create()`-Aufrufe über `getTenantPrisma()` statt eines `createMany()`**: pro Aufruf einzeln atomar, aber NICHT gemeinsam atomar (ein Fehler nach dem dritten von zwölf Inserts hätte drei bereits gespeicherte Matches hinterlassen) — verletzt Auftrag Abschnitt 26 direkt.

## Konsequenzen

- Der Turnier-Spielplan-Commit (Phase 12) ist die erste Stelle im Code, die `withTenantTransaction()` verwendet — dort implementiert als: Turnier-Zeile per `SELECT … FOR UPDATE` sperren → bestehenden Spielplan prüfen → Zustand frisch laden → Fingerprint vergleichen → `tx.footballMatch.createMany(...)`.
- Künftige Features mit vergleichbarem Bedarf (mehrere tenant-gebundene Schreiboperationen, die gemeinsam atomar sein müssen) sollten `withTenantTransaction()` wiederverwenden statt eine eigene Lösung zu erfinden.
- `getTenantPrisma()` bleibt der Standardweg für alles andere — `withTenantTransaction()` ist die bewusste Ausnahme, nicht die neue Regel.

## Bezug

- [ARCHITEKTUR_FINALISIERUNG.md](../../ARCHITEKTUR_FINALISIERUNG.md), Abschnitt 7 (ursprüngliches `getTenantPrisma()`-Konzept)
- [0006 – Multi-Tenant RLS über Request-Kontext](./0006-multi-tenant-rls-request-context.md)
- [PHASE_12_TOURNAMENT_SCHEDULE_GENERATOR_REPORT.md](../../PHASE_12_TOURNAMENT_SCHEDULE_GENERATOR_REPORT.md)
