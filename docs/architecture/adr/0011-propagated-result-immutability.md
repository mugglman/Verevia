# 0011 – Bereits propagierte KO-Ergebnisse sind über die Ergebnis-API unveränderlich

## Status

**ACCEPTED** (2026-08-30)

## Kontext

Phase 14 löst nach Abschluss eines KO-Spiels automatisch alle davon abhängigen `TournamentMatchSlot`-Zeilen auf: der Sieger/Verlierer wird in `homeParticipantId`/`awayParticipantId` des Folgespiels geschrieben, die dann überflüssige Slot-Zeile wird gelöscht (siehe ADR 0010, Abschnitt "Konsequenzen" — dort bereits als künftiger Schritt angekündigt).

Damit entsteht ein neues, kritisches Problem: was passiert, wenn das Ergebnis eines bereits ausgewerteten Spiels NACHTRÄGLICH korrigiert wird?

```text
Halbfinale 1: Team A schlägt Team B 2:1
→ Finale.home = Team A (propagiert)
Später: Halbfinale 1 wird korrigiert auf Team B 3:2
```

Ohne Gegenmaßnahme stünde im Finale weiterhin Team A, obwohl das (korrigierte) Halbfinale 1 jetzt Team B gewonnen hätte — eine stille, für Nutzer unsichtbare Inkonsistenz.

Erschwerend: die `TournamentMatchSlot`-Zeile, die diese Abhängigkeit ursprünglich beschrieb, wird bei der Auflösung GELÖSCHT (siehe ADR 0010). Nach der Auflösung gibt es also keine strukturelle Spur mehr davon, WELCHES Folgespiel von diesem Quellspiel abhing — eine nachträgliche Korrektur könnte technisch nicht mehr sauber "rückgängig gemacht und neu berechnet" werden, ohne diese Information anderweitig zu rekonstruieren.

## Entscheidung

**Bereits propagierte Ergebnisse werden über die Ergebnis-API (`PATCH /football/matches/:id`) unveränderlich**, sobald sie mindestens einen abhängigen Slot aufgelöst haben.

Konkret: eine neue, minimale Spalte `FootballMatch.resultPropagatedAt DateTime?` wird beim ersten erfolgreichen Auflösen mindestens eines abhängigen Slots gesetzt (nie wieder zurückgesetzt). Sobald gesetzt, lehnt `MatchesService.updateTournamentMatch` jeden Versuch, `status`/`homeScore`/`awayScore` dieses Spiels zu ÄNDERN, mit `409 Conflict` und einer verständlichen deutschen Fehlermeldung ab — andere Felder (Spielstätte, Notizen, Gruppe) bleiben weiterhin frei editierbar. Ein Request, der exakt dieselben Werte erneut sendet (kein tatsächlicher Unterschied), wird NICHT abgelehnt — das ist keine Änderung, sondern eine harmlose, idempotente Wiederholung derselben Finalisierung.

Das entspricht wörtlich der im Auftrag als Option A vorgeschlagenen Regel: *"bereits propagierte Ergebnisse nicht mehr ändern"*.

Ein Spiel, dessen Ergebnis NIE einen abhängigen Slot aufgelöst hat (z. B. das Finale selbst — nichts hängt davon ab, oder ein Spiel, das zum Zeitpunkt der Finalisierung keine offenen Folgespiel-Abhängigkeiten hatte), bleibt für immer frei editierbar wie vor Phase 14 — `resultPropagatedAt` wird für solche Spiele nie gesetzt.

## Verworfene Alternativen

- **Option B — Downstream-Auflösung zurücksetzen und neu berechnen**: verworfen. Würde erfordern, nach einer Korrektur die ursprüngliche Abhängigkeitsbeziehung zu rekonstruieren — aber genau diese Information (die `TournamentMatchSlot`-Zeile) wurde bei der ersten Auflösung bereits gelöscht (ADR 0010). Eine Rekonstruktion wäre nur durch zusätzliche, dauerhaft gespeicherte Herkunftsinformation möglich (z. B. Slot-Zeilen nicht löschen, sondern nur als "aufgelöst" markieren, oder eine separate Audit-Tabelle) — eine deutlich größere Schemaänderung für einen Korrekturfall, der in der Praxis selten ist (ein falsch eingetragenes KO-Ergebnis, das bereits weiterverarbeitet wurde). Zusätzlich müsste eine kaskadierende Neuberechnung über mehrere Runden hinweg (Halbfinale → Finale → ggf. bereits wieder propagiertes Finale) korrekt und atomar rückgängig gemacht werden — signifikant höhere Komplexität ohne klaren Mehrwert für den MVP.
- **Option C — Änderung nur zulassen, solange das abhängige Spiel noch nicht begonnen hat**: verworfen als alleinige Regel, weil `MatchStatus` keinen "läuft gerade"-Zustand kennt (nur SCHEDULED/POSTPONED/CANCELLED/COMPLETED, siehe Datenmodell-Analyse in Phase 14 Abschnitt 4) — "begonnen" lässt sich am bestehenden Schema nicht präzise feststellen. Eine Annäherung über "Folgespiel ist noch SCHEDULED" wäre möglich, führt aber in denselben Rekonstruktionsbedarf wie Option B, sobald das Folgespiel selbst schon weiter propagiert hat. Der in dieser Phase gewählte, einfachere Ansatz (Option A) vermeidet dieses Problem vollständig, indem er die Frage "ist es noch sicher zu ändern" gar nicht erst beantworten muss.
- **Keine Sperre, letzter Schreibvorgang gewinnt**: verworfen — würde genau die stille Inkonsistenz erzeugen, die dieser ADR verhindern soll (Auftrag: "Keine stillen Inkonsistenzen").

## Konsequenzen

- Ein fälschlich eingetragenes KO-Ergebnis, das bereits propagiert hat, kann über die reguläre Ergebnis-API NICHT mehr korrigiert werden — die einzige Abhilfe wäre ein direkter, administrativer Eingriff auf Datenbankebene (kein Teil dieser Phase, bewusst nicht über die API angeboten, um versehentliche stille Inkonsistenzen zu verhindern).
- Diese Einschränkung betrifft ausschließlich Turnierspiele mit tatsächlich abhängigen Folgespielen — Vereinsmatches (Phase 10) sind von `resultPropagatedAt` nie betroffen (das Feld wird für sie nie gesetzt) und bleiben wie bisher jederzeit editierbar.
- Ein künftiger, expliziter "Ergebnis-Korrektur"-Workflow (z. B. mit Freigabe durch TENANT_ADMIN, vollständiger Kaskaden-Neuberechnung) ist eine denkbare spätere Erweiterung, aber nicht Teil dieser Phase — siehe Phase-14-Bericht, "empfohlener nächster Schritt".

## Bezug

- [0008 – Turnierspiele erweitern FootballMatch](./0008-tournament-match-model.md)
- [0009 – Tenant-gebundene Mehrfach-Statement-Transaktionen](./0009-tenant-scoped-multi-statement-transactions.md) (Row-Lock-Muster, hier wiederverwendet)
- [0010 – Pending KO-Spielteilnehmer als TournamentMatchSlot](./0010-knockout-pending-match-slots.md)
- [PHASE_14_TOURNAMENT_MATCH_SLOT_RESOLUTION_REPORT.md](../../PHASE_14_TOURNAMENT_MATCH_SLOT_RESOLUTION_REPORT.md)
