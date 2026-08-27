# Phase 10 – Spielstätten + Spiel-/Match-Grundmodell

## 1. Phase-9-Abschluss

PR #11 (`docs(deploy): record the real Phase 9 DEV deployment and live verification`) war grün (Install/Lint/Typecheck/Test/Build + 2× markdown-lint), `mergeable_state: clean`, nur der erwartete Dokumentationsdatei-Diff (`docs/PHASE_9_FOOTBALL_SEASON_REPORT.md`), 0 Secret-Scanning-Alerts. Per `gh pr merge --squash` gemergt, Merge-SHA `e7ef934`. `main` lokal aktualisiert, gemergter Branch lokal gelöscht.

## 2. Branch

`feat/match-foundation` von `main` (`e7ef934`) erstellt.

## 3. Venue-Entscheidung

Entität `Venue` (technischer Name wie im Auftrag vorgegeben; UI-Begriff "Spielstätte"), tenant-gebunden. Felder: `id`, `tenantId`, `name`, `street?`, `postalCode?`, `city?`, `countryCode?`, `latitude?`, `longitude?`, `notes?`, `status` (`VenueStatus`: `ACTIVE`/`INACTIVE`), `createdAt`, `updatedAt`. Keine Google-Maps-/Geocoding-Abhängigkeit — Koordinaten sind rein optionale, manuell gepflegte Zahlenfelder ohne externe Validierung. `@@unique([tenantId, name])`, analog zu `AgeGroup`.

## 4. Venue vs. Pitch/Court

Entscheidung für **Option A**: jede konkrete Spielfläche ist ein eigener `Venue`-Datensatz (z. B. "Sportzentrum Benediktbeuern — Hauptplatz" und "— Nebenplatz" als zwei Zeilen), keine eigene Pitch/Court-Unterstruktur. Begründung: die zusätzliche Hierarchieebene hätte für den aktuellen Funktionsumfang keinen fachlichen Mehrwert (nichts referenziert "den Standort als Ganzes", nur konkrete Spielflächen über `FootballMatch.venueId`). Spätere Erweiterung bleibt ohne Breaking Change möglich (z. B. optionales, selbstreferenzierendes `parentVenueId`-Feld oder eine eigene `Pitch`-Entity, die auf `Venue` als Standort zeigt) — dokumentiert im Schema-Kommentar am Modell.

## 5. Match/Game/Fixture-Entscheidung

Entscheidung für **"Match"** als Namensbestandteil (nicht "Game" oder "Fixture"): "Match" ist international über Sportarten hinweg verständlich, technisch unbelastet in diesem Codebase, eindeutiger als "Game" (zu generisch, keine Sport-Konnotation) und international unmittelbarer verständlich als "Fixture" (primär britisches Sportenglisch). UI bleibt durchgehend "Spiel".

## 6. Sportneutral oder Football-spezifisch

Entscheidung für **`FootballMatch`** (football-spezifisch), kein sportneutrales Basismodell. Begründung: die fachlichen Unterschiede zwischen Sportarten (Ergebnisdarstellung: Tore vs. Sätze/Punkte; Unentschieden möglich oder nicht; Heim/Auswärts-Konzept je nach Sportart unterschiedlich relevant) sind aktuell zu groß/unklar für ein tragfähiges gemeinsames Modell ohne künstliche Abstraktion — der Auftrag erlaubt das ausdrücklich ("FootballMatch ist vollkommen akzeptabel"). Sichergestellt ist die eigentliche Anforderung dahinter: ein künftiger Turnierplaner und der normale Fußball-Spielbetrieb verwenden **dasselbe** Modell — kein paralleles zweites Spielmodell entsteht (siehe Abschnitt 28).

## 7. TeamSeason-Beziehung

