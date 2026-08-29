# Phase 11 – Fußball-Turnier-Grundfundament (Tournament Core)

## 1. Phase-10-Abschluss

PR #12 (`feat(football): add venue and match foundation`) war grün und wurde gemergt (Merge-SHA `5a5de3e`). Das anschließende Automatic-Deploy-DEV lief real (nach einem transienten `ssh-keyscan`-Fehlschlag per `workflow_dispatch` erfolgreich nachgestartet) und wurde live gegen `https://app.verevia.app`/`https://api.verevia.app` verifiziert. PR #13 (`docs(deploy): record the real Phase 10 DEV deployment and live verification`) wurde zu Beginn dieses Arbeitspakets geprüft und gemergt (Merge-SHA `9efdfd7`) — Auftrag Abschnitt 0.

## 2. Branch

`feat/tournament-core` von `main` (`9efdfd7`) erstellt.

## 3. Tournament-Modell

Entität `FootballTournament` (football-spezifischer Name wie im Auftrag ausdrücklich sanktioniert, analog `FootballMatch`). Felder: `id`, `tenantId`, `departmentId`, `seasonId?`, `name`, `description?`, `startsAt`, `endsAt?`, `status`, `mode?`, `createdAt`, `updatedAt`. UI-Begriff "Turnier". `seasonId` bewusst **optional**: ein Turnier existiert unabhängig davon, ob es einer laufenden Saison zugeordnet ist (z. B. ein Turnier in der Sommerpause zwischen zwei Saisons).

## 4. Status

`TournamentStatus`-Enum: `DRAFT`/`PLANNED`/`ACTIVE`/`COMPLETED`/`CANCELLED` — schlanker, flacher Lebenszyklus ohne Workflow-Engine, exakt nach dem `MatchStatus`/`SeasonStatus`-Vorbild. Ein abgesagtes Turnier wird per Status `CANCELLED` markiert, kein DELETE-Endpunkt.

## 5. Mode

`TournamentMode`-Enum: `GROUPS`/`KNOCKOUT`/`GROUPS_AND_KNOCKOUT`, nullable (ein `DRAFT`-Turnier hat seine Struktur womöglich noch nicht festgelegt) — rein deskriptiv, **keine** automatische Logik daran geknüpft (keine Gruppengenerierung, kein Bracket).

## 6. Participant-Modell

Neue Entität `TournamentParticipant`: `id`, `tenantId`, `tournamentId`, `teamSeasonId?`, `externalName?`, `groupId?`, `status`, `seed?`, `createdAt`, `updatedAt`. Zentrale Regel: **genau eine** Quelle — interne `TeamSeason` ODER externer Freitextname, nie beides, nie keines — per DB-`CHECK`-Constraint (`tournament_participant_source_xor`) erzwungen, zusätzlich applikationsseitig in `ParticipantsService.create` mit einer klaren 400-Fehlermeldung vorab geprüft.

## 7. Interne vs. externe Teilnehmer

Interne Teilnehmer referenzieren eine bestehende `TeamSeason` (z. B. "TSV Benediktbeuern E1") — Cross-Tenant- und Fußball-only-Eigenschaft gelten strukturell mit (wie bei `FootballMatch.teamSeasonId`, Phase 10). Externe Teilnehmer sind bewusst leichtgewichtig: nur `externalName` (Freitext, z. B. "SV Beispielhausen U11") — **kein** neues Club-/Team-Datenmodell für externe Vereine. Dokumentierter Erweiterungspunkt (Schema-Kommentar): falls künftig mehr externe Stammdaten nötig werden (z. B. Kontakt, wiederkehrende externe Vereine über mehrere Turniere hinweg), wäre ein eigenes `ExternalClub`-Modell der nächste Schritt — für den MVP reicht `externalName`.

## 8. Duplikatschutz

