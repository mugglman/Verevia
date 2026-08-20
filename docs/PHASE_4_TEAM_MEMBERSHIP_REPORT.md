# Phase 4 – Phase 3 abschließen + Personen- und Mannschaftszuordnung

> Abschlussbericht zum Arbeitspaket „Verevia – Phase 4: Phase 3 abschließen + Personen- und Mannschaftszuordnung". Bezieht sich auf [PHASE_3_CLUB_STRUCTURE_REPORT.md](./PHASE_3_CLUB_STRUCTURE_REPORT.md). TEIL A schließt Phase 3 über GitHub ab und bereinigt technische Schulden; TEIL B implementiert den ersten Personen-/Mitglieder-Workflow (Verein → Personen → Mannschaft → Zuordnung).

## 1. Phase-3-PR/Merge

PR #3 (`feat/club-structure → main`) wurde geprüft: CI vollständig grün (alle GitHub-Actions-Check-Suites `completed`/`success`), `mergeable_state: clean` (keine Konflikte), keine offenen Review-Kommentare, keine GitHub-Secret-Scanning-Alerts, kein Branch-Protection-Blocker (kein Schutz auf `main` konfiguriert). Autonom gemergt (Squash-Merge, Commit `c8cc7b1`, konsistent mit dem Merge-Stil von PR #2). Lokales `main` per Fast-Forward aktualisiert und verifiziert.

## 2. VPS-Backup-Bereinigung

Die in [PHASE_3_CLUB_STRUCTURE_REPORT.md](./PHASE_3_CLUB_STRUCTURE_REPORT.md), Abschnitt 19, dokumentierte Datei `~/.ssh/authorized_keys.bak.phase3club` wurde vor dem Löschen verifiziert (Dateiname exakter Treffer, Inhalt ein Snapshot von `authorized_keys` aus genau jener Phase-3-Sitzung — enthielt nur den damals verwendeten, längst entfernten temporären Schlüssel `verevia-claude-session-temp-20260820-phase3-club-v2`). Eindeutig zugeordnet, daher entfernt. Kein anderer Eintrag/keine andere Datei unter `~/.ssh/` berührt.

## 3. Gewählte Teamzuordnungs-Entity

`TeamMember` (nicht die vorgeschlagene Arbeitsbezeichnung `TeamMembership`). Begründung siehe Abschnitt 6 des Auftrags und ausführlich dokumentiert in `packages/database/prisma/schema.prisma` (Modellkommentar) sowie [Database.md](./database/Database.md), Abschnitt "Drei getrennte Konzepte":

