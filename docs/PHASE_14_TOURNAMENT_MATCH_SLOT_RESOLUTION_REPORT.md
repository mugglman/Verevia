# Phase 14 – Tournament Match Slot Resolution

## 1. Zusammenfassung

Nach Abschluss eines KO-Spiels werden abhängige `TournamentMatchSlot`-Einträge jetzt automatisch aufgelöst: der Sieger/Verlierer wird in `homeParticipantId`/`awayParticipantId` des Folgespiels geschrieben, der überflüssige Slot-Datensatz gelöscht. Kein neuer Endpoint — die Auflösung folgt serverseitig aus der bestehenden Ergebnis-API (`PATCH /football/matches/:id`). Bereits propagierte Ergebnisse werden über diese API unveränderlich (ADR 0011). Ein echter, reproduzierbarer Produktbug wurde gefunden und behoben (mehrdeutige Sieger-Labels ohne Rundenbezug, siehe Abschnitt 37/38).

## 2. Ausgangslage

Verifiziert vor Beginn (nicht blind übernommen): `git status` sauber, Branch `feat/tournament-knockout-generator`, PR #17 offen/grün/mergeable/konfliktfrei. PR #17 gesquasht gemergt (Merge-SHA `a730d2f`), lokal `main` aktualisiert und per `git log` bestätigt. Branch `feat/tournament-match-slot-resolution` von `a730d2f` erstellt und verifiziert.

## 3. Ziel

Siehe Abschnitt 1 — vollständige Umsetzung des im Auftrag beschriebenen Ziels, inklusive Finale, Spiel um Platz 3, 8-Team-Kaskade, BYE-Kompatibilität, Unentschieden-Grenze, Ergebnisänderungs-Regel, Idempotenz, Transaktionen/Locking, Race-Conditions, RLS/Berechtigungen.

## 4. Analyse der bestehenden Ergebnisarchitektur

Vor jeder Implementierung real im Code verifiziert (nicht angenommen):

- **Ergebnisspeicherung**: `FootballMatch.status: MatchStatus` (SCHEDULED/POSTPONED/CANCELLED/COMPLETED — **kein IN_PROGRESS**) + `homeScore`/`awayScore: Int?`. DB-CHECK `football_match_score_requires_completed` erzwingt: Score nur bei COMPLETED.
- **Kein Verlängerungs-/Elfmeter-/Tiebreak-Konzept** existiert irgendwo im Schema — ein Unentschieden bei COMPLETED ist schema-legal, aber ohne feststellbaren Sieger.
- **Finalisierung = generisches PATCH**: `MatchesController.update` → `MatchesService.update` → `updateTournamentMatch` (Turniermatch-Zweig) — ein einzelner, bislang transaktionsloser `footballMatch.update()`-Aufruf. Kein separater "Finalisieren"-Endpunkt, keine Sonderlogik für den Übergang zu COMPLETED.
- **Berechtigung**: `canOnSeason(assignments, "update", tournament.departmentId)` — TENANT_ADMIN immer, DEPARTMENT_ADMIN der eigenen Abteilung. Identisch zum bereits in Phase 13 verwendeten Muster.
- **Keine Transaktion/Lock** im bestehenden Update-Pfad — aber das etablierte `withTenantTransaction`-Muster (ADR 0009) aus Phase 12/13 ist direkt wiederverwendbar.
- **`TournamentMatchSlot`** vollständig aus Phase 13 vorhanden und korrekt befüllt — ADR 0010 kündigt die Auflösung bereits fast wörtlich als künftigen Schritt an.
- **Keine parallele/doppelte Ergebnisarchitektur** existiert — echtes Neuland innerhalb der bestehenden Struktur, kein Konflikt mit etwas Bestehendem.

## 5. Architekturentscheidung

