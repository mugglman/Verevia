# Phase 5 – Rollen- und Berechtigungsverwaltung

> Abschlussbericht zum Arbeitspaket „Verevia – Phase 5: Rollen- und Berechtigungsverwaltung". Bezieht sich auf [PHASE_4_TEAM_MEMBERSHIP_REPORT.md](./PHASE_4_TEAM_MEMBERSHIP_REPORT.md). TEIL A schließt Phase 4 über GitHub ab; TEIL B macht Rollen/Berechtigungen erstmals über die Anwendung verwaltbar.

## 1. Phase-4-PR/Merge

PR #4 (`feat/team-memberships → main`) geprüft: CI vollständig grün (alle Check-Suites `completed`/`success`), `mergeable_state: clean`, keine Konflikte, keine offenen Reviews/Kommentare, keine GitHub-Secret-Scanning-Alerts. Autonom gemergt (Squash-Merge, Commit `2571264`). Lokales `main` per Fast-Forward aktualisiert und verifiziert.

## 2. Branch

`feat/role-management`, von aktuellem `main` erstellt. Sämtliche Arbeit dieses Berichts liegt ausschließlich dort.

## 3. Rollenmodell

`RoleAssignment` bleibt die einzige fachliche RBAC-Zuweisung — keine zweite Rollenstruktur eingeführt, `PlatformRoleAssignment` bleibt vollständig getrennt und über diese UI nicht erreichbar (kein Endpunkt, kein UI-Pfad berührt dieses Modell). Verwaltbar sind alle neun bereits im Schema akzeptierten Vereinsrollen (siehe [Roles-and-Permissions.md](./product/Roles-and-Permissions.md)) — nicht nur die drei explizit genannten Mindestrollen: da der Rollenkatalog bereits vollständig existierte, wäre eine künstliche Beschränkung auf drei von neun Rollen eine willkürliche Lücke gewesen, keine "neue Rolle hinzufügen".

`TeamMember ≠ RoleAssignment` und `Membership ≠ RoleAssignment` bleiben strikt getrennt (siehe [Database.md](./database/Database.md), Abschnitt "Drei getrennte Konzepte", unverändert aus Phase 4 — inhaltlich weiterhin korrekt, keine Anpassung nötig). Der Seed demonstriert die Trennung konkret: Max Mustermann hat sowohl `TeamMember(E1)` als auch `RoleAssignment(COACH, TEAM, E1)` als zwei unabhängige Zeilen; Petra Beispiel hat nur `RoleAssignment(TENANT_ADMIN, TENANT)`, keine Teamzuordnung.

## 4. Scope-Regeln

Codifiziert die bereits in Roles-and-Permissions.md dokumentierte Rolle→Scope-Zuordnung (`ROLE_SCOPE_MAP` in `person-roles.service.ts`) — keine Erfindung, sondern die bestehende Tabelle als Code:

| Scope | Rollen |
|---|---|
| TENANT | TENANT_ADMIN, MEMBER, GUEST |
| DEPARTMENT | DEPARTMENT_ADMIN, YOUTH_DIRECTOR |
| TEAM | TEAM_MANAGER, COACH, ASSISTANT_COACH, PLAYER |

Durchgesetzt an zwei Stellen: applikationsseitig (`PersonRolesService.grant()` prüft `scopeType` gegen die Karte und lehnt falsche Kombinationen mit `400` ab, wie im Auftrag Abschnitt 7 gefordert) und weiterhin über den bestehenden DB-CHECK-Constraint (`role_assignment_scope_consistency`, Phase 2 — TENANT⇒dept/team NULL usw., unverändert, bleibt verbindlich).

## 5. Rollen-API

- `GET /api/v1/persons/:personId/roles` — Rollen einer Person (Rolle, Scope-Typ, ggf. Abteilungs-/Mannschaftsname, Assignment-ID). Keine internen DB-Details (keine rohen Fremdschlüssel-Strukturen) exponiert.
- `POST /api/v1/persons/:personId/roles` — Rolle vergeben (`{role, scopeType, departmentId?, teamId?}`). `tenantId` ausschließlich aus validiertem Tenant-Kontext, nie aus dem Request-Body.
- `DELETE /api/v1/persons/:personId/roles/:roleAssignmentId` — entfernt ausschließlich die `RoleAssignment`-Zeile, nie Person/TeamMember/Membership/User (mit echtem Test verifiziert, Abschnitt 16).
- Kein `PATCH` (wie im Auftrag festgelegt) — eine Rollenänderung ist bewusst "entfernen + neu vergeben".

