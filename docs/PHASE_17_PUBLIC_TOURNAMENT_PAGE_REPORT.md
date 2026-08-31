# Phase 17 – Öffentliche Turnierseite

## 1. Ausgangslage

PR #20 (`feat(tournament): add group standings and GROUP_POSITION slot resolution`) war zu Beginn dieses Arbeitspakets bereits geprüft (OPEN, CI grün, MERGEABLE, CLEAN, Head-SHA `0a25df6`) und wurde vor jeder Phase-17-Implementierung squash-gemergt. **Phase-16-Merge-SHA: `fdfee7c`** (verifiziert via `git log`/`git merge-base` gegen `origin/main` nach `git pull --ff-only`). Branch `feat/public-tournament-page` wurde von diesem verifizierten `main` erstellt.

## 2. Scope-Herleitung

Kein expliziter „Phase 17"-Eintrag existierte im Repository, aber die dokumentierte Produktplanung ließ den Scope eindeutig bestimmen — dreifach konsistent belegt:

- `docs/roadmap/Roadmap.md`, „Phase 4 – Turnierplan": Turnier erstellen, Teilnehmer, Gruppen, Spielplan, Ergebnisse, Tabellen, K.-o.-Runden, **öffentliche Turnierseite**. Alle Punkte außer dem letzten sind durch Phase 11–16 bereits umgesetzt.
- `docs/product/MVP-Scope.md`, Punkt 17: „öffentliche Turnierinformationen"; zusätzlich unter „Offene fachliche Fragen": „Welche Mindestanforderungen gelten für öffentliche Turnierinformationen (z. B. ohne Login einsehbar)?"
- `docs/product/Product-Vision.md`: „Unterstützung für Turnierplanung inklusive öffentlicher Turnierinformationen".

Damit war **kein Widerspruch zwischen Dokumenten aufzulösen** — alle drei zeigen auf denselben, einzigen noch offenen Punkt. Scope: eine öffentliche, nicht-authentifizierte Seite pro Turnier mit Teilnehmern, Gruppen/Tabellen und Spielen/Ergebnissen.

## 3. Bewusst nicht im Scope

Öffentliche Übersichtsseite über ALLE Turniere eines Vereins (nur Einzelturnier-Detailseiten), Mehrmandanten-fähige URL-Auflösung (Slug/Subdomain statt Pilot-Tenant), Social-Sharing-Metadaten (OpenGraph/Twitter Cards), RSS/Kalender-Export, ein öffentliches Kommentar-/Interaktionssystem, eine eigene öffentliche Navigation/Branding-Variante, SEO-Optimierung über das Nötigste hinaus — nichts davon ist in den referenzierten Produktdokumenten für diesen Punkt gefordert.

## 4. Architektur

Siehe [ADR 0013](architecture/adr/0013-public-tournament-page-auth-boundary.md) für die vollständige Begründung. Kernpunkte:

- Neuer `PublicTournamentController` (`GET /public/tournaments/:id`) **ohne** `TenantContextInterceptor` — keine Session, keine Membership-Prüfung nötig, exakt das bestehende Muster von `PublicInvitationsController` (Phase 6).
- RLS bleibt vollständig scharf: `PublicTournamentService` liest ausschließlich über `getTenantPrisma(tenantId)`. Der `X-Tenant-Id`-Header ist hier kein Autorisierungsnachweis, sondern die vom Server (nicht vom Client) via `resolvePilotTenantId()` aufgelöste Tenant-Auswahl — ein falsches (tenantId, tournamentId)-Paar liefert 404.
- **Keine zweite Standings-/Label-Engine**: `computeGroupStandings` (Phase 16, ADR 0012) und die aus `MatchesService` exportierten `participantName`/`pendingSlotLabel` werden unverändert wiederverwendet.
- **Keine zweite UI-Darstellung**: `GroupStandingsTable` wurde aus `tournament-detail.tsx` in eine eigenständige, gemeinsam genutzte Komponente extrahiert — beide Seiten (authentifiziert und öffentlich) rendern dieselbe Tabellenkomponente.
- Neue Seite `/turnier/[id]` (Next.js, top-level, analog zu `/einladung/[token]`), `force-dynamic`, ruft die neue API über den bestehenden `apiFetch`-Helfer auf (derselbe Tenant-Header-Mechanismus wie überall sonst).