Zwei partielle Unique-Indizes (Prisma 6 bildet weder `WHERE`-Klauseln noch Ausdrucks-Indizes deklarativ ab, gleiches Muster wie `account_invitation_pending_person_key`/`season_active_department_key`): `tournament_participant_internal_unique` auf `(tournamentId, teamSeasonId) WHERE teamSeasonId IS NOT NULL` (dieselbe interne `TeamSeason` nicht zweimal im selben Turnier) und `tournament_participant_external_unique` auf `(tournamentId, lower(externalName)) WHERE externalName IS NOT NULL` (case-insensitiver Duplikatschutz für externe Namen, je Turnier — derselbe externe Name in einem ANDEREN Turnier ist kein Duplikat).

## 9. Venue-Zuordnung

Neue Zuordnungsentität `TournamentVenue`: `tenantId`, `tournamentId`, `venueId`, `displayOrder?`, `label?` (z. B. "Hauptplatz"/"Nebenplatz") — referenziert die bestehende `Venue` (Phase 10), **keine** Dopplung von `Venue.name`. Ein Turnier kann mehrere Spielstätten nutzen (`@@unique([tournamentId, venueId])` verhindert Doppelzuordnung derselben Spielstätte).

## 10. Group-Modell

Neue Entität `TournamentGroup`: `id`, `tenantId`, `tournamentId`, `name`, `displayOrder`, `createdAt`, `updatedAt`. Manuell angelegt, **keine** automatische Gruppenbildung/-verteilung. Eindeutig je Turnier/Name (`@@unique([tournamentId, name])`).

## 11. Participant-zu-Group-Entscheidung

Nullable `groupId` direkt auf `TournamentParticipant`, **keine** separate Join-Tabelle `TournamentGroupParticipant`. Begründung: ein Teilnehmer gehört fachlich zu höchstens einer Gruppe (klassische Gruppenphase) — ein K.-o.-only-Teilnehmer braucht schlicht keine Gruppe (`groupId: null`). Eine m:n-Join-Tabelle wäre eine unnötige Struktur für eine 1:n-Beziehung ohne aktuellen Bedarf.

## 12. FootballMatch-Erweiterung — die zentrale Entscheidung

`FootballMatch` wurde um vier nullable Spalten erweitert (`tournamentId?`, `tournamentGroupId?`, `homeParticipantId?`, `awayParticipantId?`); `teamSeasonId`/`opponentName` wurden von verpflichtend auf optional gelockert. **Keine neue, separate `TournamentMatch`-Entität** — ein Turniermatch ist ein `FootballMatch` mit `type: TOURNAMENT` und gesetztem `tournamentId`. Ausführliche Begründung, verworfene Alternativen (separates `TournamentMatch`-Modell; polymorphe `participantId`/`participantType`-Spalten — exakt die Art generischer `scopeId`-Struktur, gegen die die etablierte ADR 0004 bereits argumentiert; `teamSeasonId` verpflichtend mit separater Join-Tabelle) und Konsequenzen: **[ADR 0008](architecture/adr/0008-tournament-match-model.md)**.

## 13. Tournament-Match-Architektur

Ein `FootballMatch` ist über eine einzige DB-`CHECK`-Constraint (`football_match_mode_consistency`) in genau einem von zwei sich gegenseitig ausschließenden Modi: **Vereinsmatch** (`teamSeasonId`+`opponentName` gesetzt, alle vier Turnierfelder `NULL`) oder **Turniermatch** (`tournamentId`+`homeParticipantId`+`awayParticipantId` gesetzt und `homeParticipantId <> awayParticipantId`, `tournamentGroupId` optional, `teamSeasonId`/`opponentName` `NULL`). Eine zweite CHECK-Constraint (`football_match_tournament_requires_type`) erzwingt `tournamentId IS NULL OR type = 'TOURNAMENT'` — **nicht** die Umkehrung: ein normales Vereinsmatch darf weiterhin `type: TOURNAMENT` tragen, ohne einem Verevia-Turnier zugeordnet zu sein (z. B. Teilnahme an einem extern organisierten Turnier, das nur als normales Spiel im Vereinskalender erfasst wird) — per DB-Test verifiziert (Abschnitt 22).

## 14. Participant-vs.-Match-Architektur