## 6. Authorization

Neue `AuthorizationService`-Methode `canManageRoleAssignments()` — ausschließlich TENANT_ADMIN, für Lesen **und** Schreiben gleichermaßen (Rollen-/Berechtigungsdaten sind selbst sensibel genug, um nicht breiter als die Verwaltungsfähigkeit selbst offengelegt zu werden). DEPARTMENT_ADMIN und COACH können keine Rollen vergeben oder entfernen — bewusst, um Delegations-/Privilege-Escalation-Komplexität in dieser Phase zu vermeiden (Auftrag Abschnitt 12). Mit echten API-Tests verifiziert.

## 7. Privilege-Escalation-Schutz

- **Fremder Tenant**: manipulierter `X-Tenant-Id`-Header greift wie in Phase 3/4 nicht — keine aktive Membership im Zieltenant → `403`.
- **PlatformRoleAssignment**: strukturell unerreichbar — kein Endpunkt, kein DTO-Feld berührt dieses Modell.
- **Unbekannte Rolle**: `@IsEnum(Role)` im DTO lehnt jeden Wert außerhalb des bestehenden Enums mit `400` ab.
- **Ungültige Scope-Kombination**: applikationsseitige `ROLE_SCOPE_MAP`-Prüfung, `400`.
- **Team/Department aus Tenant B**: Composite-FK (DB-Ebene, siehe Abschnitt 10) plus ein expliziter RLS-gestützter Existenz-Check im Service — eine fremde ID wird schlicht nicht gefunden, `404` (kein Leak, ob die ID existiert, nur unter anderem Tenant).

Alle vier Fälle mit echten HTTP-Integrationstests gegen echte PostgreSQL verifiziert.

## 8. Last-TENANT_ADMIN-Schutz

Serverseitig erzwungen in `PersonRolesService.revoke()`: vor dem Entfernen einer `TENANT_ADMIN`/`TENANT`-Zuweisung wird geprüft, ob mindestens eine **andere** solche Zuweisung existiert, deren Person eine tatsächlich nutzbare Anmeldung hat (`Membership.status = ACTIVE`) — eine `RoleAssignment` auf eine Person ohne aktive Membership könnte nie tatsächlich zur Vereinsverwaltung genutzt werden und zählt daher nicht als "verbleibender Administrator" (exakt die im Auftrag Abschnitt 14 geforderte Person↔User↔Membership-Betrachtung). Ist dies die letzte nutzbare Zuweisung, `409 Conflict` mit verständlicher Fehlermeldung. Die Web-UI spiegelt dies zusätzlich proaktiv (vereinfachte serverseitig berechnete Zählung über alle Personen hinweg, siehe Abschnitt 14) — der Server bleibt in jedem Fall maßgeblich.

## 9. Duplicate-Schutz

Bestehendes Schema garantierte dies **nicht** — geprüft und als Lücke identifiziert (kein `@@unique` auf `RoleAssignment` vor dieser Phase). Geschlossen durch einen funktionalen Unique-Index (`role_assignment_person_role_scope_key` auf `(personId, role, scopeType, COALESCE(departmentId,''), COALESCE(teamId,''))`) — ein einfacher `@unique` hätte wegen SQLs `NULL <> NULL`-Semantik zwei TENANT-Scope-Duplikate derselben Person/Rolle nicht erkannt (beide mit `departmentId=teamId=NULL`), siehe Migration `20260820142846_add_role_assignment_uniqueness`. `RoleAssignment` hat kein `status`-Feld (anders als `TeamMember`) — `DELETE` löscht die Zeile tatsächlich, daher genügt ein einfacher, nicht-partieller Index. Mit echten Negativ-/Positivtests auf DB- und API-Ebene verifiziert (409 bei Duplikat, erlaubt bei unterschiedlichem Scope).

## 10. Cross-Tenant

Bestehende Composite-FK-Strategie unverändert weiterverwendet — `RoleAssignment.person`/`department`/`team` referenzieren bereits seit Phase 3 `(tenantId, id)` statt nur `id`. Keine neue Migration hierfür nötig; die bereits existierenden Phase-3-Cross-Tenant-Tests (`RoleAssignment → Department`, `RoleAssignment → Team`) decken exakt die im Auftrag Abschnitt 25 geforderten Fälle ("COACH mit Team Tenant B → DB ERROR", "DEPARTMENT_ADMIN mit Department Tenant B → DB ERROR") bereits ab und laufen weiterhin grün.