`FootballMatch.teamSeasonId` referenziert `TeamSeason`, nicht `Team` direkt und nicht `Team`+`Season` getrennt. Damit ist ein Spiel immer einer konkreten saisonalen Mannschaft zugeordnet (E1 → Saison 2026/27 → konkretes Spiel), exakt wie im Auftrag gefordert. Composite FK `(tenantId, teamSeasonId) → team_season(tenantId, id)`.

## 8. Season-Redundanzentscheidung

**Kein** redundantes `seasonId`-Feld auf `FootballMatch`. Die Saison ist über `teamSeasonId` → `TeamSeason.seasonId` bereits eindeutig ableitbar; eine zusätzliche Spalte hätte entweder eine eigene Konsistenzprüfung (Trigger) oder ein stillschweigendes Inkonsistenzrisiko benötigt, ohne klaren Vorteil gegenüber einem einfachen Join. Der API-Filter `?seasonId=` wird über eine Relations-Query auf `teamSeason.seasonId` umgesetzt (`MatchesService.list`), nicht über eine eigene Spalte.

## 9. Gegner-Modell

MVP: `opponentName` (Freitext, Pflichtfeld). Der Gegner ist im Regelfall kein Verevia-Mandant; eine vollständige Club-/ExternalTeam-Datenbank ist ausdrücklich nicht Teil dieser Phase. Dokumentierter künftiger Erweiterungspunkt (im Schema-Kommentar festgehalten): ein leichtes `Opponent`/`Participant`-Modell, das sowohl auf eine eigene `TeamSeason` (Spiel zwischen zwei eigenen Mannschaften) als auch auf einen externen, noch zu modellierenden Club/Team verweisen kann, würde `opponentName` perspektivisch ablösen bzw. ergänzen — relevant für den Turnierplaner, nicht Teil von Phase 10.

## 10. Match Types

`MatchType`-Enum: `LEAGUE`, `FRIENDLY`, `TOURNAMENT`, **plus `CUP`** (bewusst mit aufgenommen — Pokalspiele sind im deutschen Amateurfußball fachlich üblich, die Ergänzung kostet nur einen weiteren Enum-Wert). UI-Labels: Ligaspiel/Freundschaftsspiel/Turnierspiel/Pokalspiel. Noch keine Competition-/Liga-Entity.

## 11. Home/Away/Neutral

`MatchHomeAway`-Enum: `HOME`/`AWAY`/`NEUTRAL`, bewusst kein boolesches `isHome` — Turnier-/Pokalspiele können auf neutralem Platz stattfinden, das ist mit einem Bool nicht sauber abbildbar.

## 12. Statusmodell

`MatchStatus`-Enum: `SCHEDULED`/`POSTPONED`/`CANCELLED`/`COMPLETED` — schlanker, flacher Lebenszyklus ohne Übergangsregeln oder Live-Spielstatus. Ein abgesagtes Spiel wird per Status `CANCELLED` markiert, nicht gelöscht (kein DELETE-Endpunkt).

## 13. Ergebnisentscheidung

`homeScore?`/`awayScore?` sind bereits Teil des Grundmodells (Auftrag Abschnitt 17: "Ja, falls dies das Match-Modell wesentlich vollständiger macht"), ausdrücklich **ohne** Statistiken/Torschützen/Karten/Aufstellungen. Ein Ergebnis darf nur bei Status `COMPLETED` gesetzt sein — sowohl per DB-`CHECK`-Constraint (`football_match_score_requires_completed`) als auch applikationsseitig (`MatchesService.assertValidScoreStatus`, `400 Bad Request` bei Verletzung) doppelt abgesichert.

## 14. API

- `GET/GET:id/POST/PATCH /api/v1/venues` (Filter `?status=`), kein DELETE.
- `GET/GET:id/POST/PATCH /api/v1/football/matches` (Filter `?teamSeasonId=`/`?seasonId=`/`?from=`/`?to=`/`?status=`/`?type=`), kein DELETE.
- `DepartmentListItemDto`/`TeamSeasonDto` unverändert bis auf ein neues Feld `TeamSeasonDto.canCreateMatches` (siehe Abschnitt 18 — für die Web-Formular-Vorauswahl nötig, keine Duplizierung von Authorization-Logik im Frontend).