Die "Composite-FK-Doppelnutzung": `TournamentGroup` und `TournamentParticipant` erhalten je einen zusätzlichen Drei-Spalten-Unique-Index `(tenantId, tournamentId, id)`. `FootballMatch`s Fremdschlüssel auf `tournamentGroupId`/`homeParticipantId`/`awayParticipantId` sind dadurch Drei-Spalten-Composite-FKs `(tenantId, tournamentId, X) → (tenantId, tournamentId, id)` — das erzwingt strukturell (ohne Trigger), dass die referenzierte Gruppe/der referenzierte Teilnehmer zu **genau demselben** Turnier gehört wie das Match. Damit sind alle vier vom Auftrag geforderten Fälle abbildbar: normales Vereinsmatch (`teamSeasonId`+`opponentName`), internes Turniermatch (Teilnehmer vs. Teilnehmer, beide intern), intern vs. extern, sowie zwei externe Teilnehmer gegeneinander — ohne UI-Ausbau in dieser Phase, aber DB- und API-seitig vollständig repräsentierbar.

## 15. Tournament-/Group-Konsistenz

Anwendungsseitig in `MatchesService` (neue Methoden `createTournamentMatch`/`updateTournamentMatch`) geprüft: Turnier existiert und gehört zum Tenant; `homeParticipantId`/`awayParticipantId` existieren, gehören zu **diesem** Turnier und sind verschieden; `tournamentGroupId` (falls gesetzt) gehört zu diesem Turnier; `venueId` (falls gesetzt) ist Teil der `TournamentVenue`-Menge dieses Turniers (applikationsseitiger Guardrail, da über zwei weitere Tabellen hinweg — nicht als reine DB-CHECK ausdrückbar); `type` wird serverseitig unabhängig vom übermittelten Wert immer auf `TOURNAMENT` gesetzt, sobald `tournamentId` vorliegt.

## 16. Season-Department-Konsistenz

`Season` wurde um einen neuen Drei-Spalten-Unique-Index `(tenantId, departmentId, id)` ergänzt; `FootballTournament.seasonId` ist ein Drei-Spalten-Composite-FK `(tenantId, departmentId, seasonId) → season(tenantId, departmentId, id)` — erzwingt strukturell, dass eine referenzierte Saison zur selben Abteilung gehört wie das Turnier (z. B. keine Tennis-Saison an einem Fußballturnier), exakt nach dem `TeamSeason`-Vorbild aus Phase 9.

## 17. API

- `GET/GET:id/POST/PATCH /api/v1/football/tournaments` (Filter `?departmentId=`/`?seasonId=`/`?status=`), kein DELETE (Status `CANCELLED` statt Löschen).
- `GET/POST /api/v1/football/tournaments/:id/participants`, `PATCH .../participants/:participantId`, `DELETE .../participants/:participantId` (Hard-Delete nur wenn nicht bereits in einem Match referenziert — sonst `409 Conflict` mit Hinweis auf `status: WITHDRAWN`).
- `GET/POST /api/v1/football/tournaments/:id/venues`, `DELETE .../venues/:venueId` (nur wenn keine Turniermatches diese Spielstätte mehr nutzen, sonst `409 Conflict`).
- `GET/POST /api/v1/football/tournaments/:id/groups`, `PATCH .../groups/:groupId` — bewusst **kein** DELETE (MVP-Einfachheit, gleiches Muster wie `AgeGroup`/`Season`).
- `GET/POST /api/v1/football/tournaments/:id/matches` — dünne Convenience-Routen (`TournamentMatchesController`), die intern **denselben** `MatchesService` verwenden wie die normalen `/api/v1/football/matches`-Routen; keine zweite, parallele Business-Logik.

## 18. Authorization

