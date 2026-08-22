# Phase 6 – Account-Einladungen und Eltern-/Kind-Workflow

## 1. Phase-5-PR/Merge

PR #5 (`feat(authz): implement scoped role management`) war grün (Install/Lint/Typecheck/Test/Build + 2× markdown-lint, alle `completed`/`success`), `mergeable_state: clean`, 0 offene Reviews/Kommentare, 0 Secret-Scanning-Alerts. Per GitHub REST API gemergt (Squash), Merge-SHA `0442541`. `main` lokal aktualisiert (`git pull`).

## 2. Branch

`feat/guardian-invitations` von `main` (`0442541`) erstellt. Die gesamte Phase-6-Arbeit ist bisher ausschließlich lokal committed (siehe Abschnitt 20) — noch nicht gepusht, bis dieser Bericht abgeschlossen ist.

## 3. Invitation-Modell

Neue Entität `AccountInvitation` (`packages/database/prisma/schema.prisma`): `id`, `tenantId`, `personId`, `email`, `tokenHash` (unique), `status` (`AccountInvitationStatus`: `PENDING`/`ACCEPTED`/`EXPIRED`/`REVOKED`), `expiresAt`, `invitedByUserId`, `acceptedAt?`, `createdAt`. Kein rohes Token-Feld — es wird nie persistiert (siehe Abschnitt 4). Ein partieller Unique-Index (`account_invitation_pending_person_key` auf `personId` WHERE `status = 'PENDING'`, gleiche Technik wie `TeamMember` in Phase 4) garantiert höchstens eine offene Einladung pro Person, DB-seitig durchgesetzt, nicht nur anwendungsseitig geprüft. Resend revoked zuerst die vorherige `PENDING`-Zeile.

`status = EXPIRED` existiert als Enum-Wert, wird aber **nicht aktiv gesetzt** — Ablauf wird bei jedem Lookup/Accept-Aufruf anhand von `expiresAt < now()` geprüft (kein Cron-Job nötig für dieses Phasenziel); das Feld bleibt für eine spätere Batch-Bereinigung reserviert.

## 4. Token-Sicherheit