## 11. RLS

Unverändert — `role_assignment` trägt bereits seit Phase 2 die vier fail-closed Policies. Keine neue Migration nötig, keine Regression (mit den bestehenden RLS-Tests weiterhin grün verifiziert).

## 12. RBAC-Lifecycle

Verpflichtender End-to-End-Test (`apps/api/test/role-management.integration-spec.ts`, "RBAC lifecycle") gegen echte PostgreSQL + echte better-auth-Sessions, ohne Neustart/Cache-Flush zwischen den Schritten:

1. Person ohne COACH-Rolle → `GET /teams/:teamE1/members` → `403`.
2. TENANT_ADMIN vergibt `COACH`/`TEAM`/E1 → `201`.
3. Dieselbe Person → `GET .../teamE1/members` → `200`; `GET .../teamE2/members` weiterhin → `403`.
4. TENANT_ADMIN entfernt die Zuweisung → `204`.
5. Dieselbe Person → `GET .../teamE1/members` → wieder `403`.

Grün — bestätigt, dass eine neue `RoleAssignment` sofort für nachfolgende Requests wirksam wird (keine Caching-Schicht zwischen Autorisierungsprüfung und Datenbank).

## 13. Personen-Sichtbarkeit (DEPARTMENT_ADMIN)

Aus Phase 4 bekannte technische Schuld behoben: `PersonsService.list()` scoped die sichtbaren Personen für DEPARTMENT_ADMIN jetzt auf Personen, die über `TeamMember` (beliebiger Status) mindestens einem Team einer der eigenen Abteilung(en) zugeordnet sind (`AuthorizationService.getManagedDepartmentIds()` + ein `teamMemberships.some(...)`-Filter). TENANT_ADMIN bleibt unrestricted (alle Personen des Tenants), COACH weiterhin ohne jeden Zugriff auf `GET /persons`. Dies war mit dem in Phase 4 eingeführten `TeamMember`-Modell tatsächlich eine kleine, saubere Lösung (kein größerer Architektureingriff nötig) — kein Phase-6-Blocker mehr.

## 14. Web-UI

- **Personenverwaltung** (`person-management.tsx`) um einen Abschnitt „Rollen & Berechtigungen" je Person erweitert: Liste vorhandener Rollen mit deutschen Labels (`formatRoleLabel()`, z. B. „Trainer E1", „Abteilungsleiter Fußball", „Vereinsadministrator"), „Entfernen"-Aktion je Rolle, „Rolle hinzufügen"-Formular am Ende.
- **AddRoleForm** (`add-role-form.tsx`, Client-Component — die erste echte Client-Interaktivität in dieser App): Rollen-Auswahl schaltet abhängig vom gewählten Scope automatisch zwischen „Abteilung auswählen", „Mannschaft auswählen" oder gar keinem zusätzlichen Feld um (Auftrag Abschnitt 21: „nur gültige Kombinationen auswählbar machen"). Die eigentliche Mutation läuft weiterhin über eine echte Server Action, die `scopeType` serverseitig aus der Rolle neu ableitet statt einem Client-Wert zu vertrauen.
- **Last-TENANT_ADMIN-Schutz in der UI**: der Server berechnet die tenant-weite Anzahl aktiver TENANT_ADMIN/TENANT-Zuweisungen einmal in der Seiten-Wrapper-Komponente; ist es die letzte, zeigt die UI statt eines „Entfernen"-Buttons einen erklärenden Hinweis („Letzter Vereinsadministrator"). Server bleibt maßgeblich (409 bei Umgehungsversuch).
- **Keine Berechtigungs-Matrix-UI**: wie gefordert nicht gebaut — nur definierte Rollen + Scope, kein Permission-Editor, kein Rollen-Designer.
- Technische Begriffe (`TENANT_ADMIN`, `RoleAssignment`, `Scope`, …) tauchen nirgends in der Oberfläche auf.

## 15. Seeds