Wiederverwendung der bestehenden Ergebnis-API statt eines neuen Endpoints (Auftrag Abschnitt 22: kein `POST /resolve-knockout-slot`). Trennung in eine reine Domain-Schicht (`knockout-slot-resolution.ts`: Sieger/Verlierer-Bestimmung, Auflösungsplan) und eine Infrastruktur-Schicht (`MatchesService`: Transaktion, Locking, Persistierung) — identisches Muster zu Phase 12/13.

## 6. Domainmodell

Zwei pure Funktionen in `apps/api/src/football/tournaments/schedule/generator/knockout-slot-resolution.ts`:

- `determineMatchOutcome(match)`: liefert `{winnerParticipantId, loserParticipantId}` oder `null`, wenn Status ≠ COMPLETED, ein Score fehlt, ein Teilnehmer noch unbekannt ist, oder die Scores gleich sind (Unentschieden).
- `planSlotResolutions(outcome, pendingSlots)`: bildet jeden abhängigen Slot (nur `WINNER_OF_MATCH`/`LOSER_OF_MATCH` — `GROUP_POSITION` wird hier nie übergeben) auf den passenden Teilnehmer ab.

12 Unit-Tests, vollständig DB-frei.

## 7. TournamentMatchSlot Resolution

`MatchesService.resolveDependentSlots(txDb, match)`: nach erfolgreichem `COMPLETED`-Update prüft `determineMatchOutcome`; bei eindeutigem Ergebnis werden alle `TournamentMatchSlot`-Zeilen mit `sourceMatchId = match.id` geladen, aufgelöst, die Zielspiele aktualisiert, die Slot-Zeilen gelöscht, `resultPropagatedAt` gesetzt. Kein Endpoint-seitiger Client-Input für `winnerTeamId`/`loserTeamId` — der Server leitet beides ausschließlich aus dem gespeicherten Ergebnis ab.

## 8. WinnerOfMatch

Vollständig unterstützt — siehe Beispiel im Auftrag, per API-Integrationstest bewiesen (`finalizing SF1 resolves the Final's HOME slot`).

## 9. LoserOfMatch

Vollständig unterstützt, dieselbe Pipeline wie WinnerOfMatch (`sourceType` steuert nur, welches Feld aus `outcome` gelesen wird) — per Spiel-um-Platz-3-Test bewiesen.

## 10. Finale

4-Team-Bracket: Reihenfolge der Ergebnis-Eingabe spielt nachweislich keine Rolle — per Test sowohl SF1→SF2 als auch SF2→SF1 verifiziert, beide führen zum identischen Endzustand.

## 11. Spiel um Platz 3

Beide Halbfinal-Verlierer werden automatisch in das (separat generierte) Platz-3-Spiel eingesetzt — keine separate manuelle Logik, dieselbe `resolveDependentSlots`-Pipeline wie das Finale.

## 12. 8-Team-Kaskade

Viertelfinale → Halbfinale → Finale vollständig per Test bewiesen (`Slot resolution — 8-team cascade`): alle vier Viertelfinal-Ergebnisse lösen beide Halbfinal-Slots auf, beide Halbfinal-Ergebnisse lösen das Finale auf — am Ende keine einzige verbleibende `TournamentMatchSlot`-Zeile im gesamten Turnier.

## 13. BYEs

Keine zweite BYE-Mechanik gebaut. Wie in Phase 13 etabliert: ein BYE erzeugt nie ein `FootballMatch` und nie einen Slot — die Quelle wird bereits beim Bracket-Generieren direkt in die nächste Runde durchgereicht. Phase 14 verarbeitet ausschließlich echte, persistierte Spielergebnisse und deren Abhängigkeiten — für BYE-Fälle bleibt nichts zusätzlich zu tun, verifiziert durch Wiederverwendung der bereits bestehenden Phase-13-Generator-Tests (unverändert grün).

## 14. Unentschieden/Tiebreak