`crypto.randomBytes(32)` (256 Bit Entropie), `base64url`-kodiert. Hash: `crypto.createHash("sha256")`. Nur der Hash wird persistiert (`tokenHash`, unique) — das Token selbst ist nach Erzeugung nur einmal sichtbar: in der (dev-only geloggten) Mail und, außerhalb von Produktion (`NODE_ENV !== "production"`), im API-Response-Body von `POST .../invitations` (dev-/test-/VPS-Verifikations-Komfortfeld, da noch kein echter Mail-Versand existiert — die Web-UI liest dieses Feld nie). Single-Use: nach Annahme → `ACCEPTED`, ein zweiter Accept-Versuch mit demselben Token liefert 404 (siehe Test „ein bereits angenommenes Token kann nicht erneut verwendet werden"). Ablauf: 7 Tage. Rate-Limit: max. 3 Einladungen pro Person pro Stunde (einfacher DB-Zähler, kein verteilter Limiter — bewusst proportional zum Phasenziel). Keine Tokens in Logs oder Fehlermeldungen: `lookupPublic`/`accept` liefern bei jedem ungültigen/abgelaufenen/widerrufenen/unbekannten Token denselben generischen 404 — keine Unterscheidung, die eine Token-Enumeration erleichtern würde. Keine eigene Kryptographie — ausschließlich Node-Standardprimitive.

## 5. Mail-Abstraktion

`MailProvider`-Interface (`{send(message): Promise<void>}`) + `MAIL_PROVIDER`-Symbol-Injection-Token + dünner `MailService`-Wrapper + `ConsoleMailProvider` (loggt via NestJS `Logger`, einzig gebundener Provider in `MailModule`). Kein Vendor-Code in der Domänenlogik (`InvitationsService` kennt nur `MailService.send(...)`). Ein echter Provider (Resend/SMTP) ist später ein rein lokaler Austausch in `MailModule`, ohne Anwendungscode anzufassen. Bewusst kein Produktiv-Mail-Setup erzwungen — `.env.example` dokumentiert das explizit.

## 6. Accept-Flow

`GET /api/v1/invitations/:token` (öffentlich, kein Interceptor) liefert `{tenantName, personFirstName, email, accountExists}` für die Annahme-Seite. `POST /api/v1/invitations/accept` verlangt eine bereits bestehende better-auth-Session (Signup/Login läuft über die echten better-auth-Endpunkte, nicht durch eigenen Code) und prüft: Session vorhanden → Token gültig/nicht abgelaufen/`PENDING` → E-Mail der Session stimmt (case-insensitiv) mit der Einladung überein → keine bestehende Membership für die Person → `Membership` anlegen, Einladung → `ACCEPTED`. Der eigene Code übernimmt ausschließlich den letzten Schritt „diese Session-`User` mit dieser `Person` verknüpfen" — Passwort-Hashing/User-Erstellung bleibt vollständig better-auth überlassen.

## 7. User/Membership-Verknüpfung

Existiert bereits ein `User` mit der eingeladenen E-Mail (z. B. weil dieselbe Person bereits Admin eines anderen Tenants ist), meldet sich diese Person über den normalen better-auth-Login an (nicht Signup) und akzeptiert mit derselben Session — es wird **kein zweiter `User`** angelegt, sondern nur eine zusätzliche `Membership` auf den bestehenden `User`. Verifiziert durch einen dedizierten Integrationstest (`adminPrisma.user.count({where:{email}}) === 1` nach Accept).

## 8. Relationship-Modell

`PersonRelationship` (bereits seit Phase 3 im Schema vorhanden, aber bis Phase 6 nie über die Anwendung verwaltbar) ist jetzt über `persons/:personId/relationships` administrierbar: `GET`/`POST`/`DELETE` (DELETE = weiche Deaktivierung, `status → REVOKED`, **nie** Löschen der Zeile oder der `Person`). Typen: `PARENT`, `LEGAL_GUARDIAN`, `EMERGENCY_CONTACT` (bestehende Enum-Werte, keine neuen). Kein verpflichtendes Gegenstück „CHILD" — die gerichtete Beziehung (`fromPerson` → `toPerson`) ist bereits eindeutig. Erstellung ist ausschließlich TENANT_ADMIN vorbehalten und setzt `status` sofort auf `VERIFIED` — das Anlegen selbst **ist** die administrative Verifizierung (kein separater Workflow-Schritt, da nur ein bereits autorisierter TENANT_ADMIN überhaupt anlegen kann). `isLegalGuardian` wird automatisch aus `type === "LEGAL_GUARDIAN"` abgeleitet.

## 9. ReBAC

Drei koexistierende, nicht vermischte Zugriffspfade (`AuthorizationService`): **SELF** (`User` liest die eigene verknüpfte `Person`), **RELATIONSHIP** (verifizierter Guardian liest sein Kind), **RBAC** (bestehende Rollen-Scopes aus Phase 3–5). Neue Methoden: `canManageInvitations`/`canManageRelationships` (beide TENANT_ADMIN-only), `getGuardianChildPersonIds` (filtert auf `VERIFIED` + `PARENT`/`LEGAL_GUARDIAN`, schließt `EMERGENCY_CONTACT` und `PENDING`/`REVOKED` explizit aus), `canAccessPersonAsSelfOrGuardian`. Aufrufstellen (`PersonsService.getById`, `PersonsService.getTeams`, `TeamsService.getById`) kombinieren die bestehende RBAC-Prüfung und die neue ReBAC-Prüfung per OR — architektonisch getrennt gehalten, nicht zu einer Mega-Methode verschmolzen.

## 10. Self Access

Jeder authentifizierte Nutzer darf die eigene verknüpfte `Person` lesen (`GET /api/v1/persons/:id` mit `id = eigene personId`), unabhängig von jeder Rolle — abgedeckt durch einen dedizierten Test. Zusätzlich: `GET /api/v1/me/children` (neu, bewusst **ohne jede RBAC-Prüfung**, da SELF-artig — jeder Nutzer darf ausschließlich seine eigenen verifizierten Kinder sehen) liefert die Grundlage für die neue `/meine-kinder`-Seite.

## 11. Guardian Access

`PARENT` und `LEGAL_GUARDIAN` mit `status = VERIFIED` gewähren Lesezugriff auf: die Kind-`Person` selbst (`GET /persons/:id`), die Mannschaftszugehörigkeit des Kindes (`GET /persons/:id/teams`, neu) und das Team des Kindes (`GET /teams/:id`, via ReBAC-Fallback wenn die reguläre RBAC-Prüfung fehlschlägt). `EMERGENCY_CONTACT` gewährt **bewusst keinen automatischen Zugriff** — eine Beziehungszeile allein ist keine Berechtigung; das ist über einen expliziten Test abgesichert (Notfallkontakt erhält 403 auf die Kind-`Person`). Nicht implementiert (Auftrag: nur die drei genannten Mindest-Endpunkte): globale Kinderliste über mehrere Guardians, Bearbeitungsrechte für Guardians auf Kind-Daten.

## 12. Cross-Tenant

`PersonRelationship.fromPerson`/`toPerson` nutzen dieselbe Composite-FK-Strategie wie alle tenant-gebundenen Relationen seit Phase 3 (`(tenantId, id)`), DB-seitig erzwungen — ein Versuch, eine fremde-Tenant-`Person` als Beziehungsziel zu setzen, scheitert bereits am `Person.findUnique`-Check unter RLS (liefert 404, nicht 500 oder eine erfolgreiche Fehlverknüpfung). `AccountInvitation.tenantId`/`personId` sind konsistent (Composite-FK `(tenantId, personId) → person(tenantId, id)`); eine Einladung kann nie eine `Person` eines anderen Tenants referenzieren. Ein neu getesteter, bislang unentdeckter Bestandslücke wurde nebenbei geschlossen: die Composite-FK von `PersonRelationship` existierte seit Phase 3, war aber nie DB-getestet — jetzt durch drei neue Tests in `cross-tenant-fk.integration.spec.ts` abgedeckt.

## 13. RLS

`AccountInvitation` trägt **bewusst keine Row-Level-Security** — Präzedenzfall ist `Tenant` selbst (ebenfalls ohne RLS, siehe bestehender `schema.prisma`-Kommentar): Der öffentliche Annahme-/Lookup-Flow (`GET /invitations/:token`, `POST /invitations/accept`) kennt den Tenant naturgemäß noch nicht — das ist genau das, was er aus dem Token erst ermittelt. Die Sicherheitsgrenze ist der Besitz des Tokens (256 Bit Entropie), funktional äquivalent zu jedem Passwort-Reset-Link-Muster, nicht Tenant-Mitgliedschaft. Verworfen wurden: eine erhöhte/Superuser-DB-Rolle zur Laufzeit (zu große Angriffsfläche für einen live erreichbaren Web-Prozess) und eine dedizierte Low-Privilege-Rolle nur für diesen Zweck (unverhältnismäßiger Aufwand für diese Phase). Alle admin-seitigen Operationen (Erstellen/Auflisten/Widerrufen) filtern weiterhin explizit nach `tenantId` als anwendungsseitiges Defense-in-Depth-Äquivalent zur fehlenden RLS; die Composite-FK bleibt die DB-seitige Garantie unabhängig von RLS.

**Während der VPS-Verifikation gefundener und behobener Fehler:** `lookupPublic()` fragte die RLS-geschützte `Person`-Tabelle ursprünglich über den einfachen, nicht Tenant-gebundenen `prisma`-Client ab — der für `AccountInvitation` selbst korrekte Ansatz (siehe oben), aber `Person` **ist** RLS-geschützt und war damit unter fehlendem `app.tenant_id`-Kontext für jede Anfrage unsichtbar (`current_setting('app.tenant_id', true)` liefert `NULL`, `"tenantId" = NULL` ist in SQL nie wahr → 0 Zeilen → `findFirstOrThrow` wirft → unbehandelte 500 statt 200). Deterministisch reproduzierbar, nicht durch lokale Unit-Tests (dort gemockt) abgedeckt. Fix: Sobald die Einladung gefunden ist, ist der Tenant bekannt (`invitation.tenantId`) — die folgenden `Person`-Lookups laufen jetzt über `getTenantPrisma(invitation.tenantId)`. Nach dem Fix zweimal grün gegen echtes PostgreSQL verifiziert.

## 14. UI

Personenansicht (`apps/web/src/components/person-management.tsx`): neue Abschnitte „Account" (Status-Badges: Einladung gesendet/Wartet auf Annahme/Abgelaufen/Angenommen/Widerrufen; „Account einladen"-Formular, verschwindet vollständig sobald verknüpft; Widerrufen-Button nur bei `PENDING`) und „Beziehungen" (beide Richtungen, z. B. „Erziehungsberechtigter von Max Mustermann" / „ist Erziehungsberechtigter", Formular zum Hinzufügen mit Personen-/Typ-Auswahl, Entfernen-Button). Keine technischen Begriffe wie „PersonRelationship" im UI-Text. Kein Token jemals in der normalen UI sichtbar. Öffentliche Seite `/einladung/[token]` (Server Component, holt `GET /invitations/:token` direkt) zeigt Verein/Person/E-Mail und delegiert an `InvitationAcceptForm` (Client Component, spiegelt exakt das bestehende `/login`-Muster: Signup-Formular falls kein Account existiert, sonst Login-Formular; E-Mail-Feld nur lesbar). Neue Seite `/meine-kinder` (verlinkt in der Navigation) für Guardians ohne jede administrative Rolle — zeigt eigene verifizierte Kinder samt deren Mannschaften.

