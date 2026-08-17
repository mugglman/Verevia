# Architektur-Finalisierung Verevia

> Status: Abschluss der Architekturphase. Baut auf [ARCHITEKTUR_BERICHT.md](./ARCHITEKTUR_BERICHT.md) und [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](./AUTH_IDENTITY_RBAC_ARCHITEKTUR.md) auf.
>
> Erstellt: 2026-08-17. Enthält Ergebnisse eines isolierten technischen Spikes (außerhalb des Repositorys, im lokalen Scratchpad). Kein Anwendungscode, kein Turborepo-Skeleton, kein Prisma-Produktionsschema wurde im Rahmen dieser Analyse erstellt.

## 1. Ergebnis Auth-Spike

**Erfolgreich.** Der Spike wurde isoliert außerhalb des Verevia-Repositorys durchgeführt (lokales Scratchpad-Verzeichnis, nicht Teil dieses Repos, nach Abschluss nicht in die Projektstruktur übernommen) und deckte folgenden Stack ab: NestJS 11 (Express-5-Adapter), better-auth 1.6.29, Prisma 6.19 mit SQLite als lokalem Ersatz für PostgreSQL (kein lokaler Docker/Postgres in dieser Entwicklungsumgebung verfügbar — siehe Einschränkung unten).

### Geprüft und verifiziert (mit `curl` gegen den laufenden Spike-Server)

| Prüfpunkt | Ergebnis |
|---|---|
| NestJS-Integration ohne Community-Wrapper | **Funktioniert.** `better-auth/node`'s `toNodeHandler` lässt sich direkt auf der zugrunde liegenden Express-Instanz von Nest mounten (`app.getHttpAdapter().getInstance()`), parallel zu regulären Nest-Controllern. |
| Prisma-Adapter | **Funktioniert.** `better-auth/adapters/prisma` mit `@prisma/client`, Schema-Generierung über `npx @better-auth/cli generate`. |
| Session-Handling | **Funktioniert.** Signup/Login liefern korrektes `Set-Cookie` (`better-auth.session_token`, `HttpOnly`, `SameSite=Lax`, `Max-Age`), `GET /api/auth/get-session` liefert Session+User anhand des Cookies. |
| Cookie-basierte Authentifizierung | **Funktioniert**, siehe oben. |
| CORS / Trusted Origins | **Funktioniert.** Angefragter Origin `http://localhost:3000` (Next.js-Platzhalter) erhält korrekte `Access-Control-Allow-Origin`/`-Credentials`-Header; ein nicht in `trustedOrigins` gelisteter Origin wird mit `403 Invalid Origin` **serverseitig** abgelehnt — zusätzlich zur reinen CORS-Header-Logik, also echte Verteidigung, nicht nur Browser-Konvention. |
| Reverse-Proxy-Header | **Grundsätzlich funktionsfähig verifiziert** (Weiterleitung von `X-Forwarded-Proto` bis in die Anwendung wurde gezeigt); die produktionsrelevante Kombination aus Traefik + Express `trust proxy`-Einstellung + `secure`-Cookie-Flag hinter TLS-Terminierung wurde **nicht** gegen eine echte Traefik-Instanz getestet (siehe Einschränkungen). |
| E-Mail/Passwort-Login | **Funktioniert**, inklusive Passwort-Hash-Speicherung getrennt vom `User`-Datensatz (siehe Abschnitt 2). |
| E-Mail-Verifikation | **Funktioniert** (Trigger verifiziert, `sendVerificationEmail`-Hook wird aufgerufen; tatsächlicher Mailversand nicht Teil des Spikes). |
| Password Reset | **Funktioniert.** `POST /api/auth/request-password-reset` löst `sendResetPassword`-Hook mit gültigem, signiertem Reset-Link aus. |
| Session Revocation | **Funktioniert.** `POST /api/auth/sign-out` löscht die Session serverseitig und setzt Cookie-Löschung (`Max-Age=0`); ein anschließender `get-session`-Aufruf mit demselben (jetzt ungültigen) Cookie liefert `null`. |
| Erweiterbarkeit um 2FA | **Plugin vorhanden und importierbar** (`better-auth/plugins/two-factor`), nicht aktiviert/tiefer getestet (für MVP nicht erforderlich). |
| Erweiterbarkeit um Passkeys | Kein eigener `passkey`-Plugin-Pfad im aktuell installierten Kernpaket gefunden — vermutlich separates Zusatzpaket. **Nicht vertieft**, da für MVP irrelevant; kein Blocker, da WebAuthn/Passkeys ohnehin erst für eine spätere Phase vorgesehen sind. |

