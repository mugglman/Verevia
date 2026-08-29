# Phase 11 – Live-Verifikation (Tournament Core)

Dieser Bericht dokumentiert die reale Live-Verifikation von Phase 11 nach Merge und automatischem Deployment gegen `https://app.verevia.app`/`https://api.verevia.app`. Für den fachlichen/technischen Umsetzungsbericht siehe [PHASE_11_TOURNAMENT_CORE_REPORT.md](./PHASE_11_TOURNAMENT_CORE_REPORT.md).

## 1. Merge

PR #14 (`feat(tournament): add football tournament core`) wurde final geprüft: Base `main`, Head `feat/tournament-core`, CI vollständig grün (Install/Lint/Typecheck/Test/Build + 2× markdown-lint), `mergeable_state: CLEAN`, 0 Secret-Scanning-Alerts, 0 Reviews mit Änderungswunsch, 51 geänderte Dateien ausschließlich im Phase-11-Scope (ADR 0008 vorhanden, kein versehentlicher automatischer Turnierplaner/Scheduler-Code im Diff). Per `gh pr merge --squash` gemergt.

**Merge-SHA: `f125bed`** (`f125bed45d651c200d8b09c7219c17d84531fd8f`, kurz `f125bed45d65`).

## 2. CI / Deployment-Pipeline

`main`-CI (ausgelöst durch den Merge-Push) grün. Der automatisch per `workflow_run` ausgelöste "Deploy DEV"-Lauf (`33248095728`) war **beim ersten Versuch vollständig erfolgreich** — kein manueller Retry nötig (anders als bei Phase 10). Beide Jobs ("Build and push images", "Deploy to VPS") erfolgreich, Gesamtlaufzeit ca. 12 Minuten (10:33:24–10:45:15 UTC). Kein paralleles manuelles Deployment durchgeführt — ausschließlich der bestehende Flow verwendet.

## 3. GHCR-Images

- **API-Image**: `ghcr.io/mugglman/verevia-api:f125bed45d65` — erfolgreich gebaut und gepusht.
- **Web-Image**: `ghcr.io/mugglman/verevia-web:f125bed45d65` — erfolgreich gebaut und gepusht.
- Beide Images basieren auf demselben Commit (identischer SHA-Tag), tatsächlich von beiden laufenden Containern gezogen (verifiziert per `docker ps` auf dem VPS, siehe Abschnitt 6). GHCR-API-Abfrage direkt scheiterte an fehlendem `read:packages`-Scope des verwendeten `gh`-Tokens — stattdessen über die tatsächlich laufenden Container-Image-Tags verifiziert, was das eigentlich relevante Kriterium ist ("DEV verwendet exakt die neuen Images").

## 4. Backup

Vor der Migration automatisch erstellt: `verevia-dev-20260829T104304Z-f125bed45d65.sql.gz` (Dateiname enthält Zeitstempel und Ziel-SHA), `/srv/verevia/backups/`, 8463 Byte, Zeitpunkt 10:43:04 UTC — unmittelbar vor der Migration um 10:44:43 UTC. Kein Backup-Inhalt in diesem Bericht kopiert.

## 5. Migration

Bestehende, persistente DEV-Datenbank — **kein Reset, kein `db push`, kein Volume-Löschen, keine Neuaufsetzung**. `prisma migrate deploy` lief inkrementell:

- **11 Migrationen** insgesamt vorhanden nach diesem Deployment (10 aus Phase 1–10 + 1 neu), verifiziert direkt gegen die `_prisma_migrations`-Tabelle.
- Neu angewendet: **ausschließlich** `20260828120000_add_tournament_core` (`finished_at`: 2026-08-29 10:44:43 UTC).
- Kein Schemafehler, kein Rollback, keine unerwartete Migration.
- Die bestehende Phase-10-Datenbank (Tenant, Personen, Rollen, Season, TeamSeason, Venue, FootballMatch) blieb vollständig erhalten (siehe Abschnitt 8).

## 6. Healthcheck

`https://api.verevia.app/health` → `{"status":"ok","version":"f125bed45d65"}` — HTTP 200, `status: ok`, `version` entspricht exakt dem neuen Merge-SHA. `https://app.verevia.app` → erreichbar, folgt Redirects zu `/login` mit finalem HTTP 200 (erwartetes Verhalten ohne Session, identisch zum bisherigen Verhalten).

## 7. Container

Auf dem VPS geprüft:

| Container | Status | Image |
|---|---|---|
| `verevia-dev-api` | Up, **healthy** | `ghcr.io/mugglman/verevia-api:f125bed45d65` |
| `verevia-dev-web` | Up, **healthy** | `ghcr.io/mugglman/verevia-web:f125bed45d65` |
| `verevia-dev-postgres` | Up, **healthy** | `postgres:17-alpine`, **kein** veröffentlichter Host-Port |
| `verevia-traefik` | unverändert, seit 12 Tagen durchgehend up | — |

`verevia-prod` zu keinem Zeitpunkt vorhanden/angetastet — auf diesem VPS existiert aktuell ausschließlich die DEV-Umgebung.

## 8. Persistente Daten — Vorher/Nachher

**Baseline nach erfolgreichem Deployment, vor jeglichen eigenen Testaktionen**:

| Tenants | Personen | Users | Rollen | Beziehungen | Abteilungen | Teams | Saisons | TeamSeasons | Venues | Matches | Turniere | Turnier-Teilnehmer | Turnier-Gruppen | Turnier-Spielstätten |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4 | 1 | 2 | 1 | 1 | 2 | 1 | 2 | 1 | 4 | 1 | 4 | 2 | 1 |

Exakt identisch zur Phase-10-Baseline bezüglich der dortigen Werte, zuzüglich der neuen Phase-11-Seed-Daten (Turnier "Verevia Jugendcup 2026" mit 4 Teilnehmern, 2 Gruppen, 1 Spielstättenzuordnung, 1 zusätzlichem Turniermatch — daher `Matches` 3→4) — durch die Migration+Seed dieses Deployments korrekt und idempotent hinzugekommen, keine bestehenden Daten verändert oder verloren.

**Nach vollständiger Live-Verifikation und Testdaten-Cleanup** (siehe Abschnitt 16): identische Werte, per erneuter Zählabfrage bestätigt. Keine Regression, kein Datenverlust, kein Leck von Testdaten.

## 9. Live-Login

Echter Login gegen `https://app.verevia.app`/`https://api.verevia.app` getestet — keine Mock-Session, keine DB-Manipulation als Login-Ersatz. Da keine bestehenden Live-Testaccounts mit bekanntem Passwort vorlagen (Muster aus Phase 7–10), wurden drei temporäre, ausschließlich fiktive Testaccounts über den echten better-auth-Signup-Endpunkt (`POST /api/auth/sign-up/email`, echte HTTPS-URL) angelegt: ein TENANT_ADMIN-, ein DEPARTMENT_ADMIN-Football- und ein COACH-E1-Account. Verknüpfung mit einer neuen, fiktiven `Person` sowie minimal notwendigen `RoleAssignment`s erfolgte per direktem, dokumentiertem DB-Insert (kein Self-Service-Weg für "verknüpfe bestehenden Login mit einer neuen Rolle" vorhanden — identisches, etabliertes Muster aus den Phase-9/10-Live-Verifikationen). Alle drei Accounts wurden nach Abschluss vollständig entfernt (Abschnitt 16).

## 10. Turnierliste Live-Test

Als TENANT_ADMIN über `https://app.verevia.app/fussball/turniere` (und direkt gegen die API):

1. Seite erreichbar (HTTP 200) ✓
2. Seed-Turnier "Verevia Jugendcup 2026" sichtbar ✓, Name/Status ("Geplant")/Modus ("Gruppenphase")/Teilnehmeranzahl (4)/Gruppenanzahl (2) korrekt, sowohl über die API-Antwort als auch im gerenderten HTML bestätigt ✓
3. Keine technischen IDs im sichtbaren Text ✓

## 11. Turnier anlegen Live-Test

Temporäres Testturnier "Phase 11 Live Test Cup" (Modus `GROUPS`, Status `PLANNED`, Saison 2026/2027, eindeutiger Testzeitraum Dezember 2026) über die echte API angelegt → HTTP 201. Detailseite lädt (HTTP 200, Name im HTML sichtbar). Erneuter API-Read (Reload-Äquivalent) zeigt identische, persistierte Daten ✓.

## 12. Interner Teilnehmer Live-Test

E1 (TeamSeason) als interner Teilnehmer hinzugefügt → HTTP 201, korrekte `teamName`/`ageGroupName`, keine ID im UI-Text. Erneutes Hinzufügen derselben TeamSeason → **HTTP 409 Conflict** ("This team season is already a participant in this tournament") — Duplikatschutz live bestätigt.