## 5. Domainlogik

Keine neue reine Domainfunktion — die gesamte fachliche Logik (Standings-Berechnung, Ranking, Slot-Labels) existiert bereits und wird unverändert wiederverwendet. Die einzige neue Regel ist eine reine Sichtbarkeitsentscheidung (kein `DRAFT`), keine Berechnung.

## 6. Datenmodell / Migration

**Migration: Nein.** Kein neues Feld, keine neue Tabelle — alles bereits vorhandene, tenant-gescopte Daten. `prisma validate` grün, `prisma migrate diff --exit-code` gegen die frische temporäre DB: „No difference detected" (Drift = 0).

## 7. API

`GET /public/tournaments/:id` — `X-Tenant-Id` erforderlich (400 wenn fehlend), liefert 404 für nicht existierendes Turnier, für ein Turnier im Status `DRAFT`, und für ein falsches Tenant/Turnier-Paar (RLS). Alle anderen Status (`PLANNED`/`ACTIVE`/`COMPLETED`/`CANCELLED`) liefern 200 mit Turnierdaten, Teilnehmern, Gruppen+Standings und Spielen. Keine `canEdit`-Felder, keine Management-Affordanzen in der Antwort.

## 8. UI

Neue Seite `/turnier/[id]`: Turnierkopf (Name, Zeitraum, Status, Modus, Abteilung), Gruppen mit Live-Tabelle (Zwischenstand/Endstand, fachlicher Gleichstand mit `*`-Markierung — identisch zur authentifizierten Seite, da dieselbe Komponente), Teilnehmerliste (inkl. „Zurückgezogen"-Markierung), Spieleliste mit Ergebnissen/ausstehenden Slot-Labels. Keinerlei Formulare, Buttons oder Eingabefelder — real per E2E-Test verifiziert (`getByRole("button")`/`getByRole("textbox")` → 0 Treffer). Neuer Link „Öffentliche Turnierseite ansehen" auf der authentifizierten Detailseite (ausgeblendet für `DRAFT`-Turniere).

## 9. Permissions

Keine neue Autorisierungsarchitektur für authentifizierte Endpunkte — unverändert. Der neue öffentliche Endpunkt hat bewusst KEINE Autorisierungsprüfung (das ist seine Funktion), aber eine explizite Sichtbarkeitsregel (kein `DRAFT`) als fachlicher Ersatz.

## 10. Tenant Isolation

Kein neues RLS-Policy nötig — `PublicTournamentService` nutzt den bestehenden, in `tournament-core.integration.spec.ts` bereits exhaustiv auf DB-Ebene verifizierten RLS-Mechanismus für `FootballTournament`/`TournamentParticipant`/`TournamentGroup`/`FootballMatch` unverändert. Ein dedizierter neuer DB-Integrationstest wäre redundant zu dieser bestehenden Abdeckung; stattdessen verifiziert ein neuer API-Integrationstest, dass der öffentliche Endpunkt diesen Mechanismus korrekt nutzt (Tenant B kann Tenant As Turnier nicht lesen → 404).

## 11. Concurrency

Phase 17 führt ausschließlich Lesevorgänge ein (kein neuer Schreib-/Transaktions-/Lock-Pfad). Der in Phase 16 gefundene und behobene PostgreSQL-Deadlock (`40P01`, gleichzeitige Finalisierung zweier Gruppenspiele) wurde als Regressionsprüfung erneut real gegen PostgreSQL 17 verifiziert: **4 von 4 Wiederholungen grün** (1× im vollen Testlauf, 3× isoliert wiederholt) — der Fix hält unter einer frischen Umgebung stand.

## 12. Tests

| Ebene | Ergebnis |
|---|---|
| Unit (apps/api) | **193/193** grün (unverändert — keine neue reine Domainlogik) |
| Unit (apps/web) | **145/145** grün (10 neu: 2 in `tournament-detail.test.tsx`, 8 in `public-tournament-view.test.tsx`) |
| DB-Integration (real PostgreSQL 17) | **130/130** grün (unverändert — kein neuer RLS-/Transaktions-/Lock-Pfad, siehe Abschnitt 10) |
| API-Integration (real PostgreSQL 17, real HTTP) | **191/191** grün über alle 14 Dateien, davon **10/10** neu in `public-tournament.integration-spec.ts` |
| E2E (real PostgreSQL 17, echter Browser) | **20/20** grün über alle 13 Spezifikationen, **0 Retries nötig** (auch die vorher bekannt flakige `tournament-match-result-ui.spec.ts` lief beim ersten Versuch durch) |
| Concurrency (real PostgreSQL 17) | 4/4 Wiederholungen grün (Regressionsprüfung des Phase-16-Fixes) |

Testabdeckung: gültige Sichtbarkeit (PLANNED/ACTIVE/COMPLETED/CANCELLED), DRAFT verborgen, nicht existierendes Turnier, fehlender `X-Tenant-Id`-Header, Cross-Tenant, Zwischenstand vs. Endstand, Unentschieden, ausstehende Slot-Labels, zurückgezogener Teilnehmer, Idempotenz (wiederholtes Lesen liefert identische, unveränderte Daten), keine Management-Felder in der Antwort, keine Formulare/Buttons in der UI.

## 13. E2E — Kernfall

Ein echter, vollständiger Flow über zwei getrennte Browser-Identitäten: ein TENANT_ADMIN (authentifizierte Session) baut ein Turnier auf (Gruppe, Teilnehmer, Spielstätte, Status-Änderung DRAFT → Geplant, Spiel anlegen, Ergebnis eintragen), während ein **echter, storageState-freier anonymer Browser-Kontext** (kein Mock, keine API-Abkürzung) `/turnier/[id]` besucht: zunächst 404 (DRAFT), nach Veröffentlichung sichtbar, nach Ergebniseingabe mit Live-Tabelle und Ergebnis — inkl. Verifikation, dass keinerlei Bearbeitungselemente erreichbar sind.

## 14. Phase-15-E2E-Altlast — untersucht und behoben

Die in Phase 16 dokumentierte Race Condition (`expectVisibleAfterSubmit`s Reload-Strategie kollidiert mit einer noch laufenden Server-Action-Weiterleitung unter SSH-Tunnel-Latenz) wurde erneut eindeutig reproduziert — sowohl beim ersten Lauf des neuen Phase-17-E2E-Tests als auch, historisch dokumentiert, in `tournament-match-result-ui.spec.ts`. Root Cause unverändert: `page.reload()` verwirft eine noch nicht abgeschlossene client-seitige Weiterleitung nach `redirect()` in einer Server Action endgültig.

**Behoben** — klein, architekturkonform, an genau den betroffenen Stellen (nicht die gesamte Hilfsfunktion umgeschrieben):

- `tournament-knockout.spec.ts`, `tournament-match-slot-resolution.spec.ts`, `tournament-match-result-ui.spec.ts`: der jeweils EINE Aufruf direkt nach dem „Turnier anlegen"-Submit (der einzige tatsächlich betroffene Schritt — der zweite `expectVisibleAfterSubmit`-Aufruf in denselben Dateien wartet auf eine reine `<Link>`-Navigation, nicht auf eine Server-Action-Weiterleitung, und ist unverändert sicher) wurde auf `page.waitForURL(...)` umgestellt — wartet, statt eine laufende Weiterleitung zu unterbrechen.
- Der neue Phase-17-Test verwendet von Anfang an dasselbe Muster für den Turnier-Erstellungs-Schritt.
- Kein Sleep, kein pauschal höheres Timeout, keine globale Retry-Schleife — nur das eigentlich richtige Wartekriterium (URL-Änderung statt Element-Sichtbarkeit) an der einen tatsächlich betroffenen Stelle.

**Ergebnis**: die volle E2E-Regressionssuite lief mit `--retries=1` durch — **0 tatsächliche Retries wurden gebraucht**, auch nicht für die vorher bekannt flakige Datei. Damit ist diese Altlast für die betroffenen Dateien nachweislich behoben, nicht nur dokumentiert.

## 15. VPS/PostgreSQL

PostgreSQL 17, temporärer Container `verevia-phase17-pg17-test` (eigenes Volume, `127.0.0.1`-only, Port 55436). Migration aus leerer DB: alle 13 Migrationen (unverändert aus Phase 16) sauber angewendet, **Drift: 0**. Seed zweimal ausgeführt → identische IDs, identische Zeilenzahlen (1 Tenant, 3 Turniere, 12 Teilnehmer, 4 Spiele) → Idempotenz bestätigt.

## 16. Quality Gates

`pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle 7 Pakete) grün — vor der Implementierung (sauberer Ausgangszustand nach Phase-16-Merge bestätigt) UND nach vollständiger Implementierung erneut ausgeführt. `prisma validate` grün, Drift 0. DB-/API-Integrationstests real gegen PostgreSQL 17 grün. E2E real verifiziert, 0 Retries. Markdown-Lint für alle `docs/**/*.md` grün. `git status`/`git diff` vor dem Commit explizit auf Secrets/temporäre Dateien geprüft — sauber.

## 17. Gefundene Bugs

Keine neuen Produktbugs. Die in Abschnitt 14 behobene E2E-Altlast war bereits aus Phase 16 bekannt und dokumentiert (kein neuer Fund), ihre Behebung war jedoch ausdrücklicher Teil dieses Auftrags.

## 18. Behobene Bugs

Siehe Abschnitt 14 (E2E-Altlast, in 3 bestehenden Spezifikationen behoben).

**Eigene Testbugs (gefunden und behoben, während der Neuentwicklung):** drei mehrdeutige Playwright-Locators im neuen E2E-Test (`getByText("Geplant")` traf zusätzlich die `<option>` im Status-Select; `getByText("Gruppe A")` traf zusätzlich die Gruppen-Tags neben jedem Teilnehmer; `getByText(/2:0/)` traf zusätzlich die Tore-Zelle der Standings-Tabelle) — jeweils durch engere Scoping-Locators (Tag-Filter bzw. Sektions-Scoping) behoben, keine der zugrundeliegenden Produktfunktionen war betroffen.

## 19. Bestehende Altlasten

Keine neuen. Die einzige bekannte (Abschnitt 14) wurde für die betroffenen Dateien behoben.

## 20. Risiken

Keine neuen strukturellen Risiken. Die öffentliche Seite exponiert ausschließlich bereits als öffentlich vorgesehene Turnierinformationen (siehe ADR 0013) — keine personenbezogenen Daten über Teamnamen hinaus.

## 21. Technische Schulden

`PublicTournamentService.getPublicView` berechnet Standings live bei jedem Aufruf (wie `TournamentGroupsService.list()`, ADR 0012) — für die in der Praxis kleinen Turniere vernachlässigbar. Die Mehrmandanten-Auflösung für öffentliche Seiten bleibt auf den Pilot-Tenant beschränkt (siehe ADR 0013, „Konsequenzen") — eine spätere Erweiterung, kein Bug.

## 22. Cleanup

- Temporärer Container `verevia-phase17-pg17-test`: entfernt.
- Temporäres Volume `verevia-phase17-pg17-test-vol`: entfernt.
- SSH-Tunnel: geschlossen.
- Temporärer SSH-Key `verevia-phase17-public-tournament-page-1788186525`: aus `/home/maik/.ssh/authorized_keys` entfernt, **Entfernung durch fehlgeschlagenen Reconnect-Versuch verifiziert** (`Permission denied (publickey,password)`), lokale Schlüsseldateien gelöscht.
- Lokale temporäre API-/Web-Serverprozesse gestoppt.
- Permanente Ressourcen (`verevia-dev-web`, `verevia-dev-api`, `verevia-dev-postgres`, `verevia-traefik`, `docker_verevia-dev-postgres-data`): **unverändert**, `verevia-prod` **nicht angetastet**.
- Keine Secrets, keine `.env`-Dateien, keine temporären Testartefakte im Repository.

## 23. Dokumentation

Dieser Bericht sowie [ADR 0013](architecture/adr/0013-public-tournament-page-auth-boundary.md) (README-Index aktualisiert).

## 24. Git/PR

- Branch: `feat/public-tournament-page`
- Endcommit: siehe PR
- PR: siehe unten
- **Gemergt: NEIN**

ÖFFENTLICHE TURNIERSEITE READY