Bewusste, dokumentierte Grenze: `determineMatchOutcome` liefert bei gleichen Scores `null` — kein Slot wird aufgelöst, `resultPropagatedAt` bleibt `null`. Kein Verlängerungs-/Elfmeterschießen-/Tiebreak-System gebaut (Auftrag Abschnitt 13 explizit: "Baue nicht nebenbei ein komplettes Elfmeterschießen-System"). Per Unit- und Integrationstest bewiesen (`a draw does not resolve any dependent slot`).

## 15. Ergebnisänderungen

Siehe [ADR 0011](architecture/adr/0011-propagated-result-immutability.md) für die vollständige Begründung. Gewählte MVP-Regel (Option A aus dem Auftrag): ein Spiel, dessen Ergebnis bereits mindestens einen Slot aufgelöst hat (`resultPropagatedAt` gesetzt), kann `status`/`homeScore`/`awayScore` über die API nicht mehr ändern — `409 Conflict` mit verständlicher deutscher Meldung. Andere Felder (Spielstätte, Notizen, Gruppe) bleiben editierbar. Ein Spiel ohne Abhängige (z. B. das Finale selbst) bleibt für immer frei korrigierbar. Verworfene Alternativen (Downstream zurücksetzen/neu berechnen; "nur wenn Folgespiel nicht begonnen") ausführlich im ADR begründet — beide verlangen strukturelle Information, die nach dem Löschen der Slot-Zeile nicht mehr vorhanden ist.

## 16. Idempotenz

Ein Spiel zweimal identisch finalisieren führt zu identischem DB-Zustand — bewiesen durch dedizierten DB- und API-Test. Funktioniert by construction: nach der ersten Auflösung existieren keine passenden Slot-Zeilen mehr, ein zweiter Durchlauf findet nichts zu tun.

## 17. Transaktionen

`withTenantTransaction` (ADR 0009) umschließt Ergebnis-Update und Slot-Auflösung atomar — kein Zwischenzustand "Ergebnis gespeichert, Slot nicht aktualisiert" möglich. Bewiesen durch einen dedizierten Rollback-Test (absichtlicher Constraint-Verstoß mitten in der Auflösung → weder das Ergebnis noch die Slot-Änderung bleiben bestehen).

## 18. Locking

`SELECT ... FOR UPDATE` auf die Quellspiel-Zeile (serialisiert konkurrierende Finalisierungen desselben Spiels) und zusätzlich auf jede betroffene Zielspiel-Zeile vor dem Schreiben (verhindert Lost Updates, wenn zwei Halbfinals gleichzeitig in verschiedene Seiten desselben Finalspiels schreiben) — dasselbe Row-Lock-Muster wie Phase 12/13.

## 19. Race Conditions

Alle im Auftrag genannten Fälle real gegen PostgreSQL 17 getestet: (a) zwei gleichzeitige identische Finalisierungen desselben Spiels — serialisiert, konsistent, keine Duplikate; (b) zwei verschiedene Halbfinals gleichzeitig finalisiert — beide Final-Seiten korrekt gesetzt; (c) Ergebnisänderung nach Propagierung — 409, kein Seiteneffekt.

## 20. RLS

Keine neue RLS-Policy nötig — `resultPropagatedAt` ist eine Spalte der bereits RLS-geschützten `football_match`-Tabelle.

## 21. Tenant Isolation

Per DB- und API-Test bewiesen: Tenant B kann Tenant As Spiele weder sehen noch auflösen (404 über die tenant-gebundene API, `null`/Fehler über den tenant-gebundenen Prisma-Client). Manipulierte IDs (`sourceMatchId`, `matchId`) bleiben strukturell durch die bestehenden Composite-FKs (ADR 0008/0010) auf dasselbe Turnier/denselben Tenant beschränkt — unverändert aus Phase 13.

## 22. Berechtigungen