Erweitert (Auftrag Abschnitt 29): Max Mustermann ist jetzt zusätzlich zu seiner bestehenden `TeamMember(E1)`-Zuordnung `RoleAssignment(COACH, TEAM, E1)` — „Trainer E1"; ein neuer, klar fiktiver dritter Demo-Person „Petra Beispiel" ("Beispiel" = "example") ist `RoleAssignment(TENANT_ADMIN, TENANT)` — „Vereinsadministrator", ohne Teamzuordnung. Auf dem VPS zweifach ausgeführt und als idempotent verifiziert.

## 16. Tests

- **DB-Integrationstests**: 3 neue Tests für den Unique-Index (Duplikat TEAM-Scope abgelehnt, Duplikat TENANT-Scope abgelehnt, gleiche Rolle in zwei verschiedenen Teams erlaubt) — zusammen mit dem Bestand **31/31 grün**.
- **API-Unit-Tests**: 8 neue Authorization-Tests (`canManageRoleAssignments`, `getManagedDepartmentIds`) — zusammen **36/36 grün**.
- **API-Integrationstests** (`role-management.integration-spec.ts`, 16 Tests + RBAC-Lifecycle): 401/403-Baseline, Lesen/Vergeben/Entfernen durch TENANT_ADMIN, Verbot für DEPARTMENT_ADMIN/COACH, ungültige Scope-Kombination, unbekannte Rolle, Cross-Tenant-Team/-Department (404), Duplikat (409), Last-Admin-Schutz (409, plus Positivfall mit zweitem Admin), Revoke löscht nicht die Person, RBAC-Lifecycle — zusammen mit dem Bestand **46/46 grün**.
- **Web-Unit-Tests**: 4 neue Tests für `AddRoleForm` (Scope-abhängige Feldumschaltung), 5 neue für `PersonManagement` (Rollenanzeige, Empty-State, Last-Admin-Schutz mit/ohne Schutz) — zusammen **35/35 grün**.
- **E2E** (Playwright, echter Chromium-Browser gegen den vollständig laufenden Stack): neuer Test „TENANT_ADMIN vergibt und entzieht eine Rolle über die Personenverwaltung" — legt eine Person an, vergibt „Trainer E1" über die UI, verifiziert die Anzeige, entfernt die Rolle wieder, verifiziert den Empty-State — zusammen mit dem Bestand **4/4 grün**.

**Während der Verifikation gefundene und behobene Fehler** (echte Bugs bzw. Testfehler, keine trivialen Nacharbeiten):

1. Der ursprüngliche "letzten TENANT_ADMIN entfernen"-API-Test schlug fehl (`204` statt erwartetem `409`) — nicht wegen eines Produktcode-Fehlers, sondern weil der Test denselben, über die ganze Testdatei geteilten Tenant verwendete, der zu diesem Zeitpunkt bereits mehrere TENANT_ADMIN-Fixtures aus vorherigen Tests enthielt ("die einzige Zuweisung" war schlicht nicht mehr die einzige). Behoben durch einen dedizierten, isolierten Tenant für genau diesen Test.
2. Der neue Playwright-E2E-Test fand die frisch angelegte Person zunächst nicht — TENANT_ADMIN sieht Personennamen als editierbare `<input>`-Felder (`defaultValue`), nicht als Text, und Playwrights `hasText`-Filter erfasst keine Input-Werte. Behoben durch Lokalisierung über das `value`-Attribut des Nachname-Feldes statt über Textinhalt.

## 17. VPS-Verifikation

Temporärer, eindeutig gekennzeichneter PostgreSQL-17-Container (`verevia-tmp-dev-postgres-phase5-roles`, Label `verevia.purpose=temporary-phase5-roles-dev`) auf `verevia-dev`, ausschließlich auf `127.0.0.1` gebunden. Ein einziger sitzungsgebundener SSH-Key (`verevia-claude-session-temp-20260820-phase5-roles`) für die gesamte Sitzung, wie im Auftrag Abschnitt 30 gewünscht. Verbindung über SSH-Local-Port-Forward (`-L 5436:127.0.0.1:5436`).

Ablauf: `prisma migrate deploy` von leerer DB (7 Migrationen) → `prisma migrate diff` bestätigt keine Restdifferenz (der neue funktionale Unique-Index ist wie der partielle `TeamMember`-Index aus Phase 4 für Prismas Diffing unsichtbar — erwartet, konsistent mit früheren Phasen) → `prisma validate` grün → Seed zweifach, idempotent → `packages/database`-Integrationstests (31/31) → `apps/api`-Integrationstests (46/46, siehe Abschnitt 16 zum zwischenzeitlichen Testfehler) → `apps/api`/`apps/web` gebaut und als echte Prozesse gestartet → Playwright-E2E gegen den echten Stack (4/4, nach dem in Abschnitt 16 beschriebenen Locator-Fix).