## 15. Seed

`Anna Mustermann` (neu, fiktiv, kein Team) mit `PersonRelationship(Anna → Max, LEGAL_GUARDIAN, VERIFIED)`. Kein `User`/`Membership` für Anna im Seed (konsistent mit dem übrigen Umfang der Datei — reine Datenfixtures; ein echter Account entsteht über den echten Einladungs-Flow, nicht fest verdrahtet). Zweimal ausgeführt gegen die leere-DB-Migration auf dem VPS — idempotent, gleiche Tenant-/Personen-IDs bei beiden Läufen.

## 16. Tests

- **Unit** (`authorization.service.spec.ts`): 51/51 grün — inkl. ~15 neuer Tests für `canManageInvitations`/`canManageRelationships`/`getGuardianChildPersonIds`/`canAccessPersonAsSelfOrGuardian` (SELF, RELATIONSHIP, Kind-Kreuzzugriff verweigert, Notfallkontakt verweigert, Fremde verweigert).
- **Web-Unit**: 46/46 grün — inkl. neuer Tests für `person-management.tsx` (Account-/Beziehungen-Abschnitte) und `invitation-accept-form.tsx` (Signup-/Login-Modus, E-Mail-Feld read-only).
- **DB-Integration** (`packages/database`, gegen echtes PostgreSQL 17 auf dem VPS): 38/38 grün — RLS, Cross-Tenant-FK (inkl. der neu geschlossenen `PersonRelationship`-Lücke), `AccountInvitation`-Cross-Tenant-FK, partieller Unique-Index für `PENDING`.
- **API-Integration** (`apps/api`, gegen echtes PostgreSQL 17 auf dem VPS): 65/65 grün nach dem in Abschnitt 13 beschriebenen Fix. `guardian-invitations.integration-spec.ts` deckt alle im Auftrag (Abschnitt 26–28) geforderten Fälle ab: TENANT_ADMIN darf einladen, DEPARTMENT_ADMIN/COACH 403, fremder Tenant 404, bereits verknüpfte Person 409, gültiges Token → genau eine neue Membership, unbekanntes/abgelaufenes/bereits verwendetes/widerrufenes Token jeweils korrekt abgelehnt, bestehender User wird verknüpft statt dupliziert, Relationship-Erstellung + Cross-Tenant-Ablehnung, ReBAC (Guardian eigenes/fremdes Kind, Notfallkontakt, Self, Team-Zugriff über Kind), sowie der zentrale End-to-End-Lebenszyklus-Test (Admin → Kind+Elternteil → Relationship → Einladung → Annahme → Kind sichtbar, fremdes Kind nicht sichtbar).
- **E2E** (Playwright, gegen laufende `apps/api`/`apps/web`-Instanzen + echtes PostgreSQL 17 auf dem VPS): 5/5 grün im finalen Lauf, inkl. `guardian-invitation.spec.ts` — dem zentralen Phase-6-E2E-Test (Admin verknüpft Elternteil per UI mit Kind, Einladung per API erzeugt — der rohe Token ist nach dem UI-Flow unwiederbringlich, da nur der Hash persistiert wird —, Annahme in einem frischen, unauthentifizierten Browser-Kontext über echten Signup, `/meine-kinder` zeigt das eigene Kind, zeigt explizit **nicht** die drei fremden Seed-Personen).
- **Während der VPS-Verifikation gefundener und behobener zweiter Fehler:** `apps/web/e2e/global-setup.ts`s Aufräumlogik für „stale" Test-Personen aus Vorläufen kannte `PersonRelationship`/`AccountInvitation` (beide Phase 6) noch nicht und scheiterte an einer FK-Verletzung, sobald ein vorheriger `guardian-invitation.spec.ts`-Lauf eine noch referenzierte Person hinterlassen hatte. Fix: Löscht jetzt zuerst referenzierende `PersonRelationship`- und `AccountInvitation`-Zeilen, dann die `Person` — gleiche FK-Reihenfolge wie im `afterAll` des API-Integrationstests. Nach dem Fix dreimal in Folge grün reproduziert.
- **Beobachtete, nicht Phase-6-bezogene Umgebungs-Flakiness:** `role-management.spec.ts` (Phase 5) schlug einmal während eines Mehrtest-Laufs mit dem bereits in `playwright.config.ts` dokumentierten Next.js-Streaming-Fehler „destination stream closed early" fehl (bekannt seit Phase 4, siehe dortiger Bericht — eine Latenz-Eigenheit des SSH-getunnelten Dev-DB-Setups, kein Anwendungsfehler). In Isolation lief er zuverlässig grün; im finalen Komplettlauf war nur noch dieser eine, bereits dokumentierte Test betroffen, der zentrale Guardian-Invitation-Test lief in beiden Komplettläufen fehlerfrei durch.

