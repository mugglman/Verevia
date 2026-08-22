# Datenbank

> Status: Fachlicher Entwurf für die Kern-Entitäten **implementiert** (Tenant, Department, Team, Person, User/Session/Account/Verification, Membership, RoleAssignment, PlatformRoleAssignment, PersonRelationship, TeamMember, AccountInvitation) — siehe `packages/database/prisma/schema.prisma` und [PHASE_2_CORE_REPORT.md](../PHASE_2_CORE_REPORT.md). Fachliche Module (Fußball, Turnierplan, Kalender, Anwesenheit) sind weiterhin nur hier beschrieben, noch nicht implementiert.
>
> **Synchronisiert am 2026-08-17** mit den Entscheidungen aus [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md) und [ARCHITEKTUR_FINALISIERUNG.md](../ARCHITEKTUR_FINALISIERUNG.md): `Membership` ist kein Rollenträger mehr, Rollen sind scope-basiert (`RoleAssignment`), Eltern-Kind-Beziehungen sind ein eigenständiges Konzept (`PersonRelationship`), Plattformrollen sind von Vereinsrollen technisch getrennt (`PlatformRoleAssignment`). Details und Begründung siehe dort.
>
> **Ergänzt am 2026-08-17 (Phase 2):** `Role` ist im implementierten Schema ein Prisma-**Enum** mit dem in [Roles-and-Permissions.md](../product/Roles-and-Permissions.md) festgelegten, festen Rollenkatalog — keine eigene, dynamisch pflegbare `Role`/`Permission`-Datenbanktabelle. Das ist eine konkrete Implementierungsentscheidung dieser Phase (kein Widerspruch zu einer ACCEPTED-Architekturentscheidung, da keine der ADRs eine dynamische Rollentabelle vorschreibt), begründet durch den bewusst festen, plattformweiten Rollenkatalog ohne aktuellen Bedarf an vereinsindividuellen Rollen.
>
> **Ergänzt am 2026-08-20 (Phase 4):** Neue Entität `TeamMember` bildet die fachliche Mannschaftszugehörigkeit ab (`Person` ↔ `Team`) — siehe Abschnitt "Getrennte Konzepte: User/Person, Membership, TeamMember, PersonRelationship, RoleAssignment, AccountInvitation" unten für die Abgrenzung zu `Membership` und `RoleAssignment`.
>
> **Ergänzt am 2026-08-20 (Phase 5):** `RoleAssignment` ist erstmals über die Anwendung verwaltbar (`persons/:personId/roles`-API + Personenverwaltung im Web). Neu: ein funktionaler Unique-Index verhindert identische doppelte Zuweisungen (siehe RoleAssignment-Zeile unten), und die Zuordnung "welche `Role` erfordert welchen Scope" (bereits in [Roles-and-Permissions.md](../product/Roles-and-Permissions.md) dokumentiert) wird nun auch applikationsseitig durchgesetzt.
>
> **Ergänzt am 2026-08-21 (Phase 6):** Neue Entität `AccountInvitation` — der einzige Weg, wie eine `Membership` zwischen `User` und `Person` entsteht. Bewusst **ohne** Row-Level-Security (wie `Tenant` — siehe Abschnitt "Getrennte Konzepte" unten und die Migration `20260821090000_add_account_invitation` für die ausführliche Begründung: der öffentliche Annahme-Flow kennt den Tenant naturgemäß noch nicht, die Sicherheitsgrenze ist der Besitz des Tokens). `PersonRelationship` ist jetzt erstmals über die Anwendung verwaltbar (`persons/:personId/relationships`-API) und wird für echte ReBAC-Zugriffsentscheidungen ausgewertet (SELF/RELATIONSHIP/RBAC, siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)).

## Zweck

Dieses Dokument beschreibt den fachlichen Entwurf des Datenmodells von Verevia. Es dient als gemeinsames Verständnis zwischen Fachlichkeit und technischer Umsetzung, bevor ein konkretes Datenbankschema erstellt wird.

## Zentrale Entitäten