Weiterhin **keine neuen Rollen**, ausdrücklich **kein `TURNIERLEITER`** in dieser Phase. `FootballTournament`/`TournamentParticipant`/`TournamentVenue`/`TournamentGroup` sind bewusst eine direkte Wiederverwendung von `canOnSeason` (keine neue `canOnTournament`-Methode) — die gewünschte Rollenlogik ist byte-identisch: `TENANT_ADMIN` immer; `DEPARTMENT_ADMIN` der eigenen Fußballabteilung erstellt/bearbeitet; Lesen folgt der Department-Scope-Kaskade (abteilungsgebundene Rolle in dieser Abteilung, oder teamgebundene Rolle deren Team zu dieser Abteilung gehört). Turniermatches (`FootballMatch` mit `tournamentId`) werden **ebenfalls** über `canOnSeason` autorisiert, **nicht** über `canOnMatch` wie normale Vereinsmatches — es gibt kein eindeutiges "eigenes Team" (beide Seiten sind `TournamentParticipant`, ggf. beide extern), über das `canOnMatch` entscheiden könnte. Damit dürfen `COACH`/`TEAM_MANAGER`/`ASSISTANT_COACH` Turniere ihrer Abteilung nur **lesen**, nicht anlegen — anders als bei normalen Matches ist Turnierorganisation im MVP eine administrative Aufgabe.

## 19. RLS