### Wichtige, bisher nicht dokumentierte Implementierungs-Gotchas (verifiziert und gelöst)

1. **NestJS-Body-Parser-Konflikt**: Nests globaler Body-Parser konsumiert den Request-Stream, bevor better-auths Handler ihn lesen kann — better-auth erhält sonst einen leeren Body. Lösung (verifiziert): NestJS-App mit `{ bodyParser: false }` erzeugen, better-auth-Handler auf der rohen Express-Instanz mounten, danach `express.json()` manuell für alle übrigen Routen aktivieren.
2. **Express-5-Wildcard-Syntax**: NestJS 11 nutzt Express 5, das die Wildcard-Routen-Syntax geändert hat (`{*splat}` statt `*`). Viele ältere better-auth/Express-Tutorials im Netz verwenden noch die Express-4-Syntax, die unter NestJS 11 nicht funktioniert. Im Spike korrekt mit `{*splat}` verifiziert.
3. **Prisma 7 nicht direkt kompatibel mit dem aktuell dokumentierten Setup-Stil**: Prisma 7 entfernt `url` als Property im `datasource`-Block des Schemas zugunsten eines verpflichtenden Driver-Adapter-Ansatzes (`prisma.config.ts`). Das ist eine Stack-weite Breaking Change unabhängig von better-auth. **Empfehlung: Prisma vorerst auf `^6` pinnen** (siehe Abschnitt 3), bis Ökosystem-Tooling (Adapter, Dokumentation, Community-Beispiele) durchgängig auf das neue Prisma-7-Modell umgestellt ist. Dies aktualisiert die bisher unversionierte Prisma-Empfehlung aus `ARCHITEKTUR_BERICHT.md`.

### Einschränkungen dieses Spikes (ehrlich zu benennen)

- **Kein PostgreSQL im lokalen Testlauf** (weder Docker noch ein lokaler Postgres-Server war in dieser Entwicklungsumgebung verfügbar) — der Spike lief gegen SQLite. Die getesteten Punkte (NestJS-Mounting, Session-/Cookie-Handling, CORS, Body-Parser-Verhalten) sind Postgres-unabhängig und somit aussagekräftig übertragbar. **Nicht** verifiziert: Verhalten des Prisma-Adapters unter echter Postgres-Verbindung/-Pooling sowie das Zusammenspiel mit den RLS-Policies aus Abschnitt 8 — das bleibt ein Nachtest zu Beginn der eigentlichen Implementierung (Phase 1), aber kein architektonisches Risiko, da der Prisma-Adapter providerunabhängig arbeitet.
- **Kein echter Traefik-Reverse-Proxy** im Testaufbau — Header-Weiterleitung wurde nur simuliert (manuell gesetzter `X-Forwarded-Proto`-Header gegen den lokalen Server), nicht gegen eine tatsächliche Traefik-Instanz mit TLS-Terminierung verifiziert.
- Spike-Code liegt ausschließlich im lokalen Scratchpad-Verzeichnis (außerhalb des Repositorys) und wird **nicht** in die Verevia-Projektstruktur übernommen.

---

## 2. Better-Auth-Risikobewertung (aktualisiert gegenüber AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)