| Entität | Beschreibung |
|---|---|
| Tenant (Verein) | Der Mandant. Jeder Verein ist ein eigener Tenant. |
| Sport (Sportart) | Plattformweite, nicht mandantenbezogene Stammdatentabelle (Fußball, Tennis, Stockschützen, …). Wird von `Department` referenziert. |
| Department (Abteilung) | Eine Abteilung innerhalb eines Vereins (z. B. Fußball), referenziert genau eine `Sport`. Gehört zu genau einem Tenant. |
| Team (Mannschaft) | Eine Mannschaft innerhalb einer Abteilung. Gehört zu einem Verein oder ist einer Spielgemeinschaft zugeordnet. |
| TeamMember (Mannschaftsmitgliedschaft) | Fachliche Zuordnung einer `Person` zu einem `Team` ("diese Person gehört zu dieser Mannschaft") — **keine Berechtigung**, siehe Abschnitt "Getrennte Konzepte" unten. Status `ACTIVE`/`INACTIVE`. |
| User | Ein technischer Login-Account. **Nicht** mandantenbezogen, enthält ausschließlich Auth-relevante Daten (E-Mail, Passwort-Hash, Verifizierungsstatus). Kann über `Membership` mit `Person`-Datensätzen in mehreren Vereinen verknüpft sein. Existiert unabhängig davon, ob eine Person tatsächlich einen Account hat. |
| Person (Mitglied) | Eine natürliche Person als Vereinsmitglied, **mandantenbezogen** (`tenantId` Pflichtfeld), unabhängig davon, ob sie einen `User`-Account besitzt. Trägerin aller fachlichen Verknüpfungen (Rollen, Beziehungen, Anwesenheit). |
| Membership | Reine Verknüpfung zwischen `User` (Login) und `Person` (Vereinsmitglied) — **kein Rollenträger**. Bedeutet "dieser Login-Account ist diese Person". Rollen hängen an `Person`, siehe `RoleAssignment`. |
| AccountInvitation (Account-Einladung) | Der einzige Weg, wie erstmals eine `Membership` zwischen `User` und `Person` entsteht (Phase 6). Enthält niemals den rohen Einladungs-Token, nur dessen Hash — siehe Abschnitt "Getrennte Konzepte" unten. |
| RoleAssignment | Verknüpft eine `Person` mit einer `Role` in einem konkreten Scope (`TENANT`, `DEPARTMENT` oder `TEAM`, über nullable Fremdschlüssel `departmentId`/`teamId`). Eine Person kann beliebig viele `RoleAssignment`s in unterschiedlichen Scopes gleichzeitig besitzen. Eine identische Zuweisung (gleiche Person/Rolle/Scope/Department/Team) kann nicht doppelt existieren (Unique-Index, Phase 5). |
| Role | Eine Rolle innerhalb eines Vereins (z. B. Trainer, Vereinsadministrator), einsetzbar über `RoleAssignment` mit beliebigem Scope. |
| Permission | Eine einzelne Berechtigung, die einer Rolle zugeordnet werden kann. |
| PlatformRoleAssignment | Verknüpft einen `User` direkt (ohne Umweg über `Person`/Tenant) mit einer mandantenübergreifenden Plattformrolle (`Platform Owner/Administrator/Support`). |
| PersonRelationship | Gerichtete, verifizierungspflichtige Beziehung zwischen zwei `Person`-Datensätzen desselben Tenants (z. B. `PARENT`, `LEGAL_GUARDIAN`, `EMERGENCY_CONTACT`). Bildet Eltern-Kind-Beziehungen ab — **keine RBAC-Rolle**, siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md), Abschnitt 6. Ersetzt die früheren Entitäten `Guardian`/`GuardianRelation`. |
| Coach (Trainer) | Fachlich abgebildet über `RoleAssignment` mit Rolle `COACH`/`ASSISTANT_COACH` und Scope `TEAM` — keine eigene Entität mehr nötig. |
| Season (Saison) | Zeitlicher Rahmen, dem Mannschaften, Kalendereinträge und Turniere zugeordnet werden. |
| Event (Termin) | Ein Kalendereintrag, z. B. Training oder Besprechung. |
| Attendance (Anwesenheit) | Zu- oder Absage sowie tatsächliche Anwesenheit einer Person zu einem `Event`. |
| Task (Aufgabe) | Eine einer Mannschaft oder Person zugeordnete Aufgabe. |
| Tournament (Turnier) | Ein geplantes oder durchgeführtes Turnier. |
| TournamentTeam | Zuordnung einer teilnehmenden Mannschaft zu einem Turnier. |
| Match (Spiel) | Eine einzelne Begegnung innerhalb eines Turniers oder Spielplans. |
| Venue (Austragungsort) | Ort, an dem ein `Event` oder `Match` stattfindet. |
| Notification | Eine an einen Benutzer gesendete Mitteilung (z. B. Push-Mitteilung). |
| AuditLog | Protokoll sicherheits- oder nachvollziehbarkeitsrelevanter Änderungen. |
| JointTeam (Spielgemeinschaft) | Zusammenschluss mehrerer Vereine zu einer gemeinsamen Mannschaft. |
| JointTeamTenant | Zuordnung eines beteiligten Vereins (Tenant) zu einer `JointTeam`, inklusive Kennzeichnung des federführenden Vereins. |

## Getrennte Konzepte: User/Person, Membership, TeamMember, PersonRelationship, RoleAssignment, AccountInvitation