Alle vier neuen Tabellen (`football_tournament`, `tournament_participant`, `tournament_venue`, `tournament_group`) haben `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + vier fail-closed Policies, exakt nach etabliertem Muster. Die DMMF-basierte Auto-Ableitung von `TENANT_SCOPED_MODELS` (`packages/database/src/tenant-prisma.ts`) wurde erneut **unverändert weiterverwendet** — alle vier neuen Modelle automatisch korrekt erkannt (verifiziert per Unit-Test, jetzt 15 statt 11 tenant-gebundene Modelle), **keine Codeänderung an `tenant-prisma.ts` nötig**.

## 20. Composite FKs

Durchgängig nach etabliertem Muster: `FootballTournament`→`Department`/`Season` (composite), `TournamentParticipant`→`FootballTournament`/`TeamSeason`/`TournamentGroup` (composite, letzterer drei-spaltig), `TournamentVenue`→`FootballTournament`/`Venue` (composite), `TournamentGroup`→`FootballTournament` (composite), `FootballMatch`→`FootballTournament`/`TournamentGroup`/`TournamentParticipant` (composite, die letzten drei drei-spaltig — siehe Abschnitt 14). Cross-Tenant ist DB-seitig strukturell ausgeschlossen, per dedizierten negativen Tests verifiziert (Abschnitt 22).

## 21. UI

Neue Routen: `/fussball/turniere` (Turnierliste, mobile-first: Name, Datum, Status, Modus, Teilnehmer-/Gruppenanzahl; leerer Zustand "Noch keine Turniere angelegt."; "Turnier anlegen"-Link nur für berechtigte Rollen), `/fussball/turniere/neu` (Formular: Name, Beschreibung, Beginn/Ende, Saison falls vorhanden, Modus — **keine** automatische Spielplanerzeugung, öffnet nach dem Anlegen direkt die Turnierdetailseite), `/fussball/turniere/:id` (fünf Abschnitte: Übersicht mit Bearbeiten-Formular, Teilnehmer inkl. getrennter Formulare für interne/externe Mannschaft mit klarer Kennzeichnung "Verevia-Mannschaft"/"Externe Mannschaft", Gruppen inkl. manuellem Anlegen und Zuweisen, Spielstätten inkl. Auswahl aus bestehenden `Venue`s und Link zur Spielstättenverwaltung, Spiele inkl. manuellem Anlegen mit Teilnehmer-/Gruppen-/Spielstätten-Auswahl). Navigation: neuer Link "Turniere" auf der Fußball-Übersicht (neben "Spiele") — bewusst **kein** neuer Top-Level-Nav-Eintrag. Keine sichtbaren technischen IDs. Ein neuer, generischer `DateTimeInput`-Client-Component (Phase 10s `MatchDateTimeInput` wurde zu einem dünnen Wrapper darüber refaktoriert, um die UTC-Konvertierungslogik nicht zu duplizieren) unterstützt sowohl `startsAt` als auch `endsAt`.

## 22. Seed

Erweitert um: Turnier "Verevia Jugendcup 2026" (Saison 2026/2027, Modus `GROUPS`, Status `PLANNED`), vier Teilnehmer (1 intern — E1, 3 extern — "SV Testhausen"/"FC Musterstadt"/"TSV Beispieldorf", ausschließlich fiktiv), zwei Gruppen ("Gruppe A"/"Gruppe B", je zwei Teilnehmer — genug Teilnehmer, um die Gruppierung tatsächlich zu demonstrieren), die bestehende Demo-Spielstätte als Turnier-Spielstätte zugeordnet, ein manuell angelegtes `TOURNAMENT`-Match (E1 gegen SV Testhausen, Gruppe A). Vollständig idempotent (`findFirst`-vor-`create`, da `FootballTournament` keinen natürlichen Unique-Schlüssel zum Upserten hat) — zweifacher Lauf real gegen PostgreSQL 17 verifiziert (identische IDs; Zähl-Query bestätigt exakt 1 Turnier/4 Teilnehmer/2 Gruppen/1 Spielstättenzuordnung/4 Spiele insgesamt nach zwei Läufen).

## 23. DB-Tests

Neu (`packages/database/src/__tests__/tournament-core.integration.spec.ts`, 25 Tests): Turnier-Tenant-Isolation, Cross-Department-Ablehnung (fremde Abteilung, fremde-Department-Season), Datumsbereichs-CHECK, Participant-XOR in beide Richtungen (beides gesetzt / nichts gesetzt), Duplikatschutz (intern doppelt, extern case-insensitiv doppelt, gleicher externer Name in anderem Turnier erlaubt), Cross-Tenant-`teamSeasonId`, `TournamentVenue`/`TournamentGroup`-Cross-Tenant-Ablehnung, `FootballMatch`-Modus-Konsistenz (beides gesetzt, nichts gesetzt, `home == away`, `tournamentId` ohne `type: TOURNAMENT`, `type: TOURNAMENT` ohne `tournamentId` — akzeptiert für externe Turniere), "falsches Turnier"-Ablehnung für Teilnehmer UND Gruppe (Composite-FK-Guardrail, gleicher Tenant, anderes Turnier), Cross-Tenant-Teilnehmer-Ablehnung, RLS fail-closed. Real gegen PostgreSQL 17 verifiziert: 94/94 Tests der gesamten DB-Integrationssuite grün (5 Dateien, keine Regression).

## 24. API-Tests

Neu (`apps/api/test/tournament-core.integration-spec.ts`, 21 Tests): 401 ohne Session, TENANT_ADMIN/DEPARTMENT_ADMIN Turnier CREATE/UPDATE, DEPARTMENT_ADMIN-fremde-Abteilung-verboten (403), TENANT_ADMIN-Turnier-für-Tennis-Abteilung-verboten (400, Fußball-only-Guardrail), COACH liest aber erstellt nicht, interne/externe Teilnehmeraufnahme, ungültige XOR-Kombination (400), Cross-Tenant-Teilnehmer (404 — durch RLS unsichtbar), COACH-Teilnehmer-Aufnahme-verboten, Spielstättenzuordnung inkl. Duplikat (409) und Entfernen-mit-referenzierendem-Match (409), Gruppenanlage inkl. Duplikat (409), Teilnehmer-zu-Gruppe-Zuweisung inkl. falscher Turnierkontext (404), manuelle Turniermatch-Anlage über die Convenience-Route (inkl. serverseitig erzwungenem `type: TOURNAMENT` trotz falsch übermitteltem Wert), falscher Teilnehmer-Turnierkontext (404), Spielstätte nicht dem Turnier zugeordnet (400), COACH-Turniermatch-Anlage-verboten (403, via `canOnSeason` statt `canOnMatch`). Real verifiziert: 121/121 Tests der gesamten API-Integrationssuite grün (9 Dateien, keine Regression).

## 25. Web-Tests

Neu (3 Dateien, 17 Tests): Turnierliste (leerer Zustand, Name/Status/Teilnehmer-/Gruppenanzahl, Anlegen-Link-Sichtbarkeit, keine sichtbaren technischen IDs), Turnier-anlegen-Formular (Pflichtfelder, Saison-Select nur bei vorhandenen Saisons, keine sichtbaren technischen IDs), Turnierdetail (Name/Status/Modus, interne-vs.-externe-Kennzeichnung, leere Zustände aller vier Unterabschnitte, Gruppen-mit-zugewiesenem-Teilnehmer, Spielstätte mit Bezeichnung, Turnierspiel-Anzeige, autorisierungsabhängige Ein-/Ausblendung sämtlicher Bearbeiten-/Anlegen-Formulare — mit und ohne Berechtigung, keine sichtbaren technischen IDs).

## 26. E2E

Neu (`apps/web/e2e/tournament-core.spec.ts`): TENANT_ADMIN → Fußball → Turniere → neues Turnier anlegen → interne E1-Mannschaft hinzufügen → externe Mannschaft hinzufügen → Gruppe A anlegen → E1 der Gruppe zuweisen → Spielstätte hinzufügen → manuell ein Turnierspiel anlegen (E1 gegen die externe Mannschaft) → Turnierdetail zeigt alles korrekt an. Keine automatische Spielplan-/Bracket-Erzeugung. Zusätzlich: COACH E1 liest ein Turnier, aber keine administrativen Aktionen sichtbar (kein Anlegen-Link, keine Bearbeiten-/Anlegen-Formulare). Während der VPS-Verifikation trat wiederholt ein bereits dokumentiertes, vorbestehendes Next.js-Infrastruktur-Problem auf ("destination stream closed early" unter SSH-Tunnel-Latenz, siehe `playwright.config.ts`) — eine direkte DB-Abfrage bestätigte, dass die betroffene Mutation (Spielstättenzuordnung) tatsächlich korrekt persistiert wurde, nur die gestreamte Client-Aktualisierung kam nicht an. Behoben durch eine gezielte Testhilfsfunktion (`expectVisibleAfterSubmit`), die bei Ausbleiben der erwarteten Änderung einmalig neu lädt (ein vollständiger Seitenaufbau umgeht den defekten Streaming-Diff) — kein Anwendungscode geändert, da die Mutation selbst nachweislich korrekt war. Nach dieser Anpassung über mehrere komplette Suite-Läufe hinweg durchgehend grün (12/12 E2E-Tests insgesamt, inkl. der bestehenden Suiten, keine Regression). Ebenfalls während der Testentwicklung gefunden und behoben: zwei eigene Testfehler (bare `getByText`-Locator trafen sowohl das sichtbare Badge als auch das gleichlautende Präfix eines Formular-Labels — behoben mit `exact: true`, analog zum in Phase 10 dokumentierten Options-Text-Problem).

## 27. PostgreSQL-17-Verifikation

Real durchgeführt, gemäß Auftrag Abschnitt 44. Temporärer PostgreSQL-17-Container (`verevia-phase11-pg17-test`, eigenes Docker-Volume) auf `127.0.0.1` des VPS, per SSH-Tunnel lokal erreichbar gemacht (sitzungsgebundener Phase-11-Key, vom Nutzer manuell hinterlegt und per `grep` verifiziert). Ablauf:

1. `prisma migrate deploy` aus leerer DB: alle 11 Migrationen (inkl. der neuen `20260828120000_add_tournament_core`) erfolgreich.
2. `prisma migrate status` → "Database schema is up to date!"; `prisma migrate diff` gegen die live migrierte DB → leerer Diff (0 Drift) — zusätzlich zu einem bereits vorab (ohne Live-DB) durchgeführten statischen Schema-Diff, der exakt dieselben Anweisungen wie die von Hand verfasste Migration ergab.
3. Seed zweimal → idempotent (identische IDs; Zähl-Query bestätigt exakt 1 Turnier/4 Teilnehmer/2 Gruppen/1 Turnier-Spielstättenzuordnung/4 Spiele insgesamt nach zwei Läufen).
4. DB-Integrationstests: 94/94 grün.
5. API-Integrationstests: 121/121 grün.
6. `apps/api`/`apps/web` produktiv gebaut und gestartet (Port 3001/3100 — Port 3000 durch ein unabhängiges, seit 26 Tagen laufendes lokales Projekt belegt, nicht angetastet).
7. Volle Playwright-E2E-Suite: 12/12 grün (nach Behebung der in Abschnitt 26 genannten Probleme, über mehrere Wiederholungsläufe hinweg stabil).
8. Vollständig aufgeräumt: temporärer Container und Docker-Volume entfernt (verifiziert: nur die permanenten `verevia-dev-*`/`verevia-traefik`-Container verbleiben, `verevia-prod` nicht vorhanden/nicht angetastet), SSH-Tunnel geschlossen, lokale `api`/`web`-Prozesse beendet, temporärer SSH-Key aus `authorized_keys` entfernt und die Entfernung sowohl per `grep` (0 Treffer) als auch durch einen fehlschlagenden erneuten Verbindungsversuch mit demselben Private Key verifiziert (`Permission denied (publickey,password)`), lokale Schlüsseldateien gelöscht.

**Kleiner, unschädlicher Rückstand** (ähnliches Muster zu Phase 10, diesmal in `/tmp` statt `~/.ssh`): eine vor der Schlüsselentfernung selbst angelegte Sicherungskopie `/tmp/authorized_keys.phase11-pre-removal.bak` auf dem VPS (enthält ausschließlich den bereits entzogenen öffentlichen Schlüsseltext plus die vorbestehende Leerzeile) konnte nach dem Zugriffsentzug nicht mehr selbst gelöscht werden — kein Sicherheitsrisiko (kein `~/.ssh`, kein gültiger Schlüssel, üblicherweise ohnehin flüchtiges `/tmp`). Befehl für den Nutzer, falls gewünscht: `rm /tmp/authorized_keys.phase11-pre-removal.bak`. Der bereits aus Phase 10 bekannte, nicht mit dieser Sitzung zusammenhängende Rückstand `~/.ssh/authorized_keys.bak` (Datum 27.08., vor dieser Sitzung) wurde unangetastet gelassen, wie in Auftrag Abschnitt 46 gefordert.

Kein tatsächliches Deployment auf die permanente DEV-Umgebung in diesem Schritt — Auftrag Abschnitt 49 sieht für diese Phase ausdrücklich **kein** Deployment vor (PR bleibt ungemergt bis zur separaten Freigabe durch den Product Owner).

## 28. Quality Gates

Vollständig grün, lokal und real gegen PostgreSQL 17: `pnpm install --frozen-lockfile`, `pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle 7 Pakete), `prisma validate`, statischer und Live-Migrations-Drift-Check (beide 0 Diff), Migration aus leerer DB, Seed 2×, DB-Integrationstests, API-Integrationstests, Web-Tests, volle E2E-Suite. Keine Tests deaktiviert, keine Warnungen wegkonfiguriert.