| Kriterium | Frühere Einschätzung | Aktualisierte Einschätzung nach Spike/Recherche |
|---|---|---|
| Reifegrad/Verbreitung | "jung, wachsend", als Risiko markiert | **Deutlich mainstream**: ca. 4,6 Mio. npm-Downloads/Woche (Stand der Recherche). Risiko wird von "spürbar" auf "gering" herabgestuft. |
| NestJS-Integrationsrisiko | unklar, community-maintained Wrapper als Unsicherheit benannt | **Kein Wrapper nötig** — direktes Mounten auf der Express-Instanz funktioniert nachweislich und ist die empfohlene Variante. Ein Community-Wrapper (`@thallesp/nestjs-better-auth`, v2.7.0, ca. 68.000 Downloads/Woche, zuletzt vor rund 6 Wochen aktualisiert) existiert als Option für spätere, komfortablere Nest-DI-Integration (z. B. Decorators, Guards als Klassen), ist aber **keine Voraussetzung** und wird für Phase 1 **nicht** eingeplant, um die Abhängigkeitskette schlank zu halten. |
| Datenmodell-Kompatibilität mit unserem User/Person-Modell | ungeprüft | **Verifiziert passend**: better-auth generiert ein eigenes `User`-Modell (E-Mail, Name, Verifizierungsstatus) sowie `Session`, `Account` (Passwort-Hash liegt hier, provider-getrennt, **nicht** im `User`-Datensatz) und `Verification`. Das entspricht exakt unserem architektonischen `User` (Login-Identität) aus [0003](./architecture/adr/0003-identity-account-person-model.md) — unsere `Person`/`Membership`/`RoleAssignment`/`PersonRelationship`-Tabellen bleiben vollständig eigenständig und referenzieren nur `User.id`. |
| Kollision mit better-auths eigenen Multi-Tenancy-Bausteinen | nicht betrachtet | better-auth bietet optionale `organization`- und `admin`-Plugins, die eine generische Organisations-/Rollenstruktur mitbringen. **Bewusste Entscheidung: nicht verwenden** — unser scope-basiertes `RoleAssignment`/`PersonRelationship`-Modell ist fachlich spezifischer (Minderjährige ohne Account, Team-/Abteilungs-Scopes, Eltern-Kind-Beziehungen) als das, was die generischen Plugins bieten. Vermeidet eine unklare Doppelverantwortung zwischen better-auths eigenem Rollenkonzept und unserem. |
| Sicherheits-Defaults | ungeprüft | Serverseitige Origin-Validierung unabhängig von CORS bestätigt (Defense in Depth), sichere Cookie-Defaults bestätigt, Session-Revocation funktioniert korrekt. |
| Abhängigkeit von Prisma-Major-Version | ungeprüft | Prisma 7 nicht ohne Weiteres kompatibel mit dem aktuell verbreiteten Setup-Stil (siehe Abschnitt 1, Punkt 3) — **Empfehlung: Prisma `^6` pinnen für Phase 1.** |

**Gesamtrisiko: niedrig bis mittel** (herabgestuft von der vorherigen Einschätzung), mit den in Abschnitt 1 genannten drei Implementierungs-Gotchas als konkret zu dokumentierende Punkte für den Phase-1-Setup-Guide.

---

## 3. Finale Auth-Entscheidung

**Bestätigt und final: better-auth**, direkt im NestJS-Backend gemountet (kein Community-Wrapper, kein separater Dienst), mit Prisma-Adapter.

Ergänzende, im Spike gewonnene Festlegungen:

- **Prisma `^6.x`** für Phase 1 (nicht `^7`), bis das Driver-Adapter-Modell von Prisma 7 im Ökosystem (better-auth-Doku, NestJS-Beispiele, interne Erfahrung) besser abgesichert ist. Erneute Bewertung als eigener, kleiner Umstellungsschritt in einer späteren Phase, kein Blocker für den Start.
- Body-Parser- und Express-5-Wildcard-Gotchas (Abschnitt 1) werden als verbindliche Implementierungshinweise in den Phase-1-Setup-Schritt für `apps/api` übernommen.
- better-auths `organization`/`admin`-Plugins werden **nicht** verwendet — unser eigenes Domänenmodell (Abschnitt 4) bleibt alleinige Quelle der Wahrheit für Tenant-/Rollen-/Berechtigungslogik.

ADR 0002 wird auf **ACCEPTED** gesetzt (siehe Abschnitt 10).

---

## 4. Finales RoleAssignment-Modell

**Entscheidung: scope-spezifische, nullable Fremdschlüssel statt polymorpher generischer `scopeId`.**

```
RoleAssignment
├── id                    uuid
├── tenantId              uuid        (Pflicht, direkte RLS-Policy ohne Join)
├── personId              uuid → Person
├── roleId                uuid → Role
├── scopeType             TENANT | DEPARTMENT | TEAM
├── departmentId           uuid? → Department   (nullable FK)
├── teamId                  uuid? → Team          (nullable FK)
├── validFrom / validUntil  timestamp?
└── grantedByPersonId        uuid → Person
```

### Begründung gegenüber polymorpher `scopeId`