Mehrere Entitäten im Schema klingen fachlich ähnlich ("wer gehört wozu", "wer darf was"), bedeuten aber bewusst unterschiedliche Dinge und dürfen nicht vermischt werden:

| Entität | Bedeutet | Bedeutet NICHT |
|---|---|---|
| `User` ≠ `Person` | `User` ist der globale, mandantenübergreifende Login-Account (E-Mail, Passwort-Hash). `Person` ist das mandantengebundene Vereinsmitglied — existiert auch ganz ohne `User` (z. B. ein minderjähriges Mitglied ohne eigenen Login). | `User` ist keine fachliche Identität im Verein, `Person` ist kein Login-Mechanismus. |
| `Membership` | Welcher `User` (Login-Account) ist welche `Person`. Globale Identitätsebene, kein eigenes `tenantId`. Entsteht ausschließlich über eine akzeptierte `AccountInvitation` (Phase 6). | Keine Mannschaftszugehörigkeit, keine Berechtigung. |
| `TeamMember` | Diese `Person` gehört fachlich zu dieser `Mannschaft` (Kaderzugehörigkeit). Tenant-gebunden, RLS-geschützt. | Keine Berechtigung — ein `TeamMember`-Eintrag allein erlaubt der Person nichts zu verwalten. |
| `PersonRelationship` | Fachliche Beziehung zwischen zwei Personen desselben Tenants (z. B. Eltern-Kind). Administrativ verifizierbar (Phase 6) — gewährt darüber lesenden Zugriff auf die Daten des Kindes (ReBAC), siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md). | **Keine RBAC-Rolle** — eine `PersonRelationship` erteilt niemals Vereins-/Abteilungs-/Mannschaftsverwaltungsrechte. |
| `RoleAssignment` | Organisatorische Berechtigung: was eine `Person` in einem Scope (`TENANT`/`DEPARTMENT`/`TEAM`) darf. | Keine Aussage über fachliche Kaderzugehörigkeit oder familiäre Beziehung — ein COACH mit `RoleAssignment(scopeType: TEAM)` muss nicht zwingend selbst `TeamMember` seines eigenen Teams sein. |
| `AccountInvitation` | Der Prozess, über den eine `Person` erstmals mit einem `User` verknüpft wird — Token gehasht gespeichert, siehe unten. | Selbst keine Berechtigung und keine Beziehung — nur der Einladungs-Lebenszyklus (`PENDING`/`ACCEPTED`/`EXPIRED`/`REVOKED`). |

Beispiel: Ein Trainer der Mannschaft E1 hat zwei unabhängige Zeilen — `TeamMember(person, teamE1)` (falls er auch fachlich als Kadermitglied geführt wird) und `RoleAssignment(person, role: COACH, scopeType: TEAM, teamId: teamE1)` (seine Berechtigung). Ein Spieler hat nur `TeamMember`, keine `RoleAssignment`. Ein Elternteil hat weder `TeamMember` noch `RoleAssignment`, sondern eine `PersonRelationship(fromPerson: Elternteil, toPerson: Kind, type: LEGAL_GUARDIAN)` — dadurch darf es die Daten des Kindes lesen (ReBAC), aber nichts im Verein verwalten. Das Entfernen einer dieser Zeilen berührt die anderen nicht.

Namensentscheidung `TeamMember` (statt der im zugehörigen Arbeitsauftrag vorgeschlagenen Arbeitsbezeichnung `TeamMembership`): `TeamMembership` stünde im selben Schema neben dem bereits existierenden `Membership` (identisches "-ship"-Suffix, siehe Tabelle oben) — genau die Verwechslungsgefahr, die vermieden werden sollte. `TeamAssignment` wurde ebenfalls verworfen, da `RoleAssignment` bereits `scopeType: TEAM` abdeckt und ein `TeamAssignment` fachlich zu nah an "RoleAssignment mit Team-Scope" läge. `TeamMember` trägt keines der beiden kollidierenden Suffixe und deckt sich mit der REST-Vokabel `/teams/:teamId/members`.

## Mandantenzuordnung

Jede mandantenbezogene Entität (unter anderem `Department`, `Team`, `Person`, `Event`, `Task`, `Tournament`) besitzt eine eindeutige, verpflichtende Zuordnung zu einem `Tenant` (Verein). Diese Zuordnung ist Grundlage der strikten Datenisolation, siehe [Multi-Tenancy.md](../architecture/Multi-Tenancy.md).

## Beziehungen (Auswahl)

