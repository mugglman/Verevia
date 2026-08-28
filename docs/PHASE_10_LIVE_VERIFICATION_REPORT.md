# Phase 10 – Live-Verifikation (Venue + FootballMatch)

Dieser Bericht dokumentiert die reale Live-Verifikation von Phase 10 nach Merge und automatischem Deployment gegen `https://app.verevia.app`/`https://api.verevia.app`. Für den fachlichen/technischen Umsetzungsbericht siehe [PHASE_10_MATCH_FOUNDATION_REPORT.md](./PHASE_10_MATCH_FOUNDATION_REPORT.md).

## 1. Merge

PR #12 (`feat(football): add venue and match foundation`) wurde final geprüft: Base `main`, Head `feat/match-foundation`, CI vollständig grün (Install/Lint/Typecheck/Test/Build + 2× markdown-lint), `mergeable_state: clean`, 0 Secret-Scanning-Alerts, 42 geänderte Dateien ausschließlich im Phase-10-Scope (keine versehentliche Tournament-/Turnier-Implementierung). Per `gh pr merge --squash` gemergt.

**Merge-SHA: `5a5de3e`** (`5a5de3e461b1ff0979c88d17b61a42c0bb6281d3`, kurz `5a5de3e461b1`).

## 2. CI

`main`-CI (ausgelöst durch den Merge-Push) grün. Der erste automatisch per `workflow_run` ausgelöste Deploy-Lauf (`33100723061`) **schlug fehl** — nicht im CI-Schritt und nicht im Image-Build (beide erfolgreich), sondern im Schritt "Set up deploy key" der Deploy-VPS-Job, konkret bei `ssh-keyscan -H "vps.verevia.app"` (Exit-Code 1). Ursache: eine transiente Netzwerkstörung — ein eigener, unabhängiger SSH-Verbindungsversuch zur exakt gleichen Zeit von dieser Arbeitsumgebung aus schlug ebenfalls kurzzeitig fehl ("Operation timed out"), wenige Minuten später war die VPS wieder normal erreichbar. Kein Zusammenhang mit dem Phase-10-Code oder der Migration. Behoben durch manuellen Re-Trigger über `gh workflow run "Deploy DEV" --ref main` (`workflow_dispatch`, vom bestehenden Workflow explizit unterstützt) — dieser Lauf (`33149309840`) war vollständig erfolgreich.

## 3. workflow_run / Images

- **Build and push images**: erfolgreich (im fehlgeschlagenen Lauf bereits erfolgreich, im Retry erneut erfolgreich, 25s dank Layer-Cache).
- **API-Image**: `ghcr.io/mugglman/verevia-api:5a5de3e461b1` — erfolgreich gebaut und gepusht.
- **Web-Image**: `ghcr.io/mugglman/verevia-web:5a5de3e461b1` — erfolgreich gebaut und gepusht.
- SHA-Tags vorhanden und von beiden laufenden Containern tatsächlich gezogen (verifiziert per `docker ps` auf dem VPS, siehe Abschnitt 6).

## 4. Backup

Vor jeder Änderung automatisch erstellt: `verevia-dev-20260828T065112Z-5a5de3e461b1.sql.gz` (Dateiname enthält Zeitstempel und Ziel-SHA), `/srv/verevia/backups/`, laut Deployment-Log erfolgreich ("Backing up verevia-dev-postgres ..."). Kein Backup-Inhalt in diesem Bericht kopiert.

## 5. Migration

Bestehende, persistente DEV-Datenbank — **kein Reset, kein `db push`, kein Volume-Löschen, keine Neuaufsetzung**. `prisma migrate deploy` lief inkrementell:

- **10 Migrationen** insgesamt vorhanden (9 aus Phase 1–9 + 1 neu).
- Neu angewendet: **ausschließlich** `20260827120000_add_venue_and_football_match`.
- Kein Schemafehler, kein Rollback, keine unerwartete Migration.
- Die bestehende Phase-9-Datenbank (Tenant, Personen, Rollen, Season, TeamSeason) blieb vollständig erhalten (siehe Abschnitt 8).

## 6. Healthcheck

`https://api.verevia.app/health` → `{"status":"ok","version":"5a5de3e461b1"}` — HTTP 200, `status: ok`, `version` entspricht exakt dem neuen Merge-SHA. `https://app.verevia.app` → erreichbar (HTTP 307 ohne Session, erwartetes Redirect-Verhalten zu `/login`, identisch zum bisherigen Verhalten).

