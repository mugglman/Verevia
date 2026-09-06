# Datenbank

> Status: Fachlicher Entwurf für die Kern-Entitäten **implementiert** (Tenant, Department, Team, Person, User/Session/Account/Verification, Membership, RoleAssignment, PlatformRoleAssignment, PersonRelationship, TeamMember, AccountInvitation, seit Phase 9 zusätzlich Season, AgeGroup, TeamSeason, seit Phase 10 zusätzlich Venue, FootballMatch, seit Phase 11 zusätzlich FootballTournament, TournamentParticipant, TournamentVenue, TournamentGroup, seit Phase 18 zusätzlich Event) — siehe `packages/database/prisma/schema.prisma` und [PHASE_2_CORE_REPORT.md](../PHASE_2_CORE_REPORT.md). Weiterhin nicht implementiert: Attendance (Anwesenheit/Zu-/Absagen), Task (Aufgaben), Notification (Push-Mitteilungen), Spielgemeinschaften, Liga-Tabellen, Verbandsschnittstellen, Kaderhistorie.
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
>
> **Ergänzt am 2026-08-23 (Phase 9):** Fußball-Saisonverwaltung implementiert — abweichend von der ursprünglichen Skizze unten (`Sport` als eigene Stammdatentabelle) wurde `Sport` als kleines, generisches `SportType`-**Enum** (`FOOTBALL`/`TENNIS`/`STOCK_SPORT`/`CYCLING`/`OTHER`) direkt auf `Department.sportType` realisiert — keine eigene Tabelle, da der Wertebereich klein und stabil ist (siehe [PHASE_9_FOOTBALL_SEASON_REPORT.md](../PHASE_9_FOOTBALL_SEASON_REPORT.md), Abschnitt 3). `Season` ist entgegen der Skizze **sportneutral** und `Department`-gebunden (nicht `Team`-gebunden) implementiert — genau ein `Department` hat zu jeder Zeit höchstens eine `ACTIVE`-Saison (partieller Unique-Index). Neu: `AgeGroup` (Altersklasse) als tenant-weite, konfigurierbare Entität (bewusst **kein** Enum, um künftige Verbände/Länder/Erwachsenenkategorien nicht hart zu kodieren) und `TeamSeason`, die einen dauerhaften `Team`-Datensatz saisonweise mit `Season` + `AgeGroup` verknüpft (`Team` bleibt saisonübergreifend dieselbe organisatorische Einheit, siehe Abschnitt "Team vs. TeamSeason" unten). Details, Alternativen und Begründung: [PHASE_9_FOOTBALL_SEASON_REPORT.md](../PHASE_9_FOOTBALL_SEASON_REPORT.md).
>
> **Ergänzt am 2026-08-27 (Phase 10):** Spielstätten- und Spiel-Grundmodell implementiert. `Venue` (Spielstätte) entspricht weitgehend der ursprünglichen Skizze unten, ist aber tenant-gebunden statt global und bewusst **nicht** an eine Abteilung gekoppelt (sportartenübergreifend nutzbar). `Match` wurde als `FootballMatch` implementiert (kein sportneutrales Basismodell — die fachlichen Unterschiede zwischen Sportarten sind aktuell zu groß für ein gemeinsames Modell ohne künstliche Abstraktion) und referenziert `TeamSeason` statt `Team`/`Season` getrennt — dadurch entfällt ein redundantes `seasonId`-Feld, und der Fußball-only-Guardrail aus Phase 9 gilt strukturell mit. Details, Alternativen und Begründung: [PHASE_10_MATCH_FOUNDATION_REPORT.md](../PHASE_10_MATCH_FOUNDATION_REPORT.md).
>
> **Ergänzt am 2026-09-01 (Phase 18):** `Event` (Termin) implementiert — entspricht der ursprünglichen Skizze unten (gehört zu einem `Team` ODER einer `Department`, optional `Season`/`Venue`), bewusst sportneutral und **nicht** unter `football/` modelliert (gleiches Muster wie `Venue`). Autorisierung folgt der Scope-Art: team-gebundene Events (z. B. Training) wiederverwenden `canOnMatch` (alltägliche Trainer-Aufgabe), department-gebundene Events (z. B. eine Versammlung) wiederverwenden `canOnSeason` (administrativ) — siehe [ADR 0014](../architecture/adr/0014-event-dual-scope-authorization.md). `Attendance`/`Task`/`Notification` bleiben weiterhin nicht implementiert (nicht Teil dieser Phase). Details: [PHASE_18_CALENDAR_EVENTS_REPORT.md](../PHASE_18_CALENDAR_EVENTS_REPORT.md).