- **Referenzielle Integrität**: `departmentId`/`teamId` sind echte Postgres-Fremdschlüssel mit `ON DELETE`-Verhalten, referenzielle Konsistenz wird von der Datenbank garantiert — bei einer generischen `scopeId` ohne Typinformation ist das nicht möglich.
- **Einfache Queries**: "alle Rollen für Team X" ist ein einfacher `WHERE teamId = X`-Filter mit nutzbarem Index, statt eines zusätzlichen Typ-Checks in jeder Query.
- **Verständliche RLS-Regeln**: Policies können direkt auf `teamId`/`departmentId` referenzieren, ohne Scope-Typ-Fallunterscheidung innerhalb der Policy-Logik selbst.
- **Kosten**: zwei zusätzliche nullable Spalten statt einer generischen — vernachlässigbarer Mehraufwand gegenüber dem Integritätsgewinn.

### Constraints gegen ungültige Kombinationen

Postgres-`CHECK`-Constraint (per Migration, da Prismas deklaratives Schema `CHECK`-Constraints je nach gepinnter Version nur eingeschränkt unterstützt — bei Bedarf als rohe SQL-Migration ergänzt):

```sql
ALTER TABLE role_assignment
ADD CONSTRAINT role_assignment_scope_consistency CHECK (
  (scope_type = 'TENANT'     AND department_id IS NULL AND team_id IS NULL) OR
  (scope_type = 'DEPARTMENT' AND department_id IS NOT NULL AND team_id IS NULL) OR
  (scope_type = 'TEAM'       AND team_id IS NOT NULL)
);
```

### Offene Detailfrage entschieden: `departmentId` bei TEAM-Scope redundant speichern?

**Empfehlung: nein, nicht redundant speichern.** `departmentId` bleibt bei `scopeType=TEAM` über die `Team → Department`-Relation ableitbar (ein zusätzlicher Join). Begründung: Teams können (wenn auch selten) die Abteilung wechseln (organisatorische Umstrukturierung); eine redundant gespeicherte `departmentId` auf `RoleAssignment` würde in diesem Fall veralten und stille Inkonsistenzen erzeugen. Der Performance-Nachteil eines zusätzlichen Joins für Kaskaden-Abfragen ("gilt diese Rolle für Abteilung X") ist bei der zu erwartenden Datenmenge (ein Verein, überschaubare Team-/Rollenzahl) vernachlässigbar gegenüber dem Konsistenzrisiko.

### Scope-Kaskade (Autorisierungslogik, nicht Datenmodell)

`TENANT`-Rollen gelten für alle `DEPARTMENT`s/`TEAM`s des Vereins. `DEPARTMENT`-Rollen gelten für alle `TEAM`s dieser Abteilung. `TEAM`-Rollen gelten nur für dieses Team. Wird in der Authorization-Schicht (CASL, Abschnitt 6) berechnet, nicht in der Datenbank materialisiert.

---

## 5. Permission-Katalog (MVP)

Bewusst knapp gehalten — keine feldebenen-genaue Granularität außer explizit benannt (`VIEW_CONTACT_DATA`).

### Ressourcen × Aktionen

| Ressource | CREATE | READ | UPDATE | DELETE | Sonstige Aktionen |
|---|---|---|---|---|---|
| TENANT | (Plattformebene) | ✓ | ✓ | (Plattformebene) | MANAGE |
| DEPARTMENT | ✓ | ✓ | ✓ | ✓ | MANAGE |
| TEAM | ✓ | ✓ | ✓ | ✓ | MANAGE |
| PERSON | ✓ | ✓ | ✓ | ✓ | VIEW_CONTACT_DATA, INVITE |
| MEMBERSHIP | ✓ | ✓ | – | ✓ (revoke) | INVITE |
| ROLE_ASSIGNMENT | ✓ | ✓ | – | ✓ (revoke) | ASSIGN_ROLE |
| TOURNAMENT | ✓ | ✓ | ✓ | ✓ | MANAGE |
| MATCH | ✓ | ✓ | ✓ | ✓ | – |
| EVENT | ✓ | ✓ | ✓ | ✓ | – |
| ATTENDANCE | – | ✓ | ✓ | – | MANAGE_ATTENDANCE |

`MANAGE` ist eine Abkürzung für "alle CRUD-Aktionen auf dieser Ressource innerhalb des eigenen Scopes", keine eigenständige Datenbank-Permission — reduziert Regel-Wiederholung in CASL.

### Rollenkatalog, abgeglichen mit Roles-and-Permissions.md