## 15. Authorization

Weiterhin **keine neuen Rollen**. Neue Methode `canOnVenue` (TENANT_ADMIN verwaltet, jede aktive Rolle liest — identisches Muster zu `canManageAgeGroups`/`canReadAgeGroups`). Neue Methode `canOnMatch` (bewusst **nicht** `canOnTeam` wiederverwendet: `canOnTeam`s create/update ist DEPARTMENT_ADMIN-only, ein Spiel ist aber eine alltägliche Trainer-Aufgabe — `COACH`/`TEAM_MANAGER` des eigenen Teams dürfen selbst anlegen/bearbeiten, `ASSISTANT_COACH` und andere TEAM-Scope-Rollen nur lesen). Rollenmatrix wie im Auftrag: TENANT_ADMIN alles; DEPARTMENT_ADMIN eigene Abteilung; COACH/TEAM_MANAGER eigenes Team verwalten; ASSISTANT_COACH/PLAYER/MEMBER/GUEST nur entsprechend bestehender Leserechte.

## 16. Cross-Tenant

Beide neuen Modelle tenant-pur mit zusammengesetzten Fremdschlüsseln: `venue` → `tenant`; `football_match` → `tenant`/`team_season` (composite, `(tenantId, teamSeasonId)`)/`venue` (composite, `(tenantId, venueId)`, nullable). Verifiziert durch dedizierte negative Tests (Abschnitt 20). Der Fußball-only-Guardrail aus Phase 9 gilt **strukturell mit** — da `FootballMatch` ausschließlich über `TeamSeason` referenziert (nie direkt über `Team`), und `TeamSeason` selbst schon beim Anlegen auf `sportType: FOOTBALL` geprüft wird, kann ein `FootballMatch` gar nicht auf eine Nicht-Fußball-Mannschaft zeigen. Kein zusätzlicher Guardrail/Trigger nötig.

## 17. RLS

