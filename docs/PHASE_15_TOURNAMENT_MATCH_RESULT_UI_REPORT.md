# Phase 15 – Tournament Match Result UI

## 1. Ausgangslage

PR #18 (`feat(tournament): auto-resolve knockout match slots after results`) war beim Start dieses Arbeitspakets grün, mergeable, offen — geprüft und squash-gemergt (Merge-SHA `8e987dd`). `main` lokal aktualisiert, Phase 14 vollständig in `main` bestätigt. Branch `feat/tournament-match-result-ui` von `8e987dd` erstellt.

Relevante Architektur (vor Implementierung real im Code verifiziert, nicht nur aus den Berichten übernommen): `MatchDto`/`MatchesService.toDto` (Phase 10/14), `PATCH /football/matches/:id` als einziger Ergebnis-Eintragungsweg, `TournamentDetail`/`TournamentDetailMatch` (server-gerendert, Phase 11), `canOnSeason`-Autorisierung (Phase 8), `resultPropagatedAt`/`assertResultNotLocked` (Phase 14/ADR 0011), `pendingSlotLabel` (Phase 13/14). Bestätigt: **kein** Modal-/Dialog-System, **kein** Toast-System, **keine** client-seitige Datenabfrage (100 % Server Components + Server Actions + `revalidatePath`) existiert irgendwo im bestehenden Code — jede neue UI musste sich in dieses Muster einfügen, nicht ein eigenes einführen.

## 2. Implementierung

### Komponenten

- **`apps/web/src/components/tournament-match-result-form.tsx`** (neu, Client-Komponente): pro spielbarem Match ein Umschalt-Button ("Ergebnis eintragen"/"Ergebnis bearbeiten") → klappt ein kleines, inline gerendertes Formular auf (Tore Heim/Auswärts, Speichern/Abbrechen) — kein Modal, keine neue Designwelt, exakt die bestehenden Tailwind-Klassen/Farbwerte aus Phase 12/13 wiederverwendet.
- **`apps/web/src/components/tournament-detail.tsx`** (erweitert): `TournamentDetailMatch` bekommt `homeParticipantId`/`awayParticipantId`/`canEdit`/`resultLocked` (alle bereits auf `MatchDto` vorhanden, nur bisher nicht durchgereicht — keine neue API-Query nötig). Die Spiele-Liste zeigt jetzt: Gewinner fett hervorgehoben (sofern eindeutig bestimmbar), einen Unentschieden-Hinweis, das Ergebnisformular (wenn spielbar+editierbar+nicht gesperrt) oder einen Sperr-Hinweis (wenn bereits propagiert).

### UX

Erfüllt die im Auftrag verlangten 8 Unterscheidungen (Abschnitt 6): (1) unaufgelöster Slot → weiterhin der bestehende Phase-14-Platzhaltertext, kein Formular; (2) spielbereit → Button sichtbar; (3) wird gespeichert → Button-Text "Wird gespeichert …", Speichern/Abbrechen deaktiviert; (4) abgeschlossen → Ergebnis + ggf. fett hervorgehobener Gewinner; (5) Unentschieden → eigener Hinweistext, kein erfundener Gewinner; (6) propagiert/gesperrt → Sperr-Hinweis statt Formular; (7) 409 → inline deutsche Fehlermeldung (der exakte Backend-Satz aus ADR 0011); (8) allgemeiner Fehler → generischer deutscher Fallback-Satz. Keine Tore-Eingabe unter 0 möglich — sowohl `min={0}`+`noValidate` (eigene, konsistent gestylte Fehlermeldung statt browser-abhängiger nativer Validierung) als auch serverseitig (`@Min(0)`, unverändert aus Phase 10).

### API-Nutzung

**Kein neuer Endpoint.** Eine neue, dünne Server Action `updateTournamentMatchResultAction` (`apps/web/src/app/actions.ts`) PATCHt ausschließlich `status: "COMPLETED"` + `homeScore`/`awayScore` gegen den bestehenden `PATCH /football/matches/:id`. Einzige Backend-Änderung: `MatchDto` um ein Feld `resultLocked: boolean` erweitert (`match.resultPropagatedAt !== null`) — bewusst der rohe Zeitstempel NICHT exponiert, nur das für die UI relevante Boolean. Begründet, getestet (siehe Abschnitt 3), dokumentiert (dieser Bericht + ADR-Verweis).

### Berechtigungen

