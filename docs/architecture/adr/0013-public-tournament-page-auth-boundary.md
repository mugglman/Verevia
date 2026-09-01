# 0013 – Öffentliche Turnierseite: Autorisierungsgrenze und Sichtbarkeitsregel

## Status

**ACCEPTED** (2026-08-31)

## Kontext

Phase 17 implementiert die im Produkt seit Beginn dokumentierte, bislang fehlende „öffentliche Turnierseite" (Roadmap.md „Phase 4 – Turnierplan"; MVP-Scope.md, Punkt 17 „öffentliche Turnierinformationen"; Product-Vision.md). Diese Seite muss ohne Login einsehbar sein — ein fundamentaler Unterschied zu jedem bisherigen Endpunkt dieses Codebases mit Ausnahme des Einladungs-Flows (`PublicInvitationsController`, Phase 6).

Zwei Architekturfragen mussten dabei entschieden werden:

1. **Wie erreicht ein Request ohne Login trotzdem tenant-isolierte, RLS-geschützte Daten?** Der bestehende `TenantContextInterceptor` (ADR 0006) verlangt zwingend eine echte better-auth-Session UND eine aktive `Membership` — für einen anonymen Besucher gibt es beides nicht.
2. **Welche Turniere sind überhaupt öffentlich?** Das Produkt-Dokument selbst lässt das offen („Welche Mindestanforderungen gelten für öffentliche Turnierinformationen?", MVP-Scope.md, „Offene fachliche Fragen").

## Entscheidung

### Autorisierungsgrenze

Der neue `PublicTournamentController` (`GET /public/tournaments/:id`) ist **bewusst nicht** mit `@UseInterceptors(TenantContextInterceptor)` versehen — exakt dasselbe Muster wie `PublicInvitationsController`. Es findet keine Session-Prüfung, keine `Membership`-Prüfung, keine `canOnSeason`-Prüfung statt; das ist kein Versehen, sondern die gesamte Funktion dieses Endpunkts.