- Ein `Tenant` hat mehrere `Department`.
- Ein `Department` hat mehrere `Team`.
- Ein `Team` gehört zu genau einem `Tenant` oder ist über `JointTeamTenant` mehreren an einer Spielgemeinschaft beteiligten Vereinen zugeordnet.
- Ein `Team` hat mehrere `TeamMember`, jeweils genau einer `Person` desselben Tenants zugeordnet (fachliche Kaderzugehörigkeit, keine Berechtigung — siehe "Getrennte Konzepte" oben).
- Ein `User` hat mehrere `Membership`-Einträge, jeweils verknüpft mit genau einer `Person` (die wiederum genau einem `Tenant` zugeordnet ist). `Membership` selbst trägt keine Rolle.
- Eine `Person` hat mehrere `RoleAssignment`, jeweils mit genau einer `Role` und einem Scope (`TENANT`, `DEPARTMENT` oder `TEAM`).
- Eine `Role` hat mehrere `Permission`.
- Ein `User` kann mehrere `PlatformRoleAssignment` besitzen (mandantenübergreifend, unabhängig von `Person`/`Membership`).
- Eine `Person` kann mehrere `PersonRelationship` als Ursprung (z. B. Elternteil) und/oder als Ziel (z. B. Kind) besitzen — gerichtet, nicht bidirektional gespeichert.
- Eine `Person` kann mehrere `AccountInvitation` besitzen (typischerweise höchstens eine offene zur gleichen Zeit, siehe partieller Unique-Index); jede `AccountInvitation` gehört zu genau einem `Tenant`, referenziert den einladenden `User` (`invitedByUserId`) und führt bei Annahme zu genau einer `Membership`.
- Rolle "Trainer" wird als `RoleAssignment` (Rolle `COACH`/`ASSISTANT_COACH`, Scope `TEAM`) abgebildet, nicht als eigene Entität.
- Ein `Event` gehört zu einem `Team` oder `Department` und optional zu einer `Season` und einem `Venue`.
- Eine `Attendance` verknüpft eine `Person` mit einem `Event`.
- Ein `Tournament` hat mehrere `TournamentTeam`, die wiederum mehrere `Match` austragen.
- Eine `JointTeam` hat mehrere `JointTeamTenant`, von denen genau einer als federführend gekennzeichnet ist.

## Spielgemeinschaften im Datenmodell

Die Entitäten `JointTeam` und `JointTeamTenant` bilden ab, dass mehrere Vereine gemeinsam eine Mannschaft stellen können, ohne dass die beteiligten Vereine ihre Eigenständigkeit als Mandant verlieren. Zugriffsrechte auf gemeinsame Mannschaftsdaten werden über die Rollen- und Rechteverwaltung je beteiligtem Verein gesteuert.

## Auditierbarkeit

Sicherheits- und nachvollziehbarkeitsrelevante Änderungen (z. B. Rollenänderungen, Zugriffe auf sensible Daten) werden über `AuditLog`-Einträge dokumentiert. Der konkrete Umfang der Protokollierung wird im Zuge der technischen Umsetzung festgelegt.

## Datenschutz

Das Datenmodell enthält personenbezogene Daten, unter anderem von Minderjährigen (`Person`) und deren Erziehungsberechtigten (verknüpft über `PersonRelationship`). Bei der technischen Umsetzung ist zu berücksichtigen:

- Datensparsamkeit: Es werden nur Daten erhoben, die für den jeweiligen Zweck erforderlich sind.
- Zugriffsbeschränkung entsprechend der Rollen- und Rechteverwaltung (siehe [Roles-and-Permissions.md](../product/Roles-and-Permissions.md)).
- Strikte Mandantentrennung über `tenant_id` beziehungsweise die entsprechende Zuordnung zu `Tenant`.

**Ergänzt in Phase 6:** `PersonRelationship` ist jetzt implementiert und steuert echten lesenden Zugriff auf Kinddaten (ReBAC). Die dabei durch `TENANT_ADMIN` vorgenommene "administrative Verifizierung" (`status: VERIFIED`) ist ausdrücklich **keine rechtssichere Identitäts-/Sorgerechtsprüfung** — offene technische TODOs für einen echten Pilotbetrieb sind in [PHASE_6_GUARDIAN_INVITATIONS_REPORT.md](../PHASE_6_GUARDIAN_INVITATIONS_REPORT.md), Abschnitt "Datenschutz-TODOs" dokumentiert (Einwilligung Minderjähriger, echte Verifikation, Informationspflichten, Rechtsgrundlage, Aufbewahrungsfristen, Widerrufsmöglichkeiten, Audit-Log). Dieses Dokument ersetzt keine Rechtsberatung.

## Hinweis

Dieses Datenmodell ist ein **fachlicher Entwurf**. Es dient der Abstimmung vor der technischen Umsetzung und wird im Rahmen der Implementierung (Prisma-Schema) verfeinert und kann sich ändern.