## 17. Datenschutz-TODO

Keine echten Personendaten verwendet (Seed: ausschließlich fiktive „Mustermann"/„Beispiel"-Namen, E2E: `*@example.invalid`-Adressen). Für einen echten Pilotbetrieb offen und **hier ausdrücklich nicht gelöst** (keine Rechtsberatung, nur technische Kennzeichnung offener Punkte):

- **Administrative vs. rechtliche Verifizierung**: Das Anlegen einer `PersonRelationship` durch einen TENANT_ADMIN ist eine organisatorische Aussage („der Verein vertraut dieser Zuordnung"), **keine** rechtsverbindliche Sorgerechts-/Identitätsprüfung. Es gibt keinen Workflow, der das eine mit dem anderen verwechselbar macht (kein Siegel, kein „verifiziert ✓"-Label mit Rechtsanspruch), aber die Unterscheidung muss vor echtem Einsatz an anderer Stelle (Vereinsordnung, Nutzungsbedingungen) explizit gemacht werden.
- **Einwilligung Minderjähriger**: Kein Consent-Mechanismus für die Dateneingabe von Kindern implementiert (Kinder haben ohnehin keinen eigenen Login in diesem Modell — die Einwilligungsfrage betrifft die Erziehungsberechtigten/den Verein als Verantwortlichen, nicht diese Anwendung direkt, aber die Anwendung müsste eine Nachweis-/Dokumentationsmöglichkeit anbieten, sobald das relevant wird).
- **Informationspflichten** (Art. 13/14 DSGVO): Keine automatisierte Benachrichtigung an die Kind-Person (die ohnehin keinen Account hat) oder an bereits bestehende andere Guardians, wenn eine neue `PersonRelationship`/Einladung angelegt wird.
- **Rechtsgrundlage**: Nicht modelliert, welche Rechtsgrundlage (Vertrag, berechtigtes Interesse, Einwilligung) die Speicherung der Beziehung trägt — reine technische Ablage.
- **Aufbewahrung/Löschfristen**: `PersonRelationship`/`AccountInvitation` werden nie hart gelöscht (nur `REVOKED`/`ACCEPTED`), was für Auditierbarkeit gewollt ist, aber ohne eine spätere Lösch-/Anonymisierungsstrategie für „alte", nicht mehr benötigte Zeilen kollidiert das mittelfristig mit Speicherbegrenzung.
- **Widerruf/Entfernung**: `DELETE .../relationships/:id` setzt nur `REVOKED` (siehe Abschnitt 8) — ein vollständiges „Recht auf Löschung" für eine falsch angelegte Beziehung existiert nicht, nur Entzug des Zugriffsrechts.
- **Audit-Log**: Wer wann welche Beziehung/Einladung angelegt/widerrufen hat, ist implizit aus `createdAt`/`invitedByUserId`/`verifiedByPersonId` rekonstruierbar, aber es gibt kein dediziertes, unveränderliches Audit-Log.