## 29. VPS-Aufräumen

Temporärer Postgres-Container + Docker-Volume vollständig entfernt und verifiziert (Abschnitt 27, Punkt 8). `verevia-prod` nicht vorhanden und nicht angetastet. Der permanente GitHub-Deploy-Key (separate Identität `verevia-deploy`, siehe Phase-8-Bericht) wurde zu keinem Zeitpunkt berührt — die gesamte VPS-Arbeit dieser Phase lief ausschließlich über den dedizierten, temporären Phase-11-Key.

## 30. SSH-Key-Aufräumen

Ausschließlich der Schlüssel mit dem Kommentar `verevia-phase11-tournament-core-1787985663` wurde entfernt — per `grep` vor Entfernung lokalisiert (Zeile 2 von `~/.ssh/authorized_keys`), gezielt per `grep -v` herausgefiltert (nicht pauschal überschrieben), Entfernung per erneutem `grep` (0 Treffer) sowie einem fehlschlagenden SSH-Verbindungsversuch mit exakt demselben, jetzt entzogenen Private Key verifiziert (`Permission denied (publickey,password)`, Exit-Code 255). Die einzige verbleibende Zeile in `~/.ssh/authorized_keys` (eine bereits vor dieser Sitzung vorhandene Leerzeile) blieb unverändert. Kein anderer Eintrag berührt.