## Zweck

Dieses Dokument beschreibt den fachlichen Entwurf des Datenmodells von Verevia. Es dient als gemeinsames Verständnis zwischen Fachlichkeit und technischer Umsetzung, bevor ein konkretes Datenbankschema erstellt wird.

## Zentrale Entitäten

| Entität | Beschreibung |
|---|---|
| Tenant (Verein) | Der Mandant. Jeder Verein ist ein eigener Tenant. |
| SportType (Sportart) | **Implementiert als Enum** (nicht als eigene Tabelle, siehe Phase-9-Hinweis oben), Feld `Department.sportType` (`FOOTBALL`/`TENNIS`/`STOCK_SPORT`/`CYCLING`/`OTHER`, Default `OTHER`). |
| Department (Abteilung) | Eine Abteilung innerhalb eines Vereins (z. B. Fußball), trägt `sportType`. Gehört zu genau einem Tenant. Bleibt bewusst sportneutral — keine fußballspezifischen Felder direkt am Modell. |
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
| Season (Saison) | **Implementiert (Phase 9), sportneutral, `Department`-gebunden** (nicht `Team`-gebunden, abweichend von der ursprünglichen Skizze). Felder: `name`, `startsAt`, `endsAt`, `status` (`PLANNED`/`ACTIVE`/`COMPLETED`). DB-Constraint: `startsAt < endsAt`, sowie höchstens eine `ACTIVE`-Saison je `Department` (partieller Unique-Index). |
| AgeGroup (Altersklasse) | **Implementiert (Phase 9)**, tenant-weite, konfigurierbare Entität (bewusst kein Enum, siehe Phase-9-Hinweis oben). Felder: `name`, `sortOrder`. Eindeutig je Tenant. |
| TeamSeason (Mannschaft in Saison) | **Implementiert (Phase 9)** — verknüpft einen dauerhaften `Team`-Datensatz mit genau einer `Season` und `AgeGroup`. Siehe Abschnitt "Team vs. TeamSeason" unten. Eindeutig je `Team`/`Season`-Paar. Anwendungsseitig (nicht DB-seitig) geprüft: das zugehörige `Team` muss zu einem `Department` mit `sportType: FOOTBALL` gehören. |
| Event (Termin) | **Implementiert (Phase 18)** — ein Kalendereintrag, z. B. Training oder Besprechung. Gehört zu genau einem `Team` ODER einer `Department` (nie beides, nie keines, CHECK-Constraint `event_scope_xor`), optional einer `Season` und einem `Venue`. Felder: `title`, `description?`, `type` (`TRAINING`/`MEETING`/`OTHER`), `startsAt`, `endsAt`. Autorisierung siehe [ADR 0014](../architecture/adr/0014-event-dual-scope-authorization.md). |
| Attendance (Anwesenheit) | Zu- oder Absage sowie tatsächliche Anwesenheit einer Person zu einem `Event`. Weiterhin nicht implementiert (bewusst nicht Teil von Phase 18, siehe PHASE_18-Bericht). |
| Task (Aufgabe) | Eine einer Mannschaft oder Person zugeordnete Aufgabe. Weiterhin nicht implementiert. |
| Tournament (Turnier) | **Implementiert (Phase 11) als `FootballTournament`** — kein sportneutrales Basismodell, gleiche Begründung wie `FootballMatch` (Phase 10). Felder: `departmentId`, `seasonId?`, `name`, `description?`, `startsAt`, `endsAt?`, `status` (`DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CANCELLED`), `mode?` (`GROUPS`/`KNOCKOUT`/`GROUPS_AND_KNOCKOUT`, rein deskriptiv). Grundfundament ohne automatische Spielplan-/Bracket-Erzeugung — siehe [PHASE_11_TOURNAMENT_CORE_REPORT.md](../PHASE_11_TOURNAMENT_CORE_REPORT.md) und [ADR 0008](../architecture/adr/0008-tournament-match-model.md). |
| TournamentTeam | Ersetzt durch `TournamentParticipant` (Phase 11) — unterstützt sowohl interne (`TeamSeason`) als auch externe (Freitextname) Teilnehmer, nicht nur interne Mannschaften wie ursprünglich skizziert; siehe eigene Zeile unten. |
| TournamentParticipant (Turnierteilnehmer) | **Implementiert (Phase 11)** — genau eine Quelle: interne `TeamSeason` ODER externer Freitextname `externalName` (nie beides, nie keines; DB-CHECK). Duplikatschutz je Turnier (interner Teilnehmer: partieller Unique-Index auf `teamSeasonId`; externer Name: case-insensitiver partieller Unique-Index). Optional einer `TournamentGroup` zugeordnet (`groupId?`). `status` (`ACTIVE`/`WITHDRAWN`) statt Hard-Delete, sobald ein Teilnehmer bereits in einem Spiel referenziert ist. |
| TournamentVenue (Turnier-Spielstätte) | **Implementiert (Phase 11)** — Zuordnungstabelle zwischen `FootballTournament` und der bestehenden `Venue` (kein neues Spielstätten-Modell), mit optionalem `displayOrder`/`label` (z. B. "Hauptplatz"). Ein Turnier kann mehrere Spielstätten nutzen. |
| TournamentGroup (Turniergruppe) | **Implementiert (Phase 11)** — manuell angelegt (`name`, `displayOrder`), keine automatische Gruppenbildung. Eindeutig je Turnier/Name. |
| Match (Spiel) | **Implementiert (Phase 10) als `FootballMatch`, um Turniermatches erweitert (Phase 11)** — kein sportneutrales Basismodell, siehe Phase-10-Hinweis oben. Ein `FootballMatch` ist entweder ein **Vereinsmatch** (`teamSeasonId`+`opponentName`) oder ein **Turniermatch** (`tournamentId`+`homeParticipantId`+`awayParticipantId`, optional `tournamentGroupId`) — nie beides gemischt, per DB-CHECK erzwungen. Kein paralleles zweites Spielmodell für Turniere. Details, Alternativen und Begründung: [ADR 0008](../architecture/adr/0008-tournament-match-model.md). |
| Venue (Spielstätte) | **Implementiert (Phase 10)** — tenant-gebunden, bewusst sportartenübergreifend und nicht an eine Abteilung gekoppelt. Felder: `name`, optionale Adresse (`street`/`postalCode`/`city`/`countryCode`), optionale Koordinaten (`latitude`/`longitude`, ohne Geocoding-Anbindung), `notes`, `status` (`ACTIVE`/`INACTIVE`). Für den MVP entspricht jede konkrete Spielfläche einem eigenen `Venue`-Datensatz (kein separates Pitch/Court-Modell), siehe Phase-10-Bericht. |
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