## 7. Container

Auf dem VPS geprüft:

| Container | Status | Image |
|---|---|---|
| `verevia-dev-api` | Up, **healthy** | `ghcr.io/mugglman/verevia-api:5a5de3e461b1` |
| `verevia-dev-web` | Up, **healthy** | `ghcr.io/mugglman/verevia-web:5a5de3e461b1` |
| `verevia-dev-postgres` | Up, **healthy** | `postgres:17-alpine`, **kein** veröffentlichter Host-Port (`docker port` liefert keinen Eintrag) |
| `verevia-traefik` | unverändert, seit 10 Tagen durchgehend up | — |

`verevia-prod`-Netzwerk weiterhin ohne Container (`docker network inspect verevia-prod` liefert leere Container-Liste) — unangetastet.

## 8. Persistente Daten — Vorher/Nachher

**Baseline vor der Feature-Verifikation** (nach erfolgreichem Deployment, vor jeglichen Testaktionen):

| Tenants | Personen | Users | Rollen | Beziehungen | Teammitglieder | Abteilungen | Teams | Saisons | Altersklassen | TeamSeasons | Venues | Matches |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 1 | 2 | 1 | 3 |

Exakt identisch zur Phase-9-Baseline, zuzüglich der neuen Phase-10-Seed-Daten (1 Venue "Sportplatz Benediktbeuern", 3 Demo-Matches) — durch die Migration+Seed dieses Deployments korrekt und idempotent hinzugekommen, keine bestehenden Daten verändert oder verloren.

**Nach vollständiger Live-Verifikation und Testdaten-Cleanup** (siehe Abschnitt 15): identische Werte (1/4/1/2/1/2/1/2/1/1/2/1/3) — verifiziert per erneuter Zählabfrage. Keine Regression, kein Datenverlust, kein Leck von Testdaten.

## 9. Live-Login

Echter Login gegen `https://app.verevia.app` getestet — keine Mock-Session, keine DB-Manipulation als Login-Ersatz. Da keine bestehenden Live-Testaccounts mit bekanntem Passwort vorlagen (Muster aus Phase 7/8/9), wurden zwei temporäre, ausschließlich fiktive Testaccounts über den echten better-auth-Signup-Endpunkt (`POST /api/auth/sign-up/email`, echte HTTPS-URL) angelegt: ein TENANT_ADMIN- und ein COACH-E1-Account. Verknüpfung mit einer neuen, fiktiven `Person` sowie minimal notwendigen `RoleAssignment`s erfolgte per direktem, dokumentiertem DB-Insert (kein Self-Service-Weg für "verknüpfe bestehenden Login mit einer neuen Rolle" vorhanden — identisches, etabliertes Muster aus der Phase-9-Live-Verifikation). Beide Accounts wurden nach Abschluss vollständig entfernt (Abschnitt 15).

## 10. Venue Live-Test

Als TENANT_ADMIN über `https://app.verevia.app/spielstaetten`:

1. Bestehende Seed-Spielstätte "Sportplatz Benediktbeuern" sichtbar ✓
2. Neue temporäre Spielstätte angelegt (Name, Straße, PLZ, Ort) — sofort in der Liste sichtbar ✓
3. Bearbeitet: Status auf `INACTIVE` gesetzt und gespeichert — Badge zeigt korrekt "Inaktiv" ✓
4. Nach vollständigem Seitenreload weiterhin vorhanden ✓
5. Keine technischen IDs im UI-Text sichtbar (Seiteninhalt auf das interne ID-Präfix der Testdaten geprüft — kein Treffer) ✓

Kein Hard-Delete über die Produkt-API erzwungen (es existiert bewusst kein DELETE-Endpunkt) — Testbereinigung erfolgte kontrolliert auf DB-Ebene (Abschnitt 15).

## 11. Match Live-Test

Happy Path als TENANT_ADMIN: Login → Fußball → Spiele → Spiel anlegen (Mannschaft E1/Saison 2026/2027, Gegner "SV Testhausen"-artiger fiktiver Name, Freundschaftsspiel, Heimspiel, Spielstätte "Sportplatz Benediktbeuern", eindeutiger zukünftiger Testtermin). Ergebnis:

- Spiel erscheint korrekt in der Liste (Team, Gegner, "Heimspiel"-Label sichtbar) ✓
- Detailseite lädt, zeigt Team/Gegner/Spielstätte korrekt ✓
- Bearbeitet: `HOME` → `NEUTRAL` sowie Datum/Uhrzeit geändert, gespeichert ✓
- Nach Reload: "Neutraler Platz"-Label weiterhin sichtbar — Änderung persistent ✓

Zusätzlich als COACH E1 verifiziert: eigenes E1-Spiel real über die UI angelegt, Detailseite mit Bearbeiten-Formular erreichbar (`canEdit: true`) ✓.

## 12. COMPLETED / Score-Validierung

- Ungültige Kombination (`SCHEDULED` + gesetztes Ergebnis) direkt gegen die echte API getestet (`POST /api/v1/football/matches` mit `status: SCHEDULED, homeScore: 2, awayScore: 0`) → **HTTP 400**, wie erwartet abgelehnt.
- Gültiger Fall: Status auf `COMPLETED` gesetzt, Ergebnis `4:2` gespeichert → sichtbar in der UI ("4:2"), "Abgeschlossen"-Badge sichtbar, per Reload/erneutem API-Read bestätigt persistiert.

## 13. Match Types / Home-Away-Neutral

Alle vier `MatchType`-Werte im Anlegen-Formular live verfügbar und korrekt beschriftet: Ligaspiel, Freundschaftsspiel, **Turnierspiel**, Pokalspiel. Alle drei `MatchHomeAway`-Werte live verfügbar: Heimspiel, Auswärtsspiel, **Neutraler Platz** — `NEUTRAL` wurde zusätzlich aktiv gesetzt und gespeichert (Abschnitt 11), keine boolesche `isHome`-Sonderlogik beobachtet. Es wurden bewusst keine vier zusätzlichen dauerhaften Testspiele für jeden Typ angelegt — die Verfügbarkeit aller Werte ist über die Formular-Optionen selbst bereits eindeutig live nachgewiesen.

## 14. Authorization Live

**TENANT_ADMIN**: Spielstätten lesen/anlegen/bearbeiten ✓, Matches lesen/anlegen/bearbeiten ✓ — keine Berechtigungsfehler.

**COACH E1** (echte HTTPS-Zugriffe, nicht nur Unit-Tests): Fußball/Saison/E1 lesen ✓, E1-Matches lesen ✓, eigenes E1-Match anlegen/bearbeiten ✓, Spielstätten lesen ✓. Korrekt verweigert: keine administrative Spielstättenverwaltung (kein Anlegen-/Bearbeiten-Formular sichtbar, `0` Treffer) ✓, `PATCH` auf ein E2-Match direkt gegen die echte API → **HTTP 403** ✓, Personenverwaltung → "keine Berechtigung"-Meldung ✓, "Saisons verwalten"-Link nicht sichtbar ✓.

**Department Scope** (Abteilungsübergreifend): nicht zusätzlich mit einer künstlichen Tennis-Komplettstruktur live nachgebaut — unverhältnismäßiger Aufwand für dieses reale DEV-System, das aktuell nur eine Fußballabteilung führt (Auftrag erlaubt das explizit). Bereits vollständig durch die bestehende, reale PostgreSQL-17-Integrationstestsuite abgedeckt (`apps/api/test/match-foundation.integration-spec.ts`, Test "DEPARTMENT_ADMIN Fußball is forbidden from creating a match for a Tennis team season").

## 15. Regression

Nach dem Deployment real geprüft: Login ✓, Verein (Startseite zeigt "TSV Benediktbeuern") ✓, Personenverwaltung mit allen 4 Seed-Personen (Max Mustermann, Erika Musterfrau, Petra Beispiel, Anna Mustermann) ✓, Fußball-Übersicht mit aktiver Saison 2026/2027, Altersklasse E-Jugend, E1 und E2 ✓, Meine Kinder lädt fehlerfrei ✓. Keine Regression durch die Phase-10-Migration/das Deployment feststellbar.

## 16. Testdaten-Cleanup

Vollständig entfernt und per Zählabfrage verifiziert (0 verbleibende Treffer je Kategorie):

- 2 temporäre `FootballMatch`-Zeilen (Admin-Testspiel, Coach-Testspiel)
- 1 temporäre `Venue`-Zeile
- 2 temporäre `RoleAssignment`-Zeilen
- 2 temporäre `Membership`-Zeilen
- 2 temporäre `Person`-Zeilen
- 2 temporäre `Session`-Zeilen
- 2 temporäre `Account`-Zeilen
- 2 temporäre `User`-Zeilen