## 31. Risiken

- Die Composite-FK-"Doppelnutzung" (Abschnitt 14) ist strukturell elegant, aber für neue Entwickler:innen ohne die ADR-0008-Begründung nicht sofort ersichtlich, warum `TournamentGroup`/`TournamentParticipant` einen zusätzlichen Drei-Spalten-Unique-Index tragen — im Schema-Kommentar und in ADR 0008 ausführlich dokumentiert, um dieses Risiko zu mindern.
- `externalName` als Freitext ermöglicht Tippfehler/Inkonsistenzen bei wiederkehrenden externen Vereinen (gleiche Klasse von Risiko wie `opponentName` in Phase 10) — bewusst in Kauf genommen für den MVP, siehe Erweiterungspunkt Abschnitt 7.
- Der applikationsseitige Guardrail "Spielstätte muss dem Turnier zugeordnet sein" (Abschnitt 15) ist nicht DB-seitig erzwingbar (spannt zwei weitere Tabellen auf) — durch dedizierte Tests abgesichert, aber ein direkter DB-Zugriff außerhalb der API würde ihn umgehen (gleiche Risikoklasse wie alle bereits dokumentierten applikationsseitigen Guardrails in früheren Phasen).
- Bekannte, vorbestehende Next.js-Streaming-Flakiness unter SSH-Tunnel-Latenz (Abschnitt 26/27) — kein Phase-11-spezifisches Risiko, aber durch die deutlich längere Kette an Server Actions in diesem Test häufiger sichtbar geworden als bisher; die Testhilfsfunktion `expectVisibleAfterSubmit` macht das Verhalten robust, ohne das zugrunde liegende (bereits dokumentierte, nicht Phase-11-verursachte) Infrastrukturproblem selbst zu beheben.