## 18. VPS

Neuer temporärer ed25519-Schlüssel (`verevia-phase6-guardian-invitations-<Zeitstempel>`) erzeugt, manuell hinterlegt (nach einem ersten fehlgeschlagenen Versuch — Ursache auf VPS-Seite, siehe Chat-Verlauf, dann erfolgreich), für die gesamte Sitzung verwendet. Temporärer PostgreSQL-17-Container (`verevia-phase6-pg`, an `127.0.0.1` auf dem VPS gebunden, nicht öffentlich erreichbar) + eigenes Volume, per SSH-Tunnel lokal erreichbar gemacht — alle Migrationen/Tests/Server liefen von der lokalen Toolchain aus gegen diese getunnelte Verbindung (etabliertes Muster aus früheren Phasen). Migrationen aus leerer DB (alle 8, inkl. der neuen `20260821090000_add_account_invitation`), Null-Drift bestätigt (`prisma migrate diff --exit-code` → 0), Seed zweimal (idempotent), DB-Integrationstests, API-Integrationstests (inkl. Fund+Fix aus Abschnitt 13), API+Web produktiv gebaut und gestartet, volle E2E-Suite (inkl. Fund+Fix aus Abschnitt 16). Aufräumen: Container+Volume entfernt, Tunnel geschlossen, temporärer Schlüssel aus `authorized_keys` entfernt und die Entfernung durch einen fehlschlagenden neuen Verbindungsversuch verifiziert, lokale Schlüsseldatei gelöscht. `verevia-prod`/Traefik/UFW/Fail2Ban/DNS/dauerhafte SSH-Konfiguration wurden nicht angefasst.