| Neue technische Rolle | Bisherige deutsche Bezeichnung | Scope |
|---|---|---|
| `TENANT_ADMIN` | Vereinsadministrator (**inkl. Vorstand** — für MVP identische Rechte, keine Unterscheidung ohne konkreten Bedarf) | TENANT |
| `DEPARTMENT_ADMIN` | Abteilungsleiter | DEPARTMENT |
| `YOUTH_DIRECTOR` | Jugendleiter | DEPARTMENT (bezogen auf Jugend-Teams) |
| `TEAM_MANAGER` | Mannschaftsadministrator | TEAM |
| `COACH` | Trainer | TEAM |
| `ASSISTANT_COACH` | Betreuer | TEAM |
| `PLAYER` | Spieler | TEAM |
| `MEMBER` | Mitglied (ohne Team-Zuordnung) | TENANT |
| `GUEST` | Gast | TENANT |

Plattformrollen (separat, `PlatformRoleAssignment`, siehe [0004](./architecture/adr/0004-scoped-rbac-role-assignment.md)): `PLATFORM_OWNER` (= `SUPER_ADMIN`), `PLATFORM_ADMIN`, `PLATFORM_SUPPORT`.

**Wichtig, wie im Auftrag gefordert kritisch geprüft**: `PARENT`/`GUARDIAN`/`Elternteil` erscheint bewusst **nicht** in diesem Rollenkatalog — siehe Abschnitt 6.

### Beispiele

| Person | RoleAssignments | Effektive Rechte (Auszug) |
|---|---|---|
| Trainer E-Jugend | `COACH`, scope=TEAM (E-Jugend) | READ/UPDATE auf PERSON, EVENT, ATTENDANCE, MANAGE_ATTENDANCE — nur für Personen mit RoleAssignment in Team E-Jugend |
| Vereinsadministrator | `TENANT_ADMIN`, scope=TENANT | MANAGE auf allen Ressourcen im gesamten Verein (kaskadiert über alle Departments/Teams) |
| Abteilungsleiter Fußball | `DEPARTMENT_ADMIN`, scope=DEPARTMENT (Fußball) | MANAGE auf TEAM/PERSON/EVENT/TOURNAMENT innerhalb der Abteilung Fußball, keine Sicht auf andere Abteilungen |
| Spieler | `PLAYER`, scope=TEAM (Alte Herren) | READ auf eigene PERSON-Daten, READ auf EVENT/ATTENDANCE des eigenen Teams |
| Elternteil | **kein RoleAssignment** — stattdessen `PersonRelationship(type=PARENT, isLegalGuardian=true)` zum Kind | READ auf PERSON/EVENT/ATTENDANCE **nur der verknüpften Kind-Person** (via Policy, nicht via Rolle) |

---

## 6. Policy-Modell

Bestätigt: **RBAC (RoleAssignment, Abschnitt 4) als Rückgrat + kontextabhängige Policies (ReBAC/ABAC-Schicht) für Beziehungs- und Eigentümer-basierte Fälle**, kombiniert über CASL.

### Zwei unabhängige Bedingungsquellen für eine CASL-`Ability`

1. **Scope-Bedingung** (aus RBAC): "Ich habe Rolle `R` mit Scope `S`" → Zugriff auf Ressourcen, deren `teamId`/`departmentId`/`tenantId` innerhalb von `S` liegt (inkl. Kaskade).
2. **Beziehungs-Bedingung** (aus `PersonRelationship`): "Ich bin verifizierter Erziehungsberechtigter der Person `P`" → Zugriff auf Ressourcen mit `personId = P`, unabhängig von jeder RBAC-Rolle.

Beide Bedingungsquellen werden bei der Ability-Konstruktion pro Request additiv zusammengeführt (`can(...)`-Regeln aus beiden Quellen), nicht exklusiv — ein Elternteil, das gleichzeitig Trainerin ist, erhält die Vereinigung beider Rechte.

### Konkretes Beispiel (CASL-Pseudocode)

```ts
// Scope-basiert (RBAC)
can('read', 'Person', { teamId: { $in: assignedTeamIdsForCoach } })
can('manage', 'Attendance', { teamId: { $in: assignedTeamIdsForCoach } })

// Beziehungsbasiert (ReBAC), unabhängig von RoleAssignment
can('read', 'Person', { id: { $in: verifiedGuardianChildIds } })
can('read', 'Attendance', { personId: { $in: verifiedGuardianChildIds } })

// Selbstzugriff (immer, unabhängig von Rolle/Beziehung)
can('read', 'Person', { id: currentPersonId })
```