- `TeamMembership` stünde im selben Schema neben `Membership` (identisches „-ship"-Suffix, aber komplett andere Bedeutung — Login-Bindung vs. Kaderzugehörigkeit) — genau die Verwechslungsgefahr, die der Auftrag ausschließen wollte.
- `TeamAssignment` läge fachlich gefährlich nah an `RoleAssignment` mit `scopeType: TEAM` (Berechtigung), obwohl Teamzugehörigkeit **keine** Berechtigung ist.
- `TeamMember` trägt keines der beiden kollidierenden Suffixe und deckt sich mit der im Auftrag bereits vorgegebenen REST-Vokabel `/teams/:teamId/members`.

## 4. Datenmodell

```text
TeamMember {
  id         String
  tenantId   String
  personId   String
  teamId     String
  status     TeamMemberStatus (ACTIVE | INACTIVE, default ACTIVE)
  createdAt  DateTime
  updatedAt  DateTime
}
```

Keine weitergehende Historisierung (kein `validFrom`/`validUntil`, kein Audit-Log) — wie im Auftrag verlangt, bewusst minimal für diesen Slice.

## 5. DB-Constraints

- Composite Foreign Keys `(tenantId, personId) → person(tenantId, id)` und `(tenantId, teamId) → team(tenantId, id)` — identisches Muster zu Phase 3 (PostgreSQL MATCH SIMPLE), verhindert auf Datenbankebene, dass ein `TeamMember` mit `tenantId=A` eine Person oder ein Team eines anderen Tenants referenziert.
- Partieller Unique-Index `team_member_active_person_team_key ON team_member(personId, teamId) WHERE status = 'ACTIVE'` statt eines einfachen `@@unique` — verhindert eine doppelte **aktive** Zuordnung, erlaubt aber, dass eine zuvor deaktivierte Person derselben Mannschaft später erneut zugeordnet wird. Prisma 6 unterstützt partielle Indizes nicht deklarativ, daher per Hand in der Migration `20260820125026_add_team_member`.
- `DELETE /api/v1/teams/:teamId/members/:personId` ist als **Soft-Removal** umgesetzt (`status → INACTIVE`, kein Zeilenlöschen) — Entscheidung dokumentiert in `TeamMembersService.remove()` und im Schema-Kommentar: bewahrt die Nachvollziehbarkeit "war einmal Teil der Mannschaft", ohne volle Historisierung einzuführen.

## 6. RLS

`team_member` folgt exakt dem Phase-2-Muster: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + vier fail-closed Policies (SELECT/INSERT/UPDATE/DELETE) auf `"tenantId" = NULLIF(current_setting('app.tenant_id', true), '')`.

**Während der VPS-Verifikation gefundener und behobener Fehler:** `packages/database/src/tenant-prisma.ts` führt eine hartcodierte `TENANT_SCOPED_MODELS`-Liste, über die `getTenantPrisma()` entscheidet, welche Modellaufrufe in die `SET LOCAL app.tenant_id`-Transaktion eingebettet werden. `TeamMember` fehlte in dieser Liste — jeder `db.teamMember.*`-Aufruf lief dadurch **ohne** gesetzten Tenant-Kontext direkt gegen RLS, was bei INSERT/UPDATE mit `"new row violates row-level security policy"` fehlschlug (fail-closed, kein stiller Datenverlust, aber die Funktion war schlicht nicht nutzbar). Behoben durch Ergänzen von `"TeamMember"` in der Liste; danach Seed, RLS-Tests und API-Integrationstests erneut grün. Dieser Fehler wäre ohne echte PostgreSQL-Verifikation (nur mit gemocktem Prisma-Client) nicht aufgefallen.

## 7. Personen-API

- `GET /api/v1/persons` — Liste (`{items, canCreate}`), beschränkt auf administrative Rollen (siehe Abschnitt 9).
- `GET /api/v1/persons/:id` — Einzelperson.
- `POST /api/v1/persons` — nur TENANT_ADMIN.
- `PATCH /api/v1/persons/:id` — nur TENANT_ADMIN.
- Kein DELETE (wie im Auftrag festgelegt).
- Felder: `firstName`/`lastName` (Pflicht), optional `birthDate`/`contactEmail`/`contactPhone` (bereits im Phase-2-Modell vorhanden, datensparsam verwendet) — keine neuen sensiblen Felder ergänzt.

## 8. Teammitglieder-API

- `GET /api/v1/teams/:teamId/members` — Liste (`{items, canManage}`).
- `POST /api/v1/teams/:teamId/members` — Person einer Mannschaft zuordnen (`{personId}`); `409 Conflict`, falls bereits aktiv zugeordnet (DB-Constraint als Autorität, Service-Check als frühzeitige, freundliche Fehlermeldung).
- `DELETE /api/v1/teams/:teamId/members/:personId` — Soft-Removal, `204 No Content`.

## 9. Authorization

Bestehender `AuthorizationService` erweitert (`canListPersons`, `canOnPerson`); Teammitglieder-Aktionen nutzen bewusst die **bereits existierenden** `canOnTeam`-Regeln (`"read"` bzw. `"update"`) statt eigener neuer Methoden, da sie exakt dieselbe Scope-Kaskade brauchen:

| Rolle | Personen lesen | Personen anlegen/bearbeiten | Team-Mitglied hinzufügen/entfernen |
|---|---|---|---|
| TENANT_ADMIN | alle | ja | alle Teams |
| DEPARTMENT_ADMIN | alle (siehe Abschnitt 10) | nein | nur Teams der eigenen Abteilung |
| COACH | nein (kein globales `GET /persons`) | nein | nein — auch nicht im eigenen Team |

COACH darf laut Auftrag ausdrücklich weder Personen fremden Teams zuordnen noch Zuordnungen ändern — auch nicht im eigenen Team (nur lesen). Mit echten API-Integrationstests verifiziert (Abschnitt 14).

## 10. Datenschutz/Sichtbarkeit

`GET /api/v1/persons` ist auf TENANT_ADMIN **und** DEPARTMENT_ADMIN beschränkt (nicht nur TENANT_ADMIN) — bewusste, dokumentierte Design-Entscheidung: `Person` trägt keine eigene Abteilungszuordnung (nur indirekt über `TeamMember`/`RoleAssignment`), ohne diese Erweiterung hätte ein DEPARTMENT_ADMIN keine Möglichkeit, eine bestehende Person zur Zuordnung in der eigenen Abteilung zu finden. Das bedeutet, ein DEPARTMENT_ADMIN sieht dabei auch Personen außerhalb seiner Abteilung — als bekannte, dokumentierte Vereinfachung in Abschnitt 18 (Risiken) festgehalten, nicht stillschweigend in Kauf genommen. COACH hat **keinen** Zugriff auf die globale Personenliste; `GET /teams/:teamId/members` zeigt ihm ausschließlich Mitglieder eines Teams, für das er tatsächlich berechtigt ist (mit echtem Test verifiziert: COACH E1 sieht E1-Mitglieder, aber `GET /teams/:teamE2/members` liefert `403`).

## 11. Web-UI

- **Mannschaftsansicht** (`team-view.tsx`) um einen Abschnitt „Mitglieder" erweitert: Kartenliste der aktiven Mitglieder, „Entfernen"-Button je Karte (nur bei `canManageMembers`), Auswahl-Formular „Person hinzufügen" (Dropdown bestehender, noch nicht zugeordneter Personen + Button) am Ende — kein Inline-Anlegen neuer Personen in diesem Flow (bewusst auf die dedizierte Personenverwaltung beschränkt, siehe Abschnitt 18).
- **Personenverwaltung** (`person-management.tsx`, `/personen`) für TENANT_ADMIN: Liste, Anlegen-Formular, Inline-Bearbeitung (nur Vor-/Nachname editierbar — bewusst minimal, kein Massenimport, kein CSV, keine Einladungsmails).
- Navigation um „Personen" ergänzt (immer sichtbar; die Seite selbst zeigt bei fehlender Berechtigung eine Hinweismeldung statt die Verwaltungsoberfläche — `Nav` kennt die Berechtigungen des aufrufenden Nutzers nicht).
- Durchgehend deutsche Begriffe; keine internen Begriffe (`TeamMember`, `RoleAssignment`, `Tenant`, `Scope`, `RLS`) in der Oberfläche sichtbar.

## 12. Responsive Verhalten

Gleiches Karten-/Grid-Muster wie die bestehenden Vereins-/Abteilungs-/Mannschaftsansichten (`grid-cols-1 sm:grid-cols-2`) — eine Spalte auf dem Smartphone, zwei ab Tablet/Desktop, keine Tabelle als einziger Zugang. Manuell im gebauten Produktions-Frontend geprüft.

## 13. Seeds

`packages/database/prisma/seed.ts` ordnet die bestehenden fiktiven Demo-Personen jetzt Teams zu: Max Mustermann → E1, Erika Musterfrau → E2 (`TeamMember`, Status `ACTIVE`). Auf dem VPS zweifach hintereinander ausgeführt und als idempotent verifiziert (identische IDs, keine doppelten Zuordnungen).

## 14. Tests

- **DB-Integrationstests** (`packages/database`, echte PostgreSQL): 10 neue Tests — 3 Cross-Tenant-FK-Fälle für `TeamMember→Person/Team` (2 Negativ-, 1 Positivfall), 2 Fälle für den partiellen Unique-Index (doppelte aktive Zuordnung abgelehnt / erneute Zuordnung nach Deaktivierung erlaubt), 5 RLS-Fälle für `TeamMember` (Sichtbarkeit eigener/fremder Zeilen, fail-closed ohne Kontext, `findMany`-Filterung, Cross-Tenant-UPDATE abgelehnt) — zusammen mit dem Phase-3-Bestand **28/28 grün**.
- **API-Unit-Tests**: 11 neue Authorization-Tests (Personen-Sichtbarkeit, Teammitglieder-Scope-Kaskade) — zusammen **28/28 grün**.
- **API-Integrationstests** (`apps/api/test/team-membership.integration-spec.ts`, echte PostgreSQL + echte better-auth-Sessions): 11 Tests — deckt alle im Auftrag geforderten Minimalfälle ab (401/403-Baseline, TENANT_ADMIN Person anlegen + Mitglied hinzufügen, DEPARTMENT_ADMIN Fußball erlaubt/Tennis verboten, COACH E1 liest E1/verboten für E2/kein globales `GET /persons`, doppelte aktive Zuordnung → 409, Soft-Removal-Verhalten) — zusammen mit dem Phase-3-Bestand **30/30 grün**.
- **Web-Unit-Tests**: 6 neue Tests für `PersonManagement` + 4 neue für die erweiterte `TeamView` (Mitgliederliste, Empty-State, Entfernen-/Hinzufügen-Sichtbarkeit) — zusammen **26/26 grün**.
- **E2E** (Playwright, echter Chromium-Browser gegen den vollständig laufenden Stack): Happy Path „TENANT_ADMIN fügt eine Person zur Mannschaft E1 hinzu" (Verein → Fußball → E1 → Person hinzufügen → Person erscheint in der Mitgliederliste) sowie „COACH E1 sieht Mitglieder von E1, aber keine Personenverwaltung" — beide mit echten, per Test-Session-Fixture angelegten better-auth-Sessions (siehe Phase 3, Abschnitt 19 zur Begründung dieses Musters) — **3/3 grün**.

**Während der VPS-Verifikation gefundene und behobene Test-Infrastruktur-Probleme** (keine Produktcode-Bugs):

1. Bei paralleler Ausführung (3 Playwright-Worker) traten intermittierend Next.js-Streaming-Fehler ("The destination stream closed early") auf — reproduzierbar mit 3 Workern, verschwunden mit 1, jeder Test einzeln zuverlässig grün. Ursache: mehrere gleichzeitige Browser-Kontexte gegen eine einzelne `next start`-Instanz unter der zusätzlichen Latenz des SSH-Tunnels. Behoben durch `fullyParallel: false`/`workers: 1` in `playwright.config.ts` (Begründung dort dokumentiert) — bei der kleinen Testsuite kostet serielle Ausführung wenig.
2. `apps/web/e2e/global-setup.ts` war nicht idempotent — jeder Testlauf legte eine neue "E2E Kandidat"-Person an, was nach mehreren Läufen zu einer Playwright-"strict mode violation" (mehrdeutiger Text-Locator) führte. Behoben durch einen Cleanup-Schritt am Anfang von `global-setup.ts`, der alle Fixture-Personen (`firstName: "E2E"`) samt zugehöriger Membership/RoleAssignment/TeamMember/User/Session/Account aus einem vorherigen Lauf entfernt, bevor neue angelegt werden.

## 15. VPS-Verifikation

Temporärer, eindeutig gekennzeichneter PostgreSQL-17-Container (`verevia-tmp-dev-postgres-phase4-members`, Label `verevia.purpose=temporary-phase4-members-dev`) auf `verevia-dev`, ausschließlich auf `127.0.0.1` des VPS gebunden. Zugriff über zwei aufeinanderfolgende, sitzungsgebundene SSH-Keys (`verevia-claude-session-temp-20260820-phase4-cleanup`, sowohl für die Backup-Bereinigung als auch — wiederverwendet innerhalb derselben Sitzung — für die komplette Phase-4-Verifikation; ein vorher generierter Key ohne `-v2`-Suffix wurde vom Nutzer nicht hinterlegt und blieb ungenutzt). Verbindung über SSH-Local-Port-Forward (`-L 5435:127.0.0.1:5435`).

Ablauf: `prisma migrate deploy` von leerer DB (6 Migrationen, inkl. `20260820125026_add_team_member`) → `prisma migrate diff` bestätigt keine Restdifferenz → `prisma validate` grün → Seed zweifach (erste Ausführung deckte den in Abschnitt 6 beschriebenen RLS-Fehler auf, nach Fix idempotent grün) → `packages/database`-Integrationstests (28/28) → `apps/api`-Integrationstests (zunächst 26/30 grün — 4 Fehlschläge, weil `apps/api` das gebaute `dist/` von `@verevia/database` lädt und der Fix aus Abschnitt 6 erst nach `pnpm --filter @verevia/database build` sichtbar wurde; nach Rebuild 30/30 grün) → `apps/api`/`apps/web` gebaut und als echte Prozesse gestartet (Port 3001/3100) → Playwright-E2E gegen diesen echten Stack (3/3 grün, nach den in Abschnitt 14 beschriebenen Test-Infrastruktur-Fixes).

Nach Abschluss vollständig aufgeräumt: lokale `apps/api`-/`apps/web`-Prozesse beendet, Postgres-Container und dediziertes Volume entfernt (verifiziert: keine `verevia-*`-Volumes mehr), SSH-Tunnel geschlossen (verifiziert: Port 5435 lokal nicht mehr erreichbar), temporärer SSH-Key entfernt und die Entfernung doppelt verifiziert (Grep auf dem Server + fehlschlagender erneuter Verbindungsversuch mit genau diesem Key), lokale Schlüsseldateien gelöscht. Alle anderen `authorized_keys`-Einträge unverändert. `verevia-prod`, Traefik, Firewall, SSH-Konfiguration, DNS und bestehende persistente Daten wurden zu keinem Zeitpunkt verändert.

## 16. Quality Gates

Vollständig grün, keine Prüfung deaktiviert, kein Fehler durch Cache maskiert:

- `pnpm install --frozen-lockfile` ✅
- `pnpm lint` ✅ (0 Fehler, 0 Warnungen — die aus Phase 3 dokumentierte Alt-Warnung wurde im Zuge dieser Sitzung als kleine technische Schuld mitbereinigt)
- `pnpm typecheck` ✅
- `pnpm test` ✅ (54/54: 28 API-Unit- + 26 Web-Unit-Tests)
- `pnpm build` ✅
- `prisma validate` ✅
- Migrationen von leerer DB ✅ (6/6, inkl. Drift-Check)
- Seed zweifach, idempotent ✅
- RLS-/Cross-Tenant-/TeamMember-Tests ✅ (28/28)
- API-Integrationstests ✅ (30/30)
- E2E ✅ (3/3)

## 17. GitHub-/PR-Status

Phase 3 (PR #3) gemergt, siehe Abschnitt 1. `feat/team-memberships` lokal fertig, committet und gepusht; PR `feat/team-memberships → main` erstellt, **nicht gemergt** (wie beauftragt).

## 18. Risiken

- `GET /api/v1/persons` ist gröber als ideal berechtigt: ein DEPARTMENT_ADMIN sieht auch Personen außerhalb seiner eigenen Abteilung, da `Person` keine eigene Abteilungszuordnung trägt (siehe Abschnitt 10) — dokumentierte, bewusste Vereinfachung, kein Versehen.
- Keine Rollen-Vergabe-API (unverändert aus Phase 3) — `RoleAssignment`-Zeilen weiterhin nur per Seed/Fixture/direktem DB-Zugriff.
- `verevia_app`-Passwort weiterhin Platzhalter `change-me` (unverändert aus Phase 2/3, muss vor jeder über lokale Entwicklung/VPS-Verifikation hinausgehenden Umgebung geändert werden).

## 19. Technische Schulden

- `apps/web/e2e/team-membership.spec.ts`/`club-structure.spec.ts` laufen jetzt seriell (`workers: 1`) statt parallel — für die aktuelle, kleine Testsuite unproblematisch; sollte bei deutlichem Wachstum der E2E-Suite neu bewertet werden (eigener Next.js-Server pro Worker oder eine näher an der Produktion liegende, nicht getunnelte DB-Verbindung würden die eigentliche Ursache beheben).
- `TENANT_SCOPED_MODELS` in `packages/database/src/tenant-prisma.ts` ist eine manuell gepflegte Liste, die bei jedem neuen tenant-gebundenen Modell manuell erweitert werden muss (siehe Abschnitt 6) — ein vergessener Eintrag scheitert zwar fail-closed (RLS blockiert), aber mit einer wenig aussagekräftigen Fehlermeldung statt eines Compile-Zeit-Hinweises. Für ein zukünftiges Arbeitspaket: aus den vorhandenen RLS-Migrationen oder einer expliziten Prisma-Schema-Annotation ableiten, statt Handpflege.

## 20. Nächster empfohlener Schritt

Diesen Bericht und den PR `feat/team-memberships → main` durchsehen und freigeben. Danach als eigenes Arbeitspaket: eine minimale Rollen-Vergabe-API (aus Phase 3 unverändert offen) — weiterhin **ausdrücklich ohne** Turniere, Trainings, Anwesenheit, Spielgemeinschaften oder umfangreiche Einladungs-/E-Mail-Logik, wie in diesem Auftrag festgelegt.