Nach Abschluss vollständig aufgeräumt: lokale Prozesse beendet, Postgres-Container und Volume entfernt (verifiziert: keine `verevia-*`-Volumes mehr), SSH-Tunnel geschlossen (verifiziert: Port 5436 nicht mehr erreichbar), temporärer SSH-Key entfernt und die Entfernung doppelt verifiziert (Grep auf dem Server + fehlschlagender erneuter Verbindungsversuch mit genau diesem Key), lokale Schlüsseldateien gelöscht. **Keine Backup-Datei von `authorized_keys` angelegt** (wie im Auftrag Abschnitt 30 gefordert — diesmal technisch nicht nötig, da kein Vorher/Nachher-Vergleich für eine Bereinigungsaufgabe wie in Phase 4 anstand). Alle anderen `authorized_keys`-Einträge unverändert. `verevia-prod`, Traefik, Firewall, SSH-Konfiguration, DNS und bestehende persistente Daten wurden zu keinem Zeitpunkt verändert.

## 18. Quality Gates

Vollständig grün, keine Prüfung deaktiviert, kein Fehler durch Cache maskiert:

- `pnpm install --frozen-lockfile` ✅
- `pnpm lint` ✅ (0 Fehler, 0 Warnungen)
- `pnpm typecheck` ✅
- `pnpm test` ✅ (71/71: 36 API-Unit- + 35 Web-Unit-Tests)
- `pnpm build` ✅
- `prisma validate` ✅
- Migrationen von leerer DB ✅ (7/7, inkl. Drift-Check)
- Seed zweifach, idempotent ✅
- RLS/Cross-Tenant/RoleAssignment-Constraints ✅ (31/31)
- API-Integrationstests ✅ (46/46)
- RBAC-Lifecycle ✅ (Teil der 46)
- E2E ✅ (4/4)

## 19. GitHub-/PR-Status

Phase 4 (PR #4) gemergt, siehe Abschnitt 1. `feat/role-management` lokal fertig, committet und gepusht; PR `feat/role-management → main` erstellt, **nicht gemergt** (wie beauftragt).

## 20. Risiken

- DEPARTMENT_ADMIN-Personensichtbarkeit ist jetzt korrekt auf `TeamMember`-Zugehörigkeit gescoped, berücksichtigt dabei aber **jeden** Status (auch `INACTIVE`) — eine Person, die eine Mannschaft längst verlassen hat, bleibt für den zuständigen DEPARTMENT_ADMIN sichtbar. Bewusste, dokumentierte Vereinfachung (Begründung: der Admin könnte die Person reaktivieren wollen), kein Versehen.
- Der Last-TENANT_ADMIN-Zähler in der Web-UI ist eine vereinfachte Annäherung (reine Zeilenanzahl über alle Personen, ohne die serverseitige Membership-Aktivitätsprüfung zu duplizieren) — der Server bleibt maßgeblich, aber in einem theoretischen Randfall (z. B. ein zweiter TENANT_ADMIN-Eintrag ohne aktive Membership) könnte die UI einen „Entfernen"-Button anzeigen, den der Server dann zurecht mit `409` ablehnt. Kein Sicherheitsproblem, nur eine UX-Ungenauigkeit.

## 21. Technische Schulden

- Keine neuen wesentlichen technischen Schulden identifiziert. Die aus Phase 4 übernommene, unveränderte Beobachtung zu `TENANT_SCOPED_MODELS` als manuell gepflegte Liste in `tenant-prisma.ts` bleibt bestehen (kein neues tenant-gebundenes Modell in dieser Phase hinzugefügt, daher nicht erneut betroffen).

## 22. Nächster empfohlener Schritt

Diesen Bericht und den PR `feat/role-management → main` durchsehen und freigeben. Danach, wie im Auftrag ausdrücklich noch nicht Teil dieser Phase: E-Mail-/Account-Einladungen für Personen ohne Login, der Eltern-/Kind-Workflow (`PersonRelationship`-Verifizierung), sowie perspektivisch Turniere/Training/Anwesenheit/Spielplan/Spielgemeinschaften — alle weiterhin bewusst zurückgestellt.