Keine neue Logik. Die UI zeigt das Formular nur, wenn `match.canEdit` (server-seitig via `canOnSeason` berechnet, identisch zu Phase 14) — reines Anzeige-Gating, keine Frontend-Autorisierung. Die API bleibt unabhängig davon die alleinige Durchsetzungsinstanz (unverändert aus Phase 14: `TENANT_ADMIN` immer, `DEPARTMENT_ADMIN` der eigenen Abteilung, `COACH` 403).

### Error Handling

Ausschließlich das bestehende Muster: `ScheduleActionResult<T>`-Rückgabe (kein Werfen), inline `<p className="text-red-600">` — identisch zu `tournament-knockout-generator.tsx`. Keine PostgreSQL-/Prisma-/Stacktrace-Texte erreichen je den Client (das Backend liefert bereits ausschließlich deutsche Sätze).

### Cache/Refresh

`revalidatePath(\`/fussball/turniere/${tournamentId}\`)` nach erfolgreichem Speichern — dieselbe Server-Action-Konvention wie jede andere Mutation in diesem Codebase. Kein Full-Page-Reload, kein Redirect (Formular bleibt auf derselben Seite, Next.js aktualisiert die betroffenen Server-Komponenten automatisch nach der Action).

### Umgang mit `resultPropagatedAt`

Das Frontend sieht den rohen Zeitstempel nie — nur `resultLocked: boolean`. Die Sperr-Regel (ADR 0011, Option A) bleibt vollständig serverseitig durchgesetzt; die UI verhindert lediglich proaktiv den erwartbaren 409-Fall (kein Formular mehr sichtbar, sobald `resultLocked`), ohne die Sperre selbst zu duplizieren — ein direkter, außerhalb der UI erfolgter PATCH-Versuch würde weiterhin korrekt mit 409 abgelehnt (unverändert getestet, siehe Abschnitt 3).

## 3. Tests

**Unit-/Component-Tests:** neue Datei `tournament-match-result-form.test.tsx` (9 Tests: Umschalt-Button beider Label-Varianten, Vorbefüllung bei Korrektur, Abbrechen ohne Aufruf, negativer Wert clientseitig blockiert ohne API-Aufruf, erfolgreicher Save mit korrektem Payload, Double-Submit-Schutz während des Speicherns, 409-Meldung inline ohne Statuscode, generischer Fehlertext, keine technischen IDs sichtbar). `tournament-detail.test.tsx` um 6 Tests erweitert (Formular bei spielbar+editierbar+ungesperrt; kein Formular bei unaufgelöstem Slot; kein Formular ohne Berechtigung; Sperr-Hinweis statt Formular bei propagiertem Ergebnis; Gewinner-Hervorhebung; Unentschieden ohne erfundenen Gewinner). Gesamt `apps/web`-Unit-Suite: **131/131 grün** (116 vorher + 15 neu).

**DB-Tests:** bewusst **keine neuen** — `resultLocked` ist eine reine Lese-Projektion des bereits in Phase 14 exhaustiv transaktions-/lock-/RLS-getesteten `resultPropagatedAt`-Feldes, keine neue DB-Semantik. Phase-14-DB-Suite unverändert real gegen PostgreSQL 17 verifiziert: **122/122 grün**, keine Regression.

**API-Integration:** ein gezielter neuer Test in der bestehenden `tournament-match-slot-resolution.integration-spec.ts` (kein neues Testfile, um sinnlose Duplikation zu vermeiden) — verifiziert `resultLocked: false` vor Propagierung für alle drei Matches, `resultLocked: true` nur für das Quellspiel nach Propagierung, unverändert `false` für das noch nicht ausgetragene Halbfinale 2. Gesamt-API-Suite (12 Dateien, real gegen PostgreSQL 17, per-Datei-Lauf zur Vermeidung der bekannten Tunnel-Kontention): **170/170 grün** (169 aus Phase 14 + 1 neu).

**E2E:** neue Datei `tournament-match-result-ui.spec.ts` — treibt den **gesamten** Flow erstmals über die echte UI (nicht mehr den in Phase 14 dokumentierten API-Bootstrap-Workaround): KO-Baum mit 4 Teams + Spiel um Platz 3 über die reale Oberfläche anlegen, beide Halbfinal-Ergebnisse über das neue Formular eintragen, verifizieren dass (a) das Ergebnis inkl. Sperr-Hinweis erscheint, (b) das Formular danach verschwindet, (c) Finale und Spiel um Platz 3 automatisch mit den korrekten Gewinnern/Verlierern erscheinen. Dreimal in Folge real gegen PostgreSQL 17 ausgeführt (isoliert bzw. mit Retries) — zweimal sofort grün, einmal beim ersten Versuch an einem bekannten, bereits in Phase 13/14 dokumentierten Tunnel-Latenz-Schritt (Turnier-Erstellung, nicht Teil der neuen Logik) gescheitert, auf Wiederholung grün. Die eigentliche neue Logik (Ergebnis-Formular, Propagation, Sperre) war in allen drei Läufen fehlerfrei.