Bestehende Seed-/DEV-Daten wurden zu keinem Zeitpunkt gelöscht oder verändert (siehe Abschnitt 8, identischer Vorher/Nachher-Stand).

## 17. SSH-Key-Cleanup

Temporärer Live-Verifikations-Key (`verevia-phase10-live-verify-20260827194725`) ausschließlich aus `~/.ssh/authorized_keys` entfernt. Verifiziert:

1. `grep` auf den exakten Kommentar → kein Treffer.
2. Erneuter SSH-Verbindungsversuch mit exakt diesem privaten Schlüssel → `Permission denied (publickey,password)`, Verbindung schlägt wie erwartet fehl.

Alle anderen `authorized_keys`-Einträge sowie der permanente GitHub-Deployment-Key unverändert. Lokale Schlüsseldateien gelöscht.

**`authorized_keys.bak`-Status**: Beim Sitzungsstart existierte bereits eine `authorized_keys.bak` (Zeitstempel vor Sitzungsbeginn) — geprüft **vor** jeglicher eigener Aktion und eindeutig als Rückstand der vorherigen, bereits im Phase-10-Implementierungsbericht dokumentierten Key-Entfernung von heute Vormittag identifiziert (Inhalt exakt: der bereits entfernte `verevia-phase10-match-foundation-...`-Key, keine weiteren/unbekannten Einträge). Da die Herkunft eindeutig nachweisbar und die Datei keine benötigten Informationen enthielt, wurde sie im Rahmen dieses Cleanups entfernt. Durch das Entfernen des **eigenen** Live-Verifikations-Keys (Schritt oben, `sed -i.bak`) entstand danach zwangsläufig eine **neue** `authorized_keys.bak` auf dem VPS — dasselbe unvermeidbare Muster wie in jeder vorherigen Phase: nach Zugriffsentzug kann sie nicht mehr selbst entfernt werden. Enthält ausschließlich den bereits revozierten öffentlichen Schlüsseltext dieser Sitzung, kein aktives Credential. Befehl für den Nutzer: `rm ~/.ssh/authorized_keys.bak`.

## 18. Risiken

- Der einmalige Deploy-Fehlschlag (Abschnitt 2) war eine reine Infrastruktur-/Netzwerk-Transiente, keine Code-Ursache — aber zeigt, dass `ssh-keyscan` im bestehenden `deploy-dev.yml` unter `bash -e` läuft und damit den gesamten Deployment-Versuch bei einer kurzen Netzwerkstörung abbrechen lässt, ohne automatischen Retry. Für ein künftiges, kleines Arbeitspaket: ein einfacher Retry/Backoff um den `ssh-keyscan`-Aufruf würde solche transienten Fehlschläge automatisch überbrücken, statt einen manuellen `workflow_dispatch`-Neustart zu erfordern.
- Ansonsten unverändert die bereits im technischen Phase-10-Bericht genannten Risiken (Abschnitt 26 dort) — keine neuen, live-spezifischen Risiken gefunden.

## 19. Technische Schulden

Keine neuen. Siehe optionale Retry-Verbesserung in Abschnitt 18 — bewusst nicht in diesem Auftrag umgesetzt (Scope-Grenze: reine Verifikation, keine Pipeline-Änderung).

## 20. Eignung als Tournament-Fundament

Live bestätigt: `FootballMatch` unterstützt bereits produktiv `type: TOURNAMENT` (als Formular-Option verfügbar) und alle drei `homeAway`-Werte inkl. `NEUTRAL` (aktiv getestet, persistiert). Das im DEV-System laufende, real deployte Modell ist damit unverändert geeignet, dass ein künftiger Tournament Core (Phase 11) direkt auf diesem `FootballMatch`-Modell aufsetzt, ohne ein paralleles Spielmodell zu benötigen — keine Diskrepanz zwischen dem in der Entwicklung verifizierten und dem live deployten Schema festgestellt.

## 21. Fazit

Alle in Auftrag Abschnitt 2 genannten Ziele erreicht: Merge, automatisches (nach einem transienten, selbst behobenen Fehlschlag erfolgreichem) Deployment, inkrementelle Migration, Venue/Match/Authorization live über echte HTTPS-Zugriffe verifiziert, keine Regression, persistente Daten unverändert, alle Testdaten vollständig entfernt und verifiziert, temporärer SSH-Key entfernt und verifiziert.