Wiederverwendet, keine neue Rolle: `TENANT_ADMIN` immer, `DEPARTMENT_ADMIN` der eigenen Abteilung — identisch zum bestehenden Ergebnis-Update-Recht (nicht dem KO-Generator-Recht, wie im Auftrag ausdrücklich angemahnt — beide sind hier zufällig identisch, aber bewusst über den bestehenden `MatchesService`-Pfad geprüft, nicht neu erfunden). `COACH` kann ein Turniermatch weiterhin nicht finalisieren (403) — per Test bestätigt, keine neue Privilege Escalation durch die Slot-Auflösung.

## 23. API

Kein neuer Endpoint. `PATCH /api/v1/football/matches/:id` löst die Auflösung als Seiteneffekt einer Statusänderung auf `COMPLETED` aus.

## 24. Web-UI

Keine neue Seite gebaut. Die bestehende Turnierdetailseite (`/fussball/turniere/:id`) zeigt automatisch den aufgelösten Teilnehmernamen, sobald `MatchesService.toDto` ihn liefert — dieselbe, bereits vorhandene Server-Rendering-/Revalidierungs-Logik wie zuvor, keine neue Client-Komponente nötig (Auftrag Abschnitt 23: "Wenn bestehende Revalidation/Refresh-Mechanismen bereits reichen: keine unnötige neue UI bauen").

## 25. UX

Der Phase-13-Bug (mehrdeutige "Sieger Halbfinale"-Labels) ist strukturell ausgeschlossen: Phase 14 arbeitet direkt mit `TournamentParticipant`-IDs und schreibt den ECHTEN Teamnamen, keine erneute Label-Generierung nötig. Zusätzlich wurde die bereits in Phase 13 dokumentierte Lücke behoben — ein noch offener KO-Slot zeigte zuvor gar keinen Text an; jetzt ein ehrlicher Platzhalter ("Sieger (steht noch nicht fest)" / "Verlierer (steht noch nicht fest)" / "Gruppe X, Platz N") statt Leerraum. Bewusst NICHT rundenbezogen ("Sieger Halbfinale 1") — die Runde ist nach dem Commit nirgends persistiert, eine Rekonstruktion wäre zusätzliche, für Phase 14 nicht notwendige Infrastruktur (siehe Abschnitt 42).

## 26. Datenbankschema

Geprüft, ob `TournamentMatchSlot` bereits ausreicht — nein: ohne ein durables Signal auf `FootballMatch` selbst lässt sich nach dem Löschen der Slot-Zeile nicht mehr feststellen, ob ein Ergebnis bereits propagiert hat (Voraussetzung für Abschnitt 15). Eine einzige neue, minimale, nullable Spalte: `FootballMatch.resultPropagatedAt DateTime?`. Keine neue Tabelle.

## 27. Migrationen

Eine neue Migration (`20260830220502_add_football_match_result_propagation`) — reines `ALTER TABLE ... ADD COLUMN`, keine neue RLS-Policy nötig (bestehende `football_match`-Policy deckt die Spalte automatisch ab). Real aus leerer PostgreSQL-17-Instanz verifiziert: alle 13 Migrationen (12 aus Phase 1–13 + diese) wenden sich sauber an, `prisma migrate status` bestätigt "up to date", `prisma migrate diff` gegen die live migrierte DB liefert 0 Diff.

## 28. Unit-Tests

12 Tests für die reine Domain-Schicht (`determineMatchOutcome`/`planSlotResolutions`) — Sieger/Verlierer-Bestimmung (Heim- und Auswärtssieg), Unentschieden, nicht abgeschlossenes Spiel (alle drei Nicht-COMPLETED-Status einzeln), fehlender Score, fehlender/unbekannter Teilnehmer (einzeln und beide), WinnerOfMatch-Auflösung, LoserOfMatch-Auflösung, mehrere gleichzeitige Abhängigkeiten aus demselben Ergebnis, keine Abhängigkeiten, Determinismus. Gesamt `apps/api`-Unit-Suite: **168/168 grün**.

## 29. DB-Tests