Die volle E2E-Suite (18 Spezifikationen) zeigte zusätzlich die bereits in Phase 13/14 dokumentierte, session-spezifische SSH-Tunnel-Latenz-Flakiness in zwei unveränderten Fremd-Dateien (siehe Abschnitt 8 „Umgebungsprobleme") — keine davon berührt Phase-15-Code.

## 4. PostgreSQL/VPS

PostgreSQL 17, temporärer Container `verevia-phase15-pg17-test` (eigenes Volume, `127.0.0.1`-only, Port 55434), sitzungsgebundener SSH-Key `verevia-phase15-result-ui-1788164890` (vom Nutzer bestätigt hinterlegt). Migration aus leerer DB: alle 13 Migrationen (unverändert aus Phase 14) sauber angewendet, 0 Diff. Seed zweimal → idempotent. DB-Integrationstests 122/122, API-Integrationstests 170/170, E2E real verifiziert. Vollständig aufgeräumt: Container/Volume entfernt (nur permanente `verevia-dev-*`/`verevia-traefik` verbleiben, `verevia-prod` nicht angetastet), Tunnel geschlossen, SSH-Key aus `authorized_keys` entfernt und per fehlgeschlagenem Reconnect-Versuch verifiziert, lokale Schlüssel-/`.env`-Dateien und Playwright-`test-results` gelöscht.

## 5. Migration

**Migration: Nein.** Wie im Auftrag erwartet baut Phase 15 vollständig auf dem bestehenden Phase-14-Modell auf (`resultPropagatedAt` existiert bereits) — keine neue Spalte, keine neue Tabelle. `prisma validate` grün, Schema unverändert gegenüber Phase 14 (per `git status`/`git diff` auf `schema.prisma` verifiziert: keine Änderung).

## 6. Bugs

**Gefundene Produktbugs:** keiner.

**Behobene Produktbugs:** keiner (kein bestehender Produktfehler in diesem Bereich gefunden — die Phase-14-Backend-Logik funktionierte beim ersten Integrationstest bereits korrekt).

**Testbugs (eigene, gefunden und behoben):**

- Zwei `tournament-detail.test.tsx`-Assertions (`getByText("SV Testhausen")`) trafen nach der neuen Zwei-`<span>`-Struktur (nötig, um den Gewinner fett hervorheben zu können) mehrdeutig zwei Elemente (Match-Zeile + Teilnehmerliste) — mit `within(...)`-Scoping auf die jeweilige Match-Zeile behoben.
- Eine Assertion in derselben Datei (`getByText(/E1 – SV Testhausen/)`) traf aus demselben Grund (Text über zwei `<span>`s verteilt) keine Testing-Library-`getNodeText`-Übereinstimmung mehr — auf `within(...).toHaveTextContent(...)` umgestellt.
- Eine eigene E2E-Locator-Strategie (ursprünglich ein über zwei `<span>`s spannender Regex für die Finale-/Platz-3-Zeile) wurde vor dem ersten Lauf bereits als unzuverlässig erkannt und durch verkettete `.filter({has: ...})`-Aufrufe (Schnittmenge zweier eindeutiger Team-Namen pro Zeile) ersetzt — kein tatsächlicher Testlauf-Fehlschlag, sondern beim Review der eigenen Locator-Logik vor der ersten Ausführung korrigiert.
- Im neuen Component-Test: native HTML5-Formularvalidierung (von jsdom implementiert) blockierte den `submit`-Event bereits VOR der eigenen JS-Validierung, sodass die erwartete deutsche Fehlermeldung bei einem negativen Wert nicht erschien — behoben durch `noValidate` auf dem Formular (siehe Abschnitt 2 „UX" — dies ist zugleich eine echte Produktverbesserung, nicht nur ein Test-Workaround: garantiert dieselbe, gestylte deutsche Fehlermeldung in jedem Browser statt browser-abhängiger nativer Validierungs-UI).
- Zwei Test-Assertions im neuen Component-Test erwarteten fälschlich das Label "Ergebnis bearbeiten" nach einem erfolgreichen Save, obwohl die (statische, in diesen Tests unveränderte) `hasExistingResult`-Prop weiterhin `false` war — auf das korrekte erwartete Label "Ergebnis eintragen" korrigiert, mit Kommentar, dass die echte App das Label über `revalidatePath` beim nächsten Server-Render aktualisiert.

**Bestehende Altlasten:** keine neu entdeckt.

**Umgebungsprobleme:** die bereits in Phase 13/14 dokumentierte, session-spezifische SSH-Tunnel-Latenz-Flakiness trat erneut auf — diesmal in `guardian-invitation.spec.ts` (auch nach 3 Wiederholungen an unterschiedlichen, inkonsistenten Stellen im Testablauf fehlgeschlagen — Phase-6-Funktionalität, von Phase 15 nicht berührt) und einmalig (auf Wiederholung grün) in `tournament-knockout.spec.ts`. Beide Dateien wurden in dieser Phase nicht verändert; die inkonsistente Fehlschlagstelle zwischen Wiederholungen ist das charakteristische Signal für ein Umgebungsproblem statt eines deterministischen Logikfehlers — bewusst nicht „stabilisiert" (keine Änderung an unveränderten, Phase-15-fremden Dateien vorgenommen), da dies außerhalb des Scopes läge und die eigentliche Ursache (Tunnel-Latenz) durch eine Testanpassung nicht behoben würde.

## 7. Regression

Keine. Vollständige bestehende Suite ausgeführt, kein Test gelöscht/geskippt/abgeschwächt. Turnier-/Schedule-/Knockout-/Slot-Resolution-Generatoren, Round-Robin, bestehende Football-Matches, Tenant-Isolation/RLS, Auth, Season-Permissions, bestehende Turnier-UI — alle unverändert grün (168 API-Unit-, 122 DB-Integrations-, 170 API-Integrations-, 131 Web-Tests insgesamt inkl. der neuen Phase-15-Tests; 16/18 E2E-Spezifikationen sofort grün, 2 vorbestehende Fremd-Dateien mit bekannter Umgebungs-Flakiness).

## 8. Quality Gates

`pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle 7 Pakete) grün. `prisma validate` grün, kein Drift. DB-/API-Integrationstests real gegen PostgreSQL 17 grün. E2E real verifiziert. `git status`/`git diff` vor dem Commit explizit auf Secrets/temporäre Dateien geprüft — sauber, keine `.env`, keine Testartefakte.

## 9. Risiken

Keine neuen. Die UI verhindert proaktiv den häufigsten 409-Fall (Formular verschwindet, sobald `resultLocked`), was das Risiko verwirrender Fehlermeldungen im Alltag deutlich reduziert — ein direkter API-Aufruf außerhalb der UI kann weiterhin (korrekt) mit 409 abgelehnt werden.

## 10. Technische Schulden

Keine neuen. Die aus Phase 13/14 bekannten (Scheduler ohne Backtracking, dupliziertes Tournament-Include zwischen Schedule-/Knockout-Service) bestehen unverändert fort — nicht Teil dieser Phase.

## 11. Bewusst nicht implementiert

Automatische Gruppenplatzierungsberechnung, neue GROUP_POSITION-Resolution-Engine, Elfmeterschießen, Verlängerung, Tiebreak-Regelwerk, Ergebnis-Rollback/Downstream-Reset, Änderung bereits propagierter Ergebnisse, Turnierbaum-Neudesign, Drag & Drop, Live Scores, WebSockets, Push Notifications, eine neue, zur Football-Match-API parallele Tournament-Result-API.

## 12. ADR

Keine neue ADR — Phase 15 trifft keine neue, langfristig relevante Architekturentscheidung. Die einzige potenziell ADR-würdige Entscheidung (welches Feld dem Client für die Sperr-Logik exponiert wird: `resultLocked: boolean` statt des rohen `resultPropagatedAt`-Zeitstempels) ist eine kleine, lokale API-Ergonomie-Entscheidung ohne strukturelle Tragweite und wird stattdessen hier im Bericht (Abschnitt 2) sowie im Code-Kommentar auf dem DTO-Feld selbst begründet. Referenziert: [ADR 0009](architecture/adr/0009-tenant-scoped-multi-statement-transactions.md), [ADR 0010](architecture/adr/0010-knockout-pending-match-slots.md), [ADR 0011](architecture/adr/0011-propagated-result-immutability.md) — alle unverändert weiterhin die maßgebliche Quelle für die zugrunde liegende Backend-Architektur.

## 13. Empfehlung für Phase 16

Wie im Auftrag vorgegeben: automatische Gruppenplatzierungsberechnung (Tabellen/Punkte/Tordifferenz) zur Auflösung der bislang unangetasteten `GROUP_POSITION`-Slots — der einzige verbleibende `MatchSlotSourceType`, für den nach Phase 15 weiterhin keine Auflösungslogik existiert.