Beide neuen Tabellen (`venue`, `football_match`) haben `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + vier fail-closed Policies, exakt nach etabliertem Muster. Die in Phase 9 eingeführte DMMF-basierte Auto-Ableitung von `TENANT_SCOPED_MODELS` (`packages/database/src/tenant-prisma.ts`) wurde **unverändert weiterverwendet** — beide neuen Modelle wurden automatisch korrekt erkannt (verifiziert per Node-Skript und aktualisierter Unit-Test-Suite, `tenant-scoped-models.spec.ts`, jetzt 11 statt 9 Modelle), **keine Codeänderung an `tenant-prisma.ts` nötig**. Genau der Beweis, den die Phase-9-Behebung erbringen sollte.

## 18. UI

Neue Routen `/fussball/spiele` (Spieleübersicht, Card-Layout, mobile-first), `/fussball/spiele/neu` (Formular: Mannschaft/Saison, Gegner, Datum+Uhrzeit, Heim/Auswärts/Neutral, Spielstätte, Spieltyp, Notiz — keine sichtbaren technischen IDs), `/fussball/spiele/:id` (Detail + Bearbeiten-Formular entsprechend Authorization, kein Löschen), `/spielstaetten` (Spielstättenverwaltung, TENANT_ADMIN: Liste/Anlegen/Bearbeiten). Navigation: ein neuer Link "Spiele" auf der Fußball-Übersicht (neben "Saisons verwalten"), ein Link "Spielstätten" auf der Vereinsseite — bewusst **kein** neuer Top-Level-Nav-Eintrag (Nav bleibt bei "Verein"/"Personen"/"Meine Kinder"/"Fußball"). Zeitzonenstrategie (Auftrag Abschnitt 15, "keine naive Datumslogik"): Speicherung als echter UTC-Zeitstempel — ein neuer Client-Component `MatchDateTimeInput` konvertiert die vom Browser gelieferte lokale `datetime-local`-Eingabe über `Date.toISOString()` clientseitig zu UTC (nur der Browser kennt die Zeitzone/DST-Verschiebung des Betrachters zuverlässig); Anzeige ist für dieses Deutschland-Pilotprojekt bewusst hart auf `Europe/Berlin` gesetzt (nicht "Client-Zeitzone"-Erkennung — für einen aktuell rein deutschen Pilotbetrieb keine sinnvolle zusätzliche Komplexität), dokumentiert im Code als bewusste, revidierbare MVP-Entscheidung.

**Während der VPS-Verifikation gefundene und behobene Fehler** (siehe Abschnitt 24): `createMatchAction` navigierte nach dem Anlegen nicht zur Spieleliste zurück (fehlender `redirect()` — als einzige Create-Action dieser Datei liegt das Formular auf einer eigenen Seite, nicht inline auf der Liste); `MatchDetail` zeigte den aktuellen Status nur im reinen Lesemodus als Text an, im Bearbeiten-Modus (für TENANT_ADMIN immer aktiv) existierte er nur als `<option>` im Status-`<select>` — ein sichtbares Status-Badge (analog `SeasonManagement`) wurde ergänzt.

## 19. Seed

Erweitert um: `Venue` "Sportplatz Benediktbeuern" (keine reale Adresse, rein fiktiv), drei Demo-Spiele — E1 Heim-Freundschaftsspiel (geplant, zukünftiges Datum) gegen "SV Beispielhausen", E2 Auswärts-Freundschaftsspiel (geplant) gegen "FC Musterdorf", E1 abgeschlossenes Ligaspiel gegen "TSV Nachbarort" mit Ergebnis 3:1. Ausschließlich fiktive Gegnernamen. Vollständig idempotent (`upsert`/`findFirst`-vor-`create`) — zweifacher Lauf real gegen PostgreSQL 17 verifiziert (identische IDs, keine Duplikate).

## 20. DB-Tests

Neu (`packages/database/src/__tests__/match-foundation.integration.spec.ts`, 11 Tests): Venue-Tenant-Isolation, Cross-Tenant-FK-Ablehnung (`FootballMatch` → fremde `TeamSeason`/`Venue`), CHECK-Constraint (Ergebnis nur bei `COMPLETED`, in beide Richtungen getestet), RLS fail-closed (ohne Tenant-Kontext, Tenant-B-Isolation, Cross-Tenant-Update-Ablehnung). Real gegen PostgreSQL 17 verifiziert: 64/64 Tests der gesamten DB-Integrationssuite grün (inkl. der bestehenden RLS-/Cross-Tenant-FK-/Football-Season-Suiten — keine Regression).

## 21. API-Tests

Neu (`apps/api/test/match-foundation.integration-spec.ts`, 13 Tests): 401 ohne Session, 403 ohne Mitgliedschaft, TENANT_ADMIN Venue CREATE/UPDATE, COACH Venue READ/UPDATE-verboten, TENANT_ADMIN/DEPARTMENT_ADMIN Match CREATE/UPDATE, DEPARTMENT_ADMIN-fremde-Abteilung-verboten, COACH E1 CREATE/UPDATE eigenes Team, COACH E1 UPDATE E2 verboten, ASSISTANT_COACH liest aber erstellt nicht, ungültige/gültige Ergebnis-Status-Kombination (400/201). Real verifiziert: 99/99 Tests der gesamten API-Integrationssuite grün (8 Dateien, keine Regression).

## 22. Web-Tests

Neu (4 Dateien, 18 Tests): Spieleübersicht (leerer Zustand, Heim/Auswärts-Reihenfolge, Ergebnisdarstellung, Anlegen-Link-Sichtbarkeit), Spiel-anlegen-Formular (leerer Zustand ohne berechtigte Mannschaft, alle Felder vorhanden, keine sichtbaren technischen IDs), Spiel-Detail (Lesemodus vs. Bearbeiten-Formular, Status-Badge auch im Bearbeiten-Modus sichtbar, Ergebnisanzeige), Spielstättenverwaltung (leerer Zustand, berechtigungsabhängige Anzeige von Bearbeiten-/Anlegen-Formularen).

## 23. E2E

Neu (`apps/web/e2e/match-foundation.spec.ts`): TENANT_ADMIN legt ein neues E1-Spiel an (Gegner, Datum/Uhrzeit, Heim/Auswärts, Spielstätte, Spieltyp) → Spiel erscheint in der Liste → öffnen → Status auf "Abgeschlossen" + Ergebnis setzen → Änderung sichtbar. COACH E1: sieht nur eigene Team-Spiele (E2-Spiel nicht sichtbar), kann selbst ein Spiel anlegen, aber keine administrativen Spielstätten-Aktionen (kein Anlegen-/Bearbeiten-Formular auf `/spielstaetten`). Beide Tests fanden während der ersten Ausführung die in Abschnitt 18 genannten echten Bugs — nach Behebung über mehrere komplette Suite-Läufe hinweg durchgehend grün (10/10 E2E-Tests insgesamt, inkl. der bestehenden Suiten, keine Regression).

## 24. VPS-Verifikation

Real durchgeführt, gemäß Auftrag Abschnitt 41. Temporärer, eindeutig gekennzeichneter PostgreSQL-17-Container (`verevia-tmp-dev-postgres-phase10-match`, Label `verevia.purpose=temporary-phase10-match-dev`) auf `127.0.0.1:5441` des VPS, per SSH-Tunnel lokal erreichbar gemacht (sitzungsgebundener Phase-10-Key, vom Nutzer manuell hinterlegt). Ablauf:

1. `prisma migrate deploy` aus leerer DB: alle 10 Migrationen (inkl. der neuen `20260827120000_add_venue_and_football_match`) erfolgreich.
2. `prisma migrate status` → "Database schema is up to date!", `prisma validate` → gültig, `prisma migrate diff --exit-code` → kein Unterschied.
3. Seed zweimal → idempotent (identische IDs, 1 Venue, 3 Matches nach zwei Läufen).
4. DB-Integrationstests: 64/64 grün.
5. API-Integrationstests: 99/99 grün (ein einzelner Fehlschlag bei einem vollständigen Suite-Lauf in `guardian-invitations.integration-spec.ts`, isoliert erneut ausgeführt 19/19 grün — bekannte, bereits in Phase 9 dokumentierte SSH-Tunnel-Latenz-Flakiness, keine Phase-10-Regression).
6. `apps/api`/`apps/web` produktiv gebaut und gestartet (Port 3001/3100 — 3000 durch ein unabhängiges lokales Projekt belegt, nicht angetastet).
7. Volle Playwright-E2E-Suite: 10/10 grün nach Behebung der beiden in Abschnitt 18 genannten echten Bugs.
8. Vollständig aufgeräumt: temporärer Container entfernt, anhängendes dangling Volume entfernt (verifiziert: 0 verbleibende dangling Volumes), SSH-Tunnel geschlossen (verifiziert: Port 5441 lokal nicht mehr erreichbar), lokale `api`/`web`-Prozesse beendet, temporärer SSH-Key aus `authorized_keys` entfernt und die Entfernung durch einen fehlschlagenden erneuten Verbindungsversuch verifiziert (`Permission denied`), lokale Schlüsseldateien gelöscht.

**Kleiner, unschädlicher Rückstand** (identisches Muster zu Phase 6/7/9): `~/.ssh/authorized_keys.bak` auf dem VPS (von `sed -i.bak` beim Entfernen des temporären Schlüssels erzeugt) konnte nach dem Zugriffsentzug nicht mehr selbst gelöscht werden — enthält ausschließlich den bereits entfernten, öffentlichen Schlüsseltext. Befehl für den Nutzer: `rm ~/.ssh/authorized_keys.bak`.

Kein tatsächliches Deployment auf die permanente DEV-Umgebung in diesem Schritt — das erfolgt erst nach Merge des Phase-10-PR und expliziter Freigabe (siehe Auftrag Abschnitt 44).

## 25. Quality Gates

Vollständig grün, lokal und real gegen PostgreSQL 17: `pnpm install --frozen-lockfile`, `pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle 7 Pakete), `prisma validate`, Migration aus leerer DB, Seed 2×, DB-Integrationstests, API-Integrationstests, Web-Tests, volle E2E-Suite. Keine Tests deaktiviert, keine Warnungen wegkonfiguriert.