## 13. Externer Teilnehmer Live-Test

"SV Testhausen U11" als externer Teilnehmer hinzugefügt → HTTP 201, `externalName` korrekt persistiert. Case-insensitives Duplikat "sv testhausen u11" → **HTTP 409 Conflict** ("A participant with this name already exists in this tournament") — case-insensitiver Duplikatschutz live bestätigt. Ein zweiter externer Teilnehmer ("FC Musterstadt Test") für die nachfolgenden Match-Tests angelegt.

## 14. XOR-Validierung Live

Direkt gegen die echte API getestet:

- `teamSeasonId` **und** `externalName` gleichzeitig gesetzt → **HTTP 400** ("Provide exactly one of teamSeasonId or externalName").
- **Weder** `teamSeasonId` **noch** `externalName` gesetzt → **HTTP 400** (identische Meldung).

Beide Richtungen der XOR-Regel live bestätigt.

## 15. Gruppen Live-Test

"Gruppe A" manuell angelegt → HTTP 201. Interner E1-Teilnehmer der Gruppe zugewiesen (`PATCH .../participants/:id`) → HTTP 200, `groupName: "Gruppe A"` korrekt im Response. Keine automatische Auslosung ausgelöst oder beobachtet.

## 16. Turnier-Spielstätten Live-Test

Bestehende Seed-Venue "Sportplatz Benediktbeuern" dem Testturnier zugeordnet (`label: "Hauptplatz"`) → HTTP 201, `venueName` korrekt aufgelöst. Kein neues Venue-/Pitch-/Field-Modell beteiligt — reine Zuordnungstabelle wie spezifiziert.

## 17. Manuelles Turnierspiel Live-Test (zentral)

E1 (intern) gegen "SV Testhausen U11" (extern), `homeAway: NEUTRAL`, zugeordnete Spielstätte, Gruppe A, Status `SCHEDULED`, `type` absichtlich als `FRIENDLY` im Request gesendet → Response zeigt **serverseitig korrekt auf `TOURNAMENT` erzwungen** (unabhängig vom übermittelten Wert, wie im Code vorgesehen). `tournamentId`/`tournamentGroupId`/`homeParticipantId`/`awayParticipantId`/`venueId` alle korrekt gesetzt, `teamSeasonId`/`opponentName` beide `null` (korrekter Turniermatch-Modus). Im Turnierdetail (Web, HTML) korrekt als "E1 – SV Testhausen U11" sichtbar. Nach Reload (erneuter API-Read) identisch persistiert ✓. **Kein neues `TournamentMatch`-Modell** — dasselbe `football_match`-Table/-Modell wie für normale Vereinsmatches, live über die reale API bestätigt.

## 18. Zwei externe Teilnehmer gegeneinander

Zusätzlicher Test: "SV Testhausen U11" (extern) gegen "FC Musterstadt Test" (extern), `type: TOURNAMENT`, `homeAway: HOME`, ohne Gruppe/Venue → HTTP 201, beide `ParticipantName`-Felder korrekt aus `externalName` aufgelöst. Beweist live, dass das Match-Modell nicht nur den Fall "eigene TeamSeason vs. `opponentName`" abdeckt, sondern auch zwei rein externe Teilnehmer.

## 19. Normales Vereinsmatch — Regression

Bestehende Phase-10-Seed-Matches (3 Stück, E1/E2, inkl. 1 `COMPLETED` mit Ergebnis 3:1) unverändert und korrekt über die API lesbar, alle Turnierfelder korrekt `null`. Zusätzlich ein neues, temporäres normales Vereinsmatch (E1 gegen "Phase11 Live Regression Gegner", **ohne** Tournament-Kontext) angelegt → HTTP 201, `type: FRIENDLY` unverändert übernommen (keine erzwungene `TOURNAMENT`-Überschreibung im Club-Modus), kein `tournamentId`/Participant-Feld nötig. ADR-0008-Kompatibilität (Vereinsmatch-Modus bleibt vollständig unverändert nutzbar) live bestätigt.

## 20. Match-Modi-Validierung Live

Direkt gegen die echte API getestet:

- `homeParticipantId` == `awayParticipantId` (Teilnehmer gegen sich selbst) → **HTTP 400** ("homeParticipantId and awayParticipantId must be different").
- `homeParticipantId` gesetzt, `awayParticipantId` fehlt (Turniermodus) → **HTTP 400** ("Tournament matches require homeParticipantId and awayParticipantId").