Neu (`tournament-match-slot-resolution.integration.spec.ts`, real gegen PostgreSQL 17): Spaltenverhalten (NULL-Default, gesetzt nach Auflösung, bleibt NULL ohne Abhängige), Atomarität (Erfolg, Unentschieden, Idempotenz-Wiederholung, Rollback bei Constraint-Verstoß mitten in der Auflösung), Concurrency (zwei verschiedene Halbfinals gleichzeitig, zwei identische Finalisierungen gleichzeitig), RLS/Tenant-Isolation. Ein echter Fehler in einem eigenen Testhelfer gefunden und behoben (siehe Abschnitt 37). Gesamt-DB-Suite: **122/122 grün**.

## 30. API-Tests

Neu (`tournament-match-slot-resolution.integration-spec.ts`, 15 Tests, real gegen PostgreSQL 17): WinnerOfMatch (4-Team), LoserOfMatch/Platz-3, 8-Team-Kaskade, Unentschieden, Idempotenz, Ergebnisänderung (409) und weiterhin editierbare Nebenfelder, frei korrigierbares Ergebnis ohne Abhängige, Concurrency (unterschiedliche und identische gleichzeitige Finalisierungen), Berechtigungen (fremde Abteilung, COACH), Cross-Tenant. Zwei eigene Testfehler gefunden und behoben (siehe Abschnitt 37). Gesamt-API-Suite: **169/169 grün** (per-Datei-Lauf, siehe Abschnitt 33 zur Tunnel-Kontention-Mitigation).

## 31. Web-Tests

Keine Web-Komponente geändert — der Pending-Label-Fix lebt vollständig serverseitig in `MatchesService.toDto`. Bestehende Web-Suite unverändert grün: **116/116**.

## 32. E2E

Neu (`tournament-match-slot-resolution.spec.ts`): TENANT_ADMIN baut einen KO-Baum über die reale UI (identischer Flow wie `tournament-knockout.spec.ts`), finalisiert danach das erste Halbfinale. Da noch keine Turniermatch-Ergebnis-Eingabe-UI existiert (`match-detail.tsx` unterstützt bislang nur Vereinsmatches) und eine solche nur für diesen Test zu bauen genau die im Auftrag verbotene Art von Scope Creep wäre, wird das Ergebnis über einen direkten, sitzungsauthentifizierten API-Aufruf gesetzt (`page.request.patch`, exakt dasselbe bereits etablierte Muster wie in `guardian-invitation.spec.ts` für einen Schritt ohne UI-Äquivalent) — alle anderen Schritte laufen über den echten Browser. Nach dem Ergebnis-Aufruf zeigt die Turnierdetailseite den echten Gewinnernamen im Finale, der zuvor offene Platzhalter verschwindet für diese Seite. Zwei eigene Testfehler gefunden und behoben (siehe Abschnitt 37).

## 33. PostgreSQL-17-Verifikation

Real durchgeführt. Temporärer PostgreSQL-17-Container (`verevia-phase14-pg17-test`, eigenes Volume, `127.0.0.1`-only, Port 55433), per SSH-Tunnel erreichbar gemacht (sitzungsgebundener Key `verevia-phase14-slot-resolution-1788128465`, vom Nutzer bestätigt hinterlegt). Ablauf:

1. `prisma migrate deploy` aus leerer DB: alle 13 Migrationen sauber angewendet.
2. `prisma migrate status` → "up to date"; `prisma migrate diff` → 0 Diff.
3. Seed zweimal → idempotent (identische IDs für alle drei Turniere).
4. DB-Integrationstests: **122/122 grün**.
5. API-Integrationstests: **169/169 grün** (Vollparallel-Lauf zeigte erneut die aus Phase 13 bekannte SSH-Tunnel-Kontentions-Flakiness bei 10 Tests in einer unveränderten Datei — per isoliertem Einzeldatei-Lauf als reines Umgebungsartefakt bestätigt, danach per-Datei-Lauf durchgehend grün).
6. `apps/api`/`apps/web` produktiv gebaut und lokal gestartet, gegen den Tunnel-Testcontainer.
7. Playwright-E2E: `tournament-match-slot-resolution.spec.ts` viermal in Folge ausgeführt (isoliert bzw. mit Retries), alle vier letztlich grün — Fehlschläge traten ausschließlich bei den bekannten, bereits in Phase 13 dokumentierten Latenz-sensiblen Post-Submit-Navigationsschritten auf, nicht bei der eigentlichen Phase-14-Logik. Die volle Suite zeigte an diesem Tag erneut breiter verteilte Tunnel-Latenz (auch in unveränderten Fremd-Dateien wie `guardian-invitation.spec.ts`/`role-management.spec.ts`) — bestätigt als Fortsetzung des bereits in Phase 13 beobachteten, session-spezifischen Infrastrukturmerkmals, kein Phase-14-Befund.
8. Vollständig aufgeräumt (siehe Abschnitt 35).