Feldebenen-genaue Einschränkungen (z. B. Telefonnummer nur für `COACH`/Erziehungsberechtigte, nicht für alle Team-Mitglieder mit `PLAYER`-Rolle) werden über die separate Aktion `VIEW_CONTACT_DATA` statt über generisches `READ` abgebildet — vermeidet einen dritten, feldbasierten Berechtigungsmechanismus.

---

## 7. Tenant-Kontext

Präzisierung gegenüber `AUTH_IDENTITY_RBAC_ARCHITEKTUR.md`, Abschnitt 10:

1. **Client-Auswahl**: Der Next.js-Client übermittelt den gewünschten Tenant-Kontext explizit (z. B. Subdomain-Routing oder ein `X-Tenant-Id`-Header nach Auswahl in einem "Verein wechseln"-UI). Dieser Wert wird **niemals** allein vertraut.
2. **Serverseitige Validierung**: Ein `TenantContextGuard` prüft vor jedem geschützten Request, ob für den aus der better-auth-Session aufgelösten `User` eine `Membership` mit `status=ACTIVE` zu einer `Person` mit exakt diesem `tenantId` existiert. Kein Treffer → `403`, unabhängig vom Cookie-Gültigkeitsstatus.
3. **Request-scoped Speicherung**: Der validierte Kontext (`{ tenantId, userId, personId }`) wird über `AsyncLocalStorage` für die Dauer des Requests gespeichert — kein globaler/mutable Zustand, keine Vermischung paralleler Requests.
4. **Kopplung an Prisma/`SET LOCAL`** — die kritische technische Regel: `SET LOCAL app.tenant_id = …` wirkt nur innerhalb derselben Datenbank-Transaktion/-Verbindung. Ein separater `SET LOCAL`-Aufruf gefolgt von einer eigenständigen `prisma.xxx.findMany()`-Anfrage **kann auf einer anderen gepoolten Verbindung landen** und die Einstellung stillschweigend verlieren — das wäre ein ernsthafter Isolationsfehler. Deshalb: **jede Datenzugriffs-Operation eines Requests läuft innerhalb eines einzigen `prisma.$transaction(async (tx) => { … })`-Blocks**, dessen erste Anweisung `SET LOCAL app.tenant_id` (parametrisiert, nicht string-konkateniert) ist; alle nachfolgenden Queries im selben Request nutzen ausschließlich `tx`, nie den globalen `prisma`-Client direkt.
5. **Empfohlene Umsetzung**: ein injizierbarer `TenantPrismaService`, der diese Transaktions-/`SET LOCAL`-Kopplung über eine Prisma-Client-Extension (`$extends`) transparent für jede Anfrage kapselt, sodass Feature-Code nie manuell an `$transaction`/`SET LOCAL` denken muss. Der rohe, ungebundene `PrismaClient` wird für Feature-Module nicht exportiert/injizierbar gemacht (Modul-Grenze), um versehentliche Umgehung auszuschließen — konkrete Umsetzung ist Teil der Prisma-Schema-Sprint-Implementierung, nicht dieser Architekturphase.
6. **Fail-closed statt Fail-open**: Die RLS-Policy muss so formuliert sein, dass ein *fehlendes* `app.tenant_id` (z. B. `current_setting('app.tenant_id', true)` liefert `NULL`) zu **keinem** Treffer führt, nicht zu ungefiltertem Zugriff — explizit bei der Policy-Formulierung in Abschnitt 8 zu verifizieren.

---

## 8. RLS-Konzept

Bestätigt gegenüber `ARCHITEKTUR_BERICHT.md`/`AUTH_IDENTITY_RBAC_ARCHITEKTUR.md`, mit der in Abschnitt 7 beschriebenen Fail-closed-Formulierung:

```sql
ALTER TABLE person ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON person
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

Angewendet auf alle tenant-partitionierten Tabellen: `Person`, `RoleAssignment`, `PersonRelationship`, `Department`, `Team`, `Event`, `Attendance`, `Task`, `Tournament`, `TournamentTeam`, `Match`, `Venue`, `Notification`, `AuditLog`. **Nicht** RLS-partitioniert: `User`, `Membership`, `Session`, `Account`, `Verification` (better-auth-eigen), `PlatformRoleAssignment`, `Role`, `Permission`, `Sport` (globale Kataloge) — Zugriff auf `Membership`/`Session` wird stattdessen applikationsseitig auf "nur eigene Einträge" beschränkt.

---

## 9. Aktualisierte Dokumente

Im Rahmen dieses Arbeitspakets synchronisiert (siehe jeweilige Git-Diffs):

- [`docs/database/Database.md`](./database/Database.md) — `Membership` als reine `User↔Person`-Verknüpfung statt Rollenträger; `RoleAssignment`, `PersonRelationship`, `PlatformRoleAssignment` als neue zentrale Entitäten ergänzt.
- [`docs/architecture/Multi-Tenancy.md`](./architecture/Multi-Tenancy.md) — Benutzer-/Vereinsbeziehung über `Person` statt direkt über `Membership`, Tenant-Kontext-Mechanismus referenziert.
- [`docs/product/Roles-and-Permissions.md`](./product/Roles-and-Permissions.md) — Scope-Konzept (TENANT/DEPARTMENT/TEAM) ergänzt, "Elternteil/Sorgeberechtigter" aus dem RBAC-Rollenkatalog entfernt und auf `PersonRelationship` verwiesen.

---

## 10. ADR-Status

| ADR | Status | Änderung in diesem Arbeitspaket |
|---|---|---|
| 0001 – Modularer Monolith | Angenommen | unverändert |
| [0002 – Authentication Strategy](./architecture/adr/0002-authentication-strategy.md) | **ACCEPTED** (aktualisiert) | Spike-Ergebnis, Prisma-6-Pinning und Body-Parser-/Express-5-Gotchas ergänzt |
| [0003 – Identity Model](./architecture/adr/0003-identity-account-person-model.md) | Vorgeschlagen → **ACCEPTED** | Kompatibilität mit better-auths generiertem `User`-Schema im Spike verifiziert |
| [0004 – Scoped RBAC](./architecture/adr/0004-scoped-rbac-role-assignment.md) | Vorgeschlagen → **ACCEPTED** | scopeId-Modellierungsfrage in diesem Dokument (Abschnitt 4) final entschieden und ins ADR übernommen |
| [0005 – Minor/Guardian Relationship Model](./architecture/adr/0005-minor-guardian-relationship-model.md) | Vorgeschlagen → **ACCEPTED** | keine inhaltliche Änderung, nur Statuswechsel |
| [0006 – Multi-Tenant Authorization / RLS Request Context](./architecture/adr/0006-multi-tenant-rls-request-context.md) | **Neu, ACCEPTED** | Dokumentiert die in Abschnitt 7/8 präzisierte `SET LOCAL`+Transaktions-Kopplung, bisher nur in Fließtext, nicht als ADR |

---

## 11. Datenschutz-TODOs

| Punkt | Einstufung |
|---|---|
| Einwilligungsworkflow bei Minderjährigen (Rechtsgrundlage, Dokumentation der Einwilligung) | **BLOCKER BEFORE PILOT** |
| Altersgrenzen (ab wann eigener Account, ab wann Einwilligung durch wen) | **BLOCKER BEFORE PILOT** |
| Erziehungsberechtigten-Verifikation (rechtlich belastbarer Nachweis, nicht nur technische Bestätigung durch `verifiedByPersonId`) | **BLOCKER BEFORE PILOT** |
| Informationspflichten gegenüber Erziehungsberechtigten bei Anlage einer `Person` für ihr Kind | **BLOCKER BEFORE PILOT** |
| AVV Hostinger (VPS-Hosting) | **BLOCKER BEFORE PILOT** |
| AVV Cloudflare (R2 Object Storage) | **BLOCKER BEFORE PILOT** |
| AVV E-Mail-Anbieter (Resend o. Ä.) | **BLOCKER BEFORE PILOT** |
| Auskunft (Art. 15 DSGVO — technische Exportfähigkeit von Personendaten) | **BLOCKER BEFORE PILOT** |
| Löschung/Anonymisierung (technischer Workflow für `Person` nach Vereinsaustritt) | **BLOCKER BEFORE PILOT** |
| Aufbewahrungsfristen (konkrete Werte je Datenkategorie) | **BLOCKER BEFORE PILOT** |
| Audit Logs (Umfang/Aufbewahrung von `AuditLog`-Einträgen für sicherheitsrelevante Zugriffe) | **BLOCKER BEFORE PILOT** |
| Datenexport-Format/-Prozess für einzelne Betroffene | LATER (technisch vorzubereiten, aber kein Launch-Blocker vor erstem Pilotverein) |
| Besondere Kategorien personenbezogener Daten (z. B. Gesundheitsdaten/Allergien), falls solche Felder je eingeführt werden | LATER (nur relevant, sobald ein solches Feld tatsächlich geplant wird) |

Die als **BLOCKER BEFORE PILOT** markierten Punkte müssen vor dem in `Roadmap.md` vorgesehenen Pilotbetrieb (Phase 6) geklärt sein — mehrere davon (Einwilligungsworkflow, Altersgrenzen, Verifikation) beeinflussen das Datenmodell selbst und sollten daher **vor** der Prisma-Schema-Erstellung zumindest informell vorgeklärt werden, nicht erst kurz vor dem Pilotbetrieb.

---

## 12. Verbleibende Risiken

1. Prisma-6-Pinning ist eine bewusste, aber zeitlich begrenzte Entscheidung — Migration auf Prisma 7 (Driver-Adapter-Modell) muss als eigener technischer Task im Backlog geführt werden, sonst verfestigt sich technische Schuld.
2. Der `TenantPrismaService`-Mechanismus (Abschnitt 7) ist architektonisch spezifiziert, aber **nicht implementiert oder unter Last getestet** — reales Verbindungspool-Verhalten unter Prisma 6 + Postgres muss zu Beginn von Phase 1 verifiziert werden.
3. RLS-Policy-Formulierung muss beim tatsächlichen Schreiben der Migration exakt gegen das Fail-closed-Prinzip (Abschnitt 7, Punkt 6) getestet werden — ein einfacher Tippfehler in der Policy könnte das Gegenteil (Fail-open) bewirken.
4. Reverse-Proxy-Header-Verhalten (Traefik → NestJS `trust proxy` → better-auth Cookie-`Secure`-Flag) wurde nur simuliert, nicht gegen eine echte Traefik-Instanz verifiziert — offener Nachtest zu Beginn von Phase 1.
5. Rechtliche Blocker aus Abschnitt 11 sind technisch vorbereitet (Datenmodell unterstützt Verifizierung, Anonymisierung, Audit), aber **nicht rechtlich geprüft** — dieser Bericht ersetzt keine juristische Beratung.
6. YOUTH_DIRECTOR-Rolle (Jugendleiter) hat im aktuellen Scope-Modell keine eigene Scope-Einschränkung "nur Jugend-Teams" — das wird aktuell rein durch bewusste Rollenzuweisung (Admin weist die Rolle nur für Jugend-Teams zu) statt durch eine erzwungene Systemregel sichergestellt. Als bewusste MVP-Vereinfachung dokumentiert, kein Blocker.

---

## 13. Skeleton-Readiness

Prüfung gegen die vom Auftrag vorgegebenen Kriterien:

| Kriterium | Status |
|---|---|
| Auth technisch verifiziert | ✅ Spike erfolgreich, ADR 0002 ACCEPTED |
| RoleAssignment-Modell entschieden | ✅ scope-spezifische FKs + CHECK-Constraint, Abschnitt 4 |
| Permission-Grundmodell vorhanden | ✅ Abschnitt 5 |
| Tenant-Kontext definiert | ✅ Abschnitt 7, inkl. `SET LOCAL`/Transaktionskopplung |
| Doku synchron | ✅ Database.md, Multi-Tenancy.md, Roles-and-Permissions.md aktualisiert |
| ADRs konsistent | ✅ 0002–0006, alle ACCEPTED |

Alle sechs Kriterien sind erfüllt. Die verbleibenden Punkte aus Abschnitt 12 (Punkte 2–4) sind **Verifikationsarbeiten innerhalb von Phase 1**, keine offenen Architekturentscheidungen — sie blockieren den Start des Turborepo-Skeletons nicht, müssen aber vor Abschluss von Phase 1 (Verevia Core) erledigt sein. Die rechtlichen Blocker aus Abschnitt 11 blockieren den **Pilotbetrieb (Phase 6)**, nicht den Skeleton-Start.

**READY FOR SKELETON**

---

## Bezug

- [Architektur-Bericht](./ARCHITEKTUR_BERICHT.md)
- [Auth-, Identity- und RBAC-Architektur](./AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)
- [Datenbank-Entwurf](./database/Database.md)
- [Mandantenfähigkeit](./architecture/Multi-Tenancy.md)
- [Rollen und Berechtigungen](./product/Roles-and-Permissions.md)
- [ADR-Übersicht](./architecture/adr/README.md)