**RLS bleibt dabei vollständig scharf geschaltet.** `PublicTournamentService` liest ausschließlich über `getTenantPrisma(tenantId)` — denselben Mechanismus, der `SET LOCAL app.tenant_id` für jede Anfrage setzt (ADR 0006). Die `tenantId` kommt über den bestehenden `X-Tenant-Id`-Header, den `apps/web` bereits für JEDEN Request sendet, hier aber von einer bereits vertrauenswürdigen Quelle: der serverseitig aufgelösten Pilot-Tenant-ID (`resolvePilotTenantId()`, direkter, RLS-freier `Tenant`-Lookup — siehe Kommentar dort, „kein öffentliches Vereins-Onboarding"), nicht vom Client selbst behauptet.

Damit ist der Header hier **kein Autorisierungsnachweis** (anders als beim `TenantContextInterceptor`, wo eine echte Membership dahinterstehen muss) — er bestimmt nur, in welchem Tenant gelesen wird. Ein falsches (tenantId, tournamentId)-Paar liefert schlicht 404 (RLS lässt die Zeile nicht sichtbar werden), genau wie ein ungültiges Einladungs-Token. Das ist ausreichend, weil die gelesenen Daten per Definition öffentlich sein sollen — es gibt keine sensible Information, die durch Erraten einer Tenant-ID zusätzlich exponiert würde, die nicht ohnehin für JEDES Turnier dieses Tenants öffentlich wäre.

### Sichtbarkeitsregel: DRAFT ist nicht öffentlich

Ein Turnier mit `status = DRAFT` liefert 404 auf dem öffentlichen Endpunkt. Alle anderen Status (`PLANNED`, `ACTIVE`, `COMPLETED`, `CANCELLED`) sind öffentlich sichtbar — bewusst auch `CANCELLED`, damit Besucher erkennen können, dass ein Turnier abgesagt wurde, statt auf eine verwirrende 404-Seite zu treffen.

Begründung: `DRAFT` ist im bestehenden Datenmodell explizit der „Entwurf"-Zustand (siehe `TournamentStatus`-Enum) — ein Turnier, das ein TENANT_ADMIN noch aufbaut und absichtlich noch nicht ankündigen will. Es öffentlich zu zeigen würde diesen Zustand bedeutungslos machen.

### Keine zweite Standings-/Label-Engine

`PublicTournamentService` berechnet Gruppentabellen über dieselbe, unverändert wiederverwendete `computeGroupStandings`-Funktion (Phase 16, ADR 0012) und löst Spielfeld-Labels über die aus `MatchesService` exportierten `participantName`/`pendingSlotLabel`-Funktionen auf — keine eigene, zweite Implementierung dieser Logik. Die Web-Komponente `GroupStandingsTable` wurde aus `tournament-detail.tsx` extrahiert und wird von der authentifizierten UND der öffentlichen Seite gemeinsam genutzt — keine zweite Tabellen-Darstellung.

## Verworfene Alternativen

- **Ein eigener, unguessable Public-Slug/Token pro Turnier** (analog zum Einladungs-Token): verworfen. Fügt eine Migration und zusätzliche Komplexität für ein Sicherheitsniveau hinzu, das dieses Feature laut Produktdefinition nicht braucht — die Daten SOLLEN öffentlich sein, es gibt keine Geheimhaltungsanforderung wie bei einer personenbezogenen Einladung. Die bestehende Turnier-UUID ist bereits der Identifikator, unter dem das Turnier auch in der authentifizierten UI erreichbar ist.
- **`TenantContextInterceptor` beibehalten, aber optional machen (Session erlaubt, aber nicht erforderlich)**: verworfen. Hätte den Interceptor selbst verändert (Risiko für alle bestehenden, authentifizierten Endpunkte) statt einen sauber abgegrenzten neuen, öffentlichen Controller zu schaffen — widerspricht dem Auftrag, bestehende Architekturentscheidungen nicht nebenbei zu verändern.
- **DRAFT-Turniere ebenfalls öffentlich zeigen** (kein Statusfilter): verworfen — ein Entwurf ist per Definition noch nicht zur Veröffentlichung freigegeben; ihn dennoch zu zeigen würde die bestehende Statusmaschine (DRAFT als bewusster Zwischenzustand) entwerten.
- **Persistierte, denormalisierte „Public View"-Tabelle** für Performance: verworfen — bei den in der Praxis kleinen Turnieren dieses Produkts (siehe ADR 0012, dieselbe Begründung) ist die Live-Berechnung trivial günstig; eine zweite Datenhaltung für bereits ableitbare Informationen widerspricht Abschnitt 3 des Phase-17-Auftrags ausdrücklich.

## Konsequenzen

- Jeder neue öffentliche Lesezugriff auf Turnierdaten muss künftig denselben Header-als-Tenant-Auswahl-statt-Autorisierungsnachweis-Ansatz verwenden, NICHT den `TenantContextInterceptor` — sonst bräche die Anforderung „kein Login nötig".
- Sollte künftig ein zweiter echter Tenant (nicht nur der Pilot-Tenant) hinzukommen, muss die öffentliche Seite wissen, WELCHES Turnier zu WELCHEM Tenant gehört, ohne dass der Client das explizit angibt — aktuell durch `resolvePilotTenantId()` (Single-Tenant-Annahme, wie überall sonst in `apps/web`) gelöst. Eine echte Mehrmandanten-Auflösung für öffentliche Seiten (z. B. über eine Subdomain oder einen Vereins-Slug in der URL) ist eine erwartbare spätere Erweiterung, aber nicht Teil dieser Phase.
- Ein TENANT_ADMIN, der ein Turnier versehentlich veröffentlicht (Status von DRAFT auf einen anderen Wert ändert), macht es damit sofort öffentlich sichtbar — es gibt keine zusätzliche Bestätigung dafür. Das ist eine bewusste, kleine Produktentscheidung (Status-Änderung ist bereits ein expliziter Akt über das bestehende Bearbeitungsformular), kein Bug.

## Bezug

- [0006 – Multi-Tenant RLS/Request Context](./0006-multi-tenant-rls-request-context.md)
- [0012 – Gruppentabellen als abgeleitete Daten](./0012-group-standings-derived-technical-tiebreak.md) (wiederverwendete Standings-Berechnung)
- [PHASE_17_PUBLIC_TOURNAMENT_PAGE_REPORT.md](../../PHASE_17_PUBLIC_TOURNAMENT_PAGE_REPORT.md)