Zwei nicht sicherheitskritische Nebenbefunde während der VPS-Sitzung (beide behoben, siehe oben, keine offenen Punkte): Ein Build mit versehentlich global gesetztem `NODE_ENV=development` schlug fehl (Next.js' Produktions-Build erwartet, den eigenen Modus selbst zu steuern) — kein Anwendungsfehler, nur ein Umgebungsvariablen-Leck aus der API-seitigen Dev-Token-Konvenienz (Abschnitt 4) in den Web-Build-Aufruf; behoben durch expliziten Build-Aufruf ohne `NODE_ENV`-Override. Port 3000 war lokal bereits durch einen unabhängigen, seit über 19 Tagen laufenden Dev-Server eines anderen, nicht mit Verevia verwandten Projekts belegt — dieser wurde bewusst nicht angerührt; Verevia lief für die Verifikation stattdessen auf Port 3100.

Kleiner, ungefährlicher Rückstand auf dem VPS: `~/.ssh/authorized_keys.bak` (von `sed -i.bak` beim Entfernen des temporären Schlüssels erzeugt) konnte nicht mehr selbst gelöscht werden, da der Zugriff exakt in diesem Moment bereits (korrekt) widerrufen war — enthält nur den bereits entfernten Public-Key-Text, kein aktives Credential, kann bei Gelegenheit manuell entfernt werden.

## 19. Quality Gates

`pnpm install --frozen-lockfile`/`lint`/`typecheck`/`test`/`build` (mit Platzhalter-`DATABASE_URL` für den Build-Schritt) sowie `prisma validate` — alle grün, inklusive nach den beiden in Abschnitt 13/16 dokumentierten Fixes erneut verifiziert. Migrationen aus leerer DB, Seed zweimal, RLS/Cross-Tenant/Invitation-/Relationship-/ReBAC-Tests, API-Integration, Web-Unit-Tests, volle E2E-Suite — alle wie in Abschnitt 16/18 beschrieben grün, keine Prüfung deaktiviert.

## 20. GitHub-/PR-Status

Branch `feat/guardian-invitations`, lokal vollständig committed. **Push und PR-Erstellung stehen noch aus** — folgen unmittelbar im Anschluss an diesen Bericht, PR wird bewusst **nicht gemergt**.

## 21. Risiken

- **RLS-Ausnahme für `AccountInvitation`**: Die fehlende RLS ist architektonisch begründet (Abschnitt 13), vergrößert aber dauerhaft die Verantwortung des Anwendungscodes, jede neue Abfrage auf dieser Tabelle korrekt mit `tenantId` zu filtern — ein zukünftiger Entwickler, der eine neue Abfrage ohne diesen Filter hinzufügt, bekäme keinen DB-seitigen Schutz. Sollte dokumentiert bleiben (ist es, siehe Schema-Kommentar) und im Code-Review besonders beachtet werden.
- **Dev-only Token-Feld im API-Response**: Ein Konfigurationsfehler, der `NODE_ENV` in einer echten Produktivumgebung nicht korrekt auf `production` setzt, würde rohe Einladungs-Tokens im API-Response exponieren. Mitigiert durch die Umgebungsvariable selbst als einzige Kontrolle — kein zweiter unabhängiger Schutzmechanismus vorhanden.
- **Kein echter Mail-Versand**: Solange nur der Konsolen-Provider gebunden ist, ist der gesamte Einladungs-Flow für echte Nutzer nicht nutzbar — funktional vollständig, aber nicht einsatzbereit ohne einen echten Provider.
- **Rate-Limit ist einfach**: 3/Stunde pro Person ist ein grober, nicht verteilter Schutz — bei mehreren API-Instanzen (aktuell nicht der Fall) würde er nicht korrekt aggregieren.
- **Administrative Verifizierung als impliziter Vertrauensanker**: Da jede TENANT_ADMIN-erstellte Beziehung sofort `VERIFIED` ist, hängt die Korrektheit des gesamten Guardian-Zugriffsmodells vollständig von der Sorgfalt des jeweiligen Vereinsadministrators ab — siehe Datenschutz-TODO Abschnitt 17.

## 22. Technische Schulden

- `EXPIRED`-Status wird nie aktiv gesetzt (nur zur Lookup-Zeit geprüft) — für eine spätere Aufräum-/Reporting-Funktion wäre ein Batch-Job sinnvoll, der abgelaufene `PENDING`-Zeilen periodisch markiert.
- Kein Audit-Log als eigene Entität (nur implizit aus bestehenden Timestamps/Foreign-Keys rekonstruierbar).
- `RelationshipsService` (administrative Verwaltung) und `PersonRelationshipsAuthService` (ReBAC-Ladepfad) sind bewusst getrennt gehalten, was aktuell etwas Code-Verdopplung beim Laden von `PersonRelationship`-Zeilen bedeutet — für die aktuelle Größe des Permission-Modells vertretbar (siehe `AuthorizationService`-Kommentar zu CASL als späterer Migrationspfad), potenziell konsolidierbar, sobald ein Regelwerk-Framework eingeführt wird.
- Die in Abschnitt 13 gefundene Fehlerklasse (stiller RLS-Bypass durch versehentliche Nutzung des ungebundenen `prisma`-Clients) ist strukturell wiederholbar — kein Lint-Regel/Typsystem-Schutz verhindert aktuell, dass ein künftiger Entwickler denselben Fehler an anderer Stelle macht. Eine ESLint-Regel oder ein Wrapper-Typ, der den plain `prisma`-Import für RLS-Tabellen erschwert, wäre eine sinnvolle spätere Härtung.

## 23. Nächster empfohlener Schritt

Aus Sicht der technischen Umsetzung ist Phase 6 vollständig und verifiziert abgeschlossen. Als nächster fachlicher Schritt böte sich ein echter Mail-Provider (z. B. Resend) mit echten Zugangsdaten an, um den Einladungs-Flow tatsächlich nutzbar zu machen — das war laut Auftrag explizit nicht Teil dieser Phase. Alternativ, falls der Fokus zunächst auf der Kernfunktionalität des Vereins bleiben soll: Trainings-/Termin-/Anwesenheitsverwaltung (bislang nur als Datenmodell-Platzhalter vorhanden, siehe `Event`/`Attendance` in `Database.md`) — ausdrücklich nicht ohne weitere Freigabe begonnen.
