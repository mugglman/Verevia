# 0010 – Pending KO-Spielteilnehmer als eigenständige `TournamentMatchSlot`-Struktur

## Status

**ACCEPTED** (2026-08-30)

## Kontext

Phase 11 (ADR 0008) etabliert `FootballMatch`s Turniermatch-Modus: `tournamentId`+`homeParticipantId`+`awayParticipantId` müssen alle drei gesetzt sein, beide Teilnehmer sind konkrete, bereits existierende `TournamentParticipant`-Zeilen. Phase 12 baut darauf auf, ohne dieses Invariant anzutasten — der Round-Robin-Generator kennt beide Teilnehmer jeder Begegnung von Anfang an.

Phase 13 (Knockout-/Finalrunden-Generator) bricht diese Annahme grundlegend: ein KO-Spiel wie das Finale hat als Teilnehmerquelle typischerweise "Sieger Halbfinale 1" — zum Zeitpunkt der Spielplan-Erstellung ist schlicht noch nicht bekannt, WER das sein wird, weil Phase 13 ausdrücklich **keine** Live-Ergebnisverarbeitung/Gewinner-Auflösung enthält (Auftrag Abschnitt 28). Dasselbe gilt für Gruppenplatzierungs-Quellen ("Gruppe A, Platz 1") — Phase 13 enthält ebenfalls keine Tabellen-/Platzierungsberechnung, die "Platz 1" tatsächlich einem konkreten `TournamentParticipant` zuordnen könnte.

Damit haben die meisten KO-Spiele (alles außer Spielen, deren BEIDE Seiten direkte `TEAM`-Quellen sind) beim Commit schlicht keinen konkreten Teilnehmer für mindestens eine Seite. Der bestehende `FootballMatch`-Modus verlangt aber genau das — ein echter struktureller Konflikt, keine Kleinigkeit.

## Entscheidung

Zwei Änderungen, beide minimal:

1. **`football_match_mode_consistency` wird gelockert**: im Turniermatch-Modus dürfen `homeParticipantId`/`awayParticipantId` jetzt NULL sein (einzeln oder beide) — mit einer Einschränkung: sind BEIDE gesetzt, müssen sie weiterhin verschieden sein (kein Selbstspiel bleibt unmöglich). Der Vereinsmatch-Modus ist unverändert. Bereits bestehende Zeilen (Phase 11/12) sind davon nicht betroffen — sie hatten ohnehin schon beide Teilnehmer gesetzt.

2. **Neue, kleine Tabelle `TournamentMatchSlot`**: eine Zeile pro (Spiel, Seite), NUR für Seiten, deren Teilnehmer noch nicht bekannt ist. Beschreibt die Quelle explizit über `sourceType` (`GROUP_POSITION` | `WINNER_OF_MATCH` | `LOSER_OF_MATCH`) plus die jeweils passenden Zusatzfelder (`groupId`+`groupPosition` bzw. `sourceMatchId`). **`TEAM`-Quellen brauchen keine Zeile hier** — sie sind sofort auflösbar und werden direkt in `homeParticipantId`/`awayParticipantId` geschrieben, keine redundante Zusatzinformation.

Composite-FKs folgen exakt dem in ADR 0008 etablierten Muster: `matchId` und `sourceMatchId` referenzieren `football_match` jeweils über `(tenantId, tournamentId, X)` — dafür erhält `football_match` ein neues Drei-Spalten-Unique `(tenantId, tournamentId, id)` (funktioniert trotz nullable `tournamentId`, da Postgres NULL in Unique-Indizes paarweise als verschieden behandelt). Damit ist strukturell garantiert, dass ein Slot nur auf ein Spiel/Vorgängerspiel/Gruppe DESSELBEN Turniers verweisen kann — ohne Trigger.

Der eigentliche KO-Bracket (Fixture-Erzeugung, Abhängigkeitsgraph, Seeding, Scheduling) bleibt vollständig **rein und DB-frei** im Generator (`generator/knockout-*.ts`) — `TournamentMatchSlot` ist ausschließlich die Persistenz-Repräsentation des Ergebnisses, keine eigene Business-Logik-Schicht.

## Verworfene Alternativen