## 34. VPS-Ressourcen

Ausschließlich der temporäre Container/Volume/Tunnel/Key oben — `verevia-dev-*`/`verevia-traefik` unverändert, `verevia-prod` existiert weiterhin nicht/wurde nicht angetastet.

## 35. VPS-Cleanup

Lokale `api`/`web`-Prozesse beendet, temporärer Container und Volume entfernt (verifiziert: nur die permanenten Container verbleiben), SSH-Tunnel geschlossen, temporärer SSH-Key aus `authorized_keys` entfernt und per fehlschlagendem erneuten Verbindungsversuch mit demselben privaten Schlüssel verifiziert ("Permission denied"), lokale Schlüssel-/`.env`-Dateien und Playwright-`test-results`-Verzeichnis gelöscht.

## 36. Security/Secrets

Keine Secrets committet — vor dem Commit `git status`/`git diff` explizit auf `.env`/`.pem`/`.key`/Tokens/Passwörter/DB-Dumps geprüft (siehe Abschnitt 40).

## 37. Gefundene Bugs

- **Eigener Testfehler (DB-Ebene)**: der handgeschriebene Test-Helfer `finalizeAndResolve` in `tournament-match-slot-resolution.integration.spec.ts` prüfte anfangs nicht auf ein Unentschieden — anders als der echte, bereits korrekt getestete `MatchesService`-Code. Reproduziert (Test schlug real gegen PostgreSQL 17 fehl), Ursache bestimmt, im Testhelfer behoben, danach grün.
- **Eigener Testfehler (API-Ebene, 3×)**: falsche Annahme über die 4-Team-Standard-Setzung — angenommen SF-2 = seed2 vs. seed4, tatsächlich (verifiziert direkt im Generator-Code, `computeSeedOrder(4) = [1,4,2,3]`) SF-2 = seed2 vs. seed3. Betraf die "beide Halbfinals"-, "Platz 3"- und Concurrency-Tests. Behoben, danach alle grün.
- **Eigener Testfehler (E2E)**: `page.locator("p.font-medium", { hasText: teamNames[0] })` traf zwei Elemente (die Halbfinal-Zeile selbst UND die Finale-Zeile, da beide den Gewinnernamen als Teilstring enthalten) — ein Playwright-Strict-Mode-Verstoß, der durch die generische Reload-Retry-Fehlerbehandlung als irreführendes "Element nicht sichtbar" maskiert wurde. Durch Prüfung des tatsächlichen Seitenzustands (Playwright-Error-Context-Snapshot) diagnostiziert, Locator auf die eindeutig identifizierbare Finale-Zeile eingegrenzt, danach reproduzierbar grün.
- **Echter Produktbug**: keiner in Phase 14 selbst gefunden (die Slot-Resolution-Logik war beim ersten Testlauf bereits korrekt) — der einzige Produktbug dieser Phase betrifft die Phase-13-Altlast unten.

## 38. Behobene Bugs