## 26. Risiken

- Die Fußball-only-Eigenschaft von `FootballMatch` ist strukturell (über `TeamSeason`) korrekt, aber genauso wie in Phase 9 gilt: ein direkter DB-Zugriff außerhalb der API umgeht keine zusätzliche Prüfung mehr (es gibt keine zusätzliche — sie ist strukturell nicht umgehbar, solange `TeamSeason` selbst korrekt geprüft bleibt). Kein neues Risiko gegenüber Phase 9.
- `opponentName` als Freitext ermöglicht Tippfehler/Inkonsistenzen bei wiederkehrenden Gegnern (z. B. "SV Beispielhausen" vs. "S.V. Beispielhausen") — bewusst in Kauf genommen für den MVP, siehe Erweiterungspunkt Abschnitt 9/28.
- `venueId`/Ergebnis können über die aktuelle Web-UI nicht explizit auf "keine Angabe" zurückgesetzt werden (nur überschrieben) — eine kleine, dokumentierte Formular-Einschränkung, kein API-Defizit.
- Bekannte, vorbestehende E2E-/API-Integrationstest-Flakiness unter SSH-Tunnel-Latenz (Abschnitt 24, Punkt 5) — kein Phase-10-spezifisches Risiko.

## 27. Technische Schulden

- Keine neuen. Die Phase-9-Behebung der `TENANT_SCOPED_MODELS`-Auto-Ableitung hat sich in Phase 10 bereits bewährt (Abschnitt 17) — kein Rückfall auf manuelle Modelllisten.