- **Zehn neue nullable Spalten direkt auf `FootballMatch`** (`homeSourceType`, `homeSourceGroupId`, `homeSourceGroupPosition`, `homeSourceMatchId` × 2 Seiten): verworfen — bläht die Kern-`FootballMatch`-Tabelle für einen Sonderfall auf, der nur einen Bruchteil der Zeilen betrifft (Vereinsmatches und Round-Robin-Matches haben NIE eine pending Seite). Eine dedizierte Tabelle hält `FootballMatch` schlank und macht "hat dieses Spiel eine offene Quelle" durch reine Anwesenheit einer zugehörigen Zeile beantwortbar, statt durch die Interpretation mehrerer NULL-Spalten-Kombinationen.
- **Platzhalter-`TournamentParticipant`-Zeilen** (z. B. ein externer Teilnehmer mit `externalName: "Sieger Halbfinale 1"`, direkt als `homeParticipantId` gesetzt): verworfen — überlädt `TournamentParticipant` mit einem Konzept, für das es nicht gedacht ist (ein Teilnehmer soll eine reale Mannschaft sein, kein abstrakter Platzhalter). Hätte außerdem ein Folgeproblem geschaffen: sobald ein späterer Ausbauschritt den echten Gewinner einträgt, müsste der Platzhalter-Teilnehmer wieder entfernt und durch den echten ersetzt werden — komplizierter und weniger explizit als ein eigener, klar benannter Slot-Datensatz.
- **`TeamSeasonId`/`opponentName`-artiges Freitext-Feld für die Quellbeschreibung** (z. B. ein String-Feld `pendingSourceDescription: "Sieger HF1"`): verworfen — nicht maschinenlesbar, keine referenzielle Integrität, keine Möglichkeit, die Abhängigkeit zum Vorgängerspiel strukturell (per FK) abzusichern. Genau die Art unstrukturierter Lösung, die der Auftrag ausdrücklich vermeiden will ("kein hardcodierten Sonderfälle", "sauberes Domainmodell").
- **Gar keine Persistenz der Quelle, nur das reine `FootballMatch` mit NULL-Teilnehmern**: verworfen — der Auftrag verlangt ausdrücklich, dass "die erzeugte Struktur diese Information nicht verlieren darf". Ohne eine strukturierte Quellenangabe wüsste ein künftiger Auflösungsschritt (z. B. Phase 14) nicht, WELCHES Vorgängerspiel oder welche Gruppenplatzierung ein NULL-Teilnehmer eigentlich erwartet.

## Konsequenzen

- Bestehender Code, der `FootballMatch.homeParticipantId`/`awayParticipantId` als im Turniermatch-Modus garantiert gesetzt voraussetzt (z. B. `MatchesService`/`TournamentScheduleService` aus Phase 11/12), muss für KO-Spiele einen NULL-Fall vertragen — betrifft ausschließlich NEUEN Phase-13-Code; Phase 11/12 selbst erzeugen weiterhin nur vollständig aufgelöste Matches und sind von der Lockerung nicht betroffen.
- Ein künftiger Auflösungsschritt (nicht Teil dieser Phase) müsste: nach Abschluss eines Quellspiels bzw. nach Berechnung einer Gruppenplatzierung die zugehörigen `TournamentMatchSlot`-Zeilen finden, den nun bekannten Teilnehmer in `homeParticipantId`/`awayParticipantId` des abhängigen Spiels eintragen und die (dann überflüssige) Slot-Zeile entfernen — eine klar umrissene, spätere Aufgabe, für die diese Struktur bereits alle nötigen Informationen bereithält.
- `MatchSlotSourceType` enthält bewusst kein `TEAM` — sollte ein künftiger Anwendungsfall doch eine explizite `TEAM`-Slot-Zeile brauchen (z. B. für eine UI, die "warum steht hier dieses Team" nachvollziehbar anzeigen will, auch für sofort aufgelöste Fälle), ist das eine rückwärtskompatible Erweiterung des Enums, kein Bruch.

## Bezug

- [0008 – Turnierspiele erweitern FootballMatch](./0008-tournament-match-model.md) (Composite-FK-Muster, Turniermatch-Modus-Grundlage)
- [0009 – Tenant-gebundene Mehrfach-Statement-Transaktionen](./0009-tenant-scoped-multi-statement-transactions.md) (Commit-Transaktionsmuster, hier wiederverwendet)
- [PHASE_13_TOURNAMENT_KNOCKOUT_GENERATOR_REPORT.md](../../PHASE_13_TOURNAMENT_KNOCKOUT_GENERATOR_REPORT.md)