## Team vs. TeamSeason (Phase 9)

`Team` (z. B. "E1") ist die **dauerhafte, saisonübergreifende organisatorische Einheit** — der Datensatz wird nicht jedes Jahr neu angelegt, damit bestehende `RoleAssignment`/`TeamMember`-Zuordnungen über einen Saisonwechsel hinweg gültig bleiben (echte Vereine führen "E1" ebenfalls als dauerhaften Kaderplatz-Namen, auch wenn sich Altersklasse und Spieler von Saison zu Saison ändern). `TeamSeason` ist die **saisonspezifische Zuordnung** dieses `Team` zu einer `Season` und `AgeGroup`, optional mit einem saisonabhängigen Anzeigenamen (`displayName`, `NULL` im Normalfall — keine unnötige Datenduplizierung von `team.name`). Diese Trennung wurde bewusst gewählt, statt pro Saison ein neues `Team` anzulegen — die Alternative hätte bedeutet, jede Rollen-/Kaderzuordnung jährlich neu zu verknüpfen, was ohne fachlichen Mehrwert zusätzliche Komplexität erzeugt hätte.

`TeamMember` (Mannschaftszugehörigkeit einer `Person`) ist in dieser Phase **bewusst nicht** saisonhistorisch — es gibt weiterhin nur einen aktuellen Kaderstatus je `Person`/`Team`-Paar, keine Historie über mehrere Saisons hinweg. Das wird relevant, sobald echte spielerbezogene Statistiken/Anwesenheit über mehrere Saisons hinweg abgebildet werden sollen (nicht Teil dieser Phase), ist aber kein Blocker für die reine Saison-/Altersklassenverwaltung.

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
- Ein `Event` gehört zu einem `Team` oder `Department` und optional zu einer `Season` und einem `Venue` (implementiert, Phase 18).
- Eine `Attendance` verknüpft eine `Person` mit einem `Event` (weiterhin nicht implementiert).
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