## 32. Technische Schulden

- Keine neuen. Die DMMF-basierte `TENANT_SCOPED_MODELS`-Auto-Ableitung (Phase 9) hat sich erneut bewährt (Abschnitt 19) — kein Rückfall auf manuelle Modelllisten.
- `TournamentGroupsService` hat bewusst kein DELETE (MVP-Einfachheit, Abschnitt 17) — falls künftig Gruppen entfernbar sein sollen, braucht das dieselbe Sorgfalt wie bei `TournamentVenuesService.remove` (Prüfung auf bereits zugeordnete Teilnehmer/Matches).

## 33. Vorbereitung auf den Spielplan-Generator (Phase 12)

Das Modell ist bewusst so geschnitten, dass ein künftiger automatischer Spielplan-/Bracket-Generator **kein paralleles Datenmodell** benötigt: Teilnehmer, Gruppen und Spielstätten existieren bereits als eigenständige, manuell befüllbare Entitäten; ein Generator müsste lediglich `FootballMatch`-Zeilen im Turniermodus (Abschnitt 12/13) automatisiert erzeugen — inklusive korrekter `tournamentGroupId`/`homeParticipantId`/`awayParticipantId`-Zuordnung, die bereits heute dieselben Composite-FK-Garantien durchsetzt. Standings-/Platzierungsberechnung würde auf den bereits vorhandenen `homeScore`/`awayScore`-Feldern (Phase 10) aufsetzen, ohne das Match-Modell erneut zu erweitern.

## 34. Nächster Schritt

PR (`feat(tournament): add football tournament core`) durchsehen und freigeben — **kein Merge in diesem Schritt** (Auftrag Abschnitt 49: Merge und damit auch automatisches DEV-Deployment erst nach expliziter, separater Freigabe durch den Product Owner). Ausdrücklich weiterhin **nicht** Teil dieser Phase: automatische Spielplan-/Gruppengenerierung, Round-Robin-/K.-o.-Generatoren, Pausenoptimierung, Tabellen-/Platzierungsberechnung, Finalrunden-Automatik, Turnierbaum, öffentliche Turnierseite, QR-Codes, Live-Ergebnisse, Push-Benachrichtigungen, neue `TURNIERLEITER`-Rolle.