## 28. Vorbereitung auf Turnierplaner

Das Modell ist bewusst so geschnitten, dass ein künftiger Turnierplaner **kein paralleles Spielmodell** benötigt: `FootballMatch` referenziert bereits `TeamSeason` (nicht `Team` direkt), trägt bereits `type: TOURNAMENT` als möglichen Wert, und `homeAway: NEUTRAL` deckt bereits neutrale Turnierplätze ab. Der dokumentierte Erweiterungspunkt für ein `Opponent`/`Participant`-Modell (Abschnitt 9) ist genau der Punkt, an dem ein Turnierplaner andocken würde, um sowohl eigene als auch externe Teilnehmer in Turnierspielen abzubilden, ohne `FootballMatch` selbst zu duplizieren. Eine künftige `Tournament`/`TournamentMatch`-Struktur würde `FootballMatch`-Zeilen referenzieren bzw. erzeugen, nicht ersetzen.

## 29. Nächster Schritt

PR (`feat(football): add venue and match foundation`) durchsehen und freigeben — **ohne Auto-Merge** (Auftrag Abschnitt 44: automatisches DEV-Deployment erst nach expliziter Freigabe in einem separaten Verifikationsschritt, wie in Phase 9). Ausdrücklich weiterhin **nicht** Teil dieser Phase: Turnier, Turnierplan, Gruppenphase, K.-o.-System, Tabellen, Liga-/Wettbewerbsverwaltung, Verbandsschnittstellen, Training, Anwesenheit, Zu-/Absagen, Kader für einzelne Spiele, detaillierte Spielstatistiken/Torschützen/Karten/Aufstellungen, Schiedsrichterverwaltung, Fahrgemeinschaften, Spielgemeinschaften, Push Notifications.