## 21. Tournament/Group-Konsistenz Live

Zweites temporäres Testturnier mit eigener Gruppe "Fremdgruppe" angelegt. Versuch, ein Match im ersten Testturnier mit `tournamentGroupId` der Fremdgruppe zu erstellen → **HTTP 404** ("Tournament group not found in this tournament") — die Composite-FK-Konsistenzprüfung (ADR 0008) live bestätigt, nicht nur in den automatisierten Tests.

## 22. Venue-Guardrail Live

Eine neue, dem Testturnier **nicht** zugeordnete Spielstätte angelegt. Versuch, ein Turniermatch mit dieser Spielstätte zu erstellen → **HTTP 400** ("This venue is not assigned to this tournament") — der applikationsseitige Guardrail (bewusst nicht DB-CHECK-fähig, siehe ADR 0008) live bestätigt.

## 23. Authorization Live

**TENANT_ADMIN**: Turniere lesen/anlegen/ändern ✓, Teilnehmer/Gruppen/Spielstätten/Turniermatches verwalten ✓ — keine Berechtigungsfehler, alle oben genannten Aktionen erfolgreich.

**DEPARTMENT_ADMIN Football** (echter, eigens angelegter Testaccount, nicht nur Unit-Test): Turnier in der eigenen Fußballabteilung anlegen → HTTP 201 ✓.

**COACH E1** (echte HTTPS-Zugriffe): Turnierliste lesen ✓, Turnierdetail lesen (`canEdit: false`) ✓ — korrekt verweigert: Turnier anlegen → **HTTP 403** ✓, Teilnehmer hinzufügen → **HTTP 403** ✓, Turniermatch anlegen → **HTTP 403** ✓. Im Web-UI zusätzlich bestätigt: kein "Speichern"-Button, kein "Externe Mannschaft hinzufügen"-Formular, kein "Turnier anlegen"-Link sichtbar (jeweils 0 Treffer im HTML).

## 24. RLS / Cross-Tenant Live

Stichprobenartig live bestätigt (vollständig bereits durch die reale PostgreSQL-17-Integrationstestsuite abgedeckt, siehe Phase-11-Bericht Abschnitt 23): kein Session-Cookie → HTTP 401; gültige Session mit frei erfundenem `X-Tenant-Id`-Header → HTTP 403 (Membership-Prüfung greift, kein Datenleck). Keine riskanten Manipulationen an echten DEV-Daten vorgenommen — ausschließlich eindeutig fiktive, eigens angelegte Testdaten verwendet.

## 25. Regression

Nach dem Deployment real geprüft (HTTP 200 auf allen Routen, jeweils mit echter TENANT_ADMIN-Session): `/` (Verein), `/personen`, `/meine-kinder`, `/fussball`, `/fussball/saisons`, `/fussball/spiele`, `/spielstaetten`, `/abteilungen/:id` (Fußball), `/mannschaften/:id` (E1 und E2). Keine Regression durch die Phase-11-Migration/das Deployment feststellbar.

## 26. Seed-Struktur Live

Turnier "Verevia Jugendcup 2026" live bestätigt: Status `PLANNED`, Modus `GROUPS`, genau 4 Teilnehmer (1 intern, 3 extern) — keine unerwarteten Duplikate, exakt der im Seed spezifizierte Zustand.

## 27. Kein Auto-Scheduler

Explizit live verifiziert: kein `generate-schedule`- oder vergleichbarer Endpunkt existiert (`POST .../generate-schedule` → HTTP 404, Route nicht registriert). Ergänzend zur bereits im Implementierungsbericht dokumentierten Code-Durchsicht — keine automatische Gruppenverteilung, Round-Robin-/Knockout-Erzeugung, Spielplanerstellung, Feldverteilung, Pausenoptimierung oder Tabellenberechnung im deployten Code vorhanden oder in diesem Auftrag implementiert.

## 28. Testdaten-Cleanup

Vollständig entfernt und per Zählabfrage verifiziert (0 verbleibende Treffer je Kategorie):

- 3 temporäre `FootballTournament`-Zeilen (Testturnier 1, Fremdkontext-Testturnier, DeptAdmin-Testturnier)
- 6 temporäre `TournamentParticipant`-Zeilen
- 2 temporäre `TournamentGroup`-Zeilen
- 1 temporäre `TournamentVenue`-Zeile
- 3 temporäre `FootballMatch`-Zeilen (2 Turniermatches + 1 normales Regressionsmatch)
- 1 temporäre `Venue`-Zeile (nicht zugeordnete Test-Spielstätte)
- 3 temporäre `RoleAssignment`-Zeilen
- 3 temporäre `Membership`-Zeilen
- 3 temporäre `Person`-Zeilen
- 3 temporäre `Session`-Zeilen
- 3 temporäre `Account`-Zeilen
- 3 temporäre `User`-Zeilen