- **Phase-13-Altlast (Pending-Label-Lücke)**: die generische Spieleliste zeigte für eine noch nicht aufgelöste KO-Seite gar keinen Text an (bereits im Phase-13-Bericht als bekannte Lücke dokumentiert). Behoben als Teil dieser Phase — `MatchesService.toDto` liefert jetzt einen verständlichen Platzhalter (`slotsAsOwner`-Relation, keine zusätzliche Query).

## 39. Regressionen

Keine. Vollständige bestehende Suite ausgeführt, kein Test gelöscht/geskippt/abgeschwächt. Phase 11/12/13 unverändert grün (168 API-Unit-, 122 DB-Integrations-, 169 API-Integrations-, 116 Web-Tests insgesamt inkl. der neuen Phase-14-Tests).

## 40. Quality Gates

`pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` (alle 7 Pakete) grün. `prisma validate` grün. Migration aus leerer DB (1 neue Migration, 0 Drift) real verifiziert. `markdownlint-cli2` auf allen neuen/geänderten Markdown-Dateien grün (ein fehlendes Fenced-Code-Language-Tag im ADR gefunden und behoben). `git status`/`git diff` vor dem Commit explizit auf Secrets/temporäre Dateien geprüft — sauber.

## 41. Risiken

- Ein fälschlich eingetragenes, bereits propagiertes KO-Ergebnis kann über die API nicht mehr korrigiert werden (ADR 0011, bewusste Entscheidung) — einzige Abhilfe wäre ein administrativer DB-Eingriff, nicht Teil dieser Phase.
- Die volle Playwright-E2E-Suite bleibt unter dem SSH-getunnelten Testaufbau sichtbar latenzempfindlich (Fortsetzung der bereits in Phase 13 dokumentierten Beobachtung) — reines Infrastrukturmerkmal, kein Produktrisiko.

## 42. Technische Schulden

- Pending-KO-Seiten zeigen einen generischen ("Sieger (steht noch nicht fest)"), nicht rundenbezogenen Platzhalter in der committeten Ansicht — die Runde ist nach dem Commit nicht persistiert (bewusste Phase-13-Entscheidung). Eine rundenbezogene Anzeige wäre ein sinnvoller, aber eigenständiger künftiger Ausbauschritt.
- Aus Phase 13 unverändert fortbestehend: Scheduler ohne Backtracking, dupliziertes Tournament-Include zwischen Schedule-/Knockout-Service — beide bewusst nicht angefasst (nicht unmittelbar relevant für Phase 14, siehe Auftrag Abschnitt 35).

## 43. Bewusst nicht implementiert

Live-Ergebnis-Tracking, automatische Tabellen-/Gruppenplatzierungs-Neuberechnung (GROUP_POSITION-Slots bleiben unangetastet — es existiert weiterhin keine Tabellenberechnung), vollständiges Verlängerungs-/Elfmeterschießen-System, Downstream-Reset-und-Neuberechnung nach Ergebnisänderung, Double Elimination, Swiss System, WebSockets/Notifications/Event Bus/Background Worker, neuer Ergebnis-Endpoint, rundenbezogene Pending-Labels in der committeten Ansicht (siehe Abschnitt 42), dedizierte Turniermatch-Ergebnis-Eingabe-UI (die generische Match-PATCH-API bleibt der einzige Weg, ein Turnierergebnis einzutragen — `match-detail.tsx` unterstützt weiterhin nur Vereinsmatches).

## 44. Empfohlener nächster Schritt

Eine dedizierte Turniermatch-Ergebnis-Eingabe-UI (analog zu `match-detail.tsx`, aber teilnehmer- statt gegnername-basiert) würde den in Abschnitt 32/43 dokumentierten Bootstrap-Workaround (direkter API-Aufruf im E2E-Test) überflüssig machen und wäre der natürliche nächste UI-Ausbauschritt. Automatische Gruppenplatzierungsberechnung (Tabellen/Punkte/Tordifferenz) würde zusätzlich die verbleibenden `GROUP_POSITION`-Slots auflösbar machen — bislang bewusst nicht Teil der Turnier-Architektur.