Bestehende Seed-/DEV-Daten wurden zu keinem Zeitpunkt gelöscht oder verändert (siehe Abschnitt 8, identischer Vorher/Nachher-Stand).

## 29. VPS-Restdatei-Status

`/tmp/authorized_keys.phase11-pre-removal.bak` (aus der vorangegangenen Phase-11-Implementierungssitzung dokumentiert) existierte zu Beginn dieser Live-Verifikationssitzung bereits **nicht mehr** (vermutlich durch den Nutzer selbst oder reguläre `/tmp`-Bereinigung entfernt) — nichts zu tun. Die bereits vor Sitzungsbeginn vorhandene, nicht mit dieser oder der vorherigen Phase-11-Sitzung zusammenhängende `~/.ssh/authorized_keys.bak` (Zeitstempel 27.08., vor Phase 11) wurde geprüft und unangetastet gelassen.

## 30. SSH-Key-Cleanup

Temporärer Live-Verifikations-Key (`verevia-phase11-live-verify-1787994287`) ausschließlich aus `~/.ssh/authorized_keys` entfernt. Verifiziert:

1. `grep` auf den exakten Kommentar → kein Treffer.
2. Erneuter SSH-Verbindungsversuch mit exakt diesem privaten Schlüssel → `Permission denied (publickey,password)`, Exit-Code 255, Verbindung schlägt wie erwartet fehl.

Alle anderen `authorized_keys`-Einträge (die bereits vorbestehende Leerzeile) sowie der permanente GitHub-Deployment-Key unverändert. Lokale Schlüsseldateien gelöscht. Diesmal entstand **keine neue** `authorized_keys.bak` (direkte `grep -v`-Filterung ohne `sed -i.bak` verwendet) — kein Rückstand.

## 31. Risiken

- Keine neuen, live-spezifischen Risiken gefunden. Die bereits im technischen Phase-11-Bericht genannten Risiken (dortiger Abschnitt 31) bleiben unverändert gültig.
- Der GHCR-API-Zugriff über `gh api` scheiterte am fehlenden `read:packages`-Scope des Tokens (Abschnitt 3) — kein Blocker (Verifikation über laufende Container-Image-Tags gleichwertig durchgeführt), aber für künftige Phasen dokumentiert: falls eine direkte GHCR-Abfrage einmal nötig wird, müsste der `gh`-Token entsprechend erweitert werden.

## 32. Technische Schulden

Keine neuen.

## 33. Eignung als Fundament für einen künftigen Spielplan-Generator

Live bestätigt: Teilnehmer, Gruppen, Spielstätten und Turniermatches sind über die reale, deployte API vollständig lesbar und beschreibbar; ein künftiger automatischer Spielplan-Generator (Phase 12) könnte direkt darauf aufsetzen — Teilnehmer/Gruppen/Spielstätten/Modus/Zeitraum lesen, `FootballMatch`-Zeilen im bereits produktiv laufenden Turniermodus (`tournamentId`+`homeParticipantId`+`awayParticipantId`+optional `tournamentGroupId`+`type: TOURNAMENT`+`homeAway`) automatisiert erzeugen, ohne ein neues Match-Modell oder Schemaänderungen zu benötigen. Keine Diskrepanz zwischen dem in der Entwicklung verifizierten und dem live deployten Schema festgestellt.

## 34. Fazit

Alle Ziele der Live-Verifikation erreicht: Merge, automatisches (beim ersten Versuch erfolgreiches) Deployment, inkrementelle Migration, Tournament/Participant/Group/Venue/Turniermatch-Funktionalität sowie Authorization live über echte HTTPS-Zugriffe verifiziert (inkl. aller Duplikat-/XOR-/Konsistenz-/Guardrail-Validierungen), normales Vereinsmatch nachweislich unverändert funktionsfähig (ADR-0008-Kompatibilität live bestätigt), keine Regression, persistente Daten unverändert, alle Testdaten vollständig entfernt und verifiziert, temporärer SSH-Key entfernt und verifiziert, weiterhin kein automatischer Turnierplaner.
