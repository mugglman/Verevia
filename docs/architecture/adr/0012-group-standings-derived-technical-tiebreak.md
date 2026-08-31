# 0012 – Gruppentabellen sind abgeleitete Daten; technische Deterministik entscheidet nie einen sportlichen Gleichstand

## Status

**ACCEPTED** (2026-08-31)

## Kontext

Phase 16 führt die automatische Berechnung von Gruppentabellen aus abgeschlossenen Gruppenspielen ein und nutzt diese Tabelle, um bestehende `GROUP_POSITION`-Slots (ADR 0010) automatisch aufzulösen. Zwei grundsätzliche Architekturfragen mussten dabei entschieden werden:

1. **Wo lebt der "Wahrheitszustand" einer Gruppentabelle?** Sie ließe sich entweder aus den Spielergebnissen bei jedem Lesezugriff neu berechnen, oder als eigene Tabelle (`TournamentGroupStanding` o. Ä.) persistiert und bei jedem Ergebnis inkrementell fortgeschrieben werden.
2. **Wie wird ein sportlicher Gleichstand (identische Punkte, Tordifferenz, Tore) behandelt, wenn ein `GROUP_POSITION`-Slot genau diese Platzierung braucht?** Ohne zusätzliche Regel bräuchte jede Implementierung IRGENDEIN Kriterium, um zwei exakt gleich stehende Teams in eine Reihenfolge zu bringen — und jedes technische Kriterium (z. B. Teilnehmer-ID) wäre bezogen auf den Sport willkürlich.

Der Arbeitsauftrag verlangt explizit: Gruppentabellen bevorzugt als abgeleitete Daten ohne neue persistierte "Wahrheit" (Abschnitt 22), und dass eine rein technische Deterministik NIEMALS heimlich einen sportlich echten Gleichstand entscheiden darf (Abschnitt 6) — ein `GROUP_POSITION`-Slot muss in diesem Fall offen bleiben, nicht geraten werden.

## Entscheidung

**Gruppentabellen werden bei jedem Lesezugriff live aus den vorhandenen Spieldaten berechnet (`computeGroupStandings`, reine Funktion ohne DB-Zugriff) und nirgends persistiert.** `TournamentGroupsService.list()` lädt pro Aufruf alle Teilnehmer und Spiele des Turniers in zwei Abfragen (keine N+1-Abfrage pro Gruppe) und berechnet die Tabelle jeder Gruppe im Speicher. Es gibt keine neue Migration, keine neue Tabelle, keine zweite "Wahrheit" neben `FootballMatch`.

**Rangfolge:** Punkte absteigend → Tordifferenz absteigend → erzielte Tore absteigend → Teilnehmer-ID aufsteigend (rein technisch). Jede Zeile bekommt zusätzlich `tiedRankGroupSize`: die Größe des "Gleichstand-Blocks", dem diese Zeile nach den drei sportlichen Kriterien angehört. `tiedRankGroupSize > 1` heißt: dieser Rang ist NUR durch das technische ID-Kriterium eindeutig, sportlich sind mehrere Teams gleich platziert.

**`resolveParticipantAtPosition`** — die Brücke zwischen Tabelle und `GROUP_POSITION`-Auflösung — liefert für eine Position `null` zurück, sobald deren Zeile `tiedRankGroupSize > 1` hat, exakt wie für eine nicht existierende Position. Ein Aufrufer kann (und muss) diese beiden Fälle nicht unterscheiden: in beiden ist "diese Position sicher automatisch auflösen" nicht möglich. `planGroupPositionResolutions` lässt betroffene Slots dadurch einfach unangetastet offen — kein Fehler, keine Sonderbehandlung, die Gruppe bleibt in der UI weiterhin als Zwischenstand erkennbar (Sternchen-Markierung, siehe Web-UI).

Die Vollständigkeitsprüfung einer Gruppe (`isComplete`, ADR-intern `resolveGroupPositionSlots`) sperrt beim letzten Spielergebnis einer Gruppe deterministisch ALLE Spiele dieser Gruppe in Zeilen-ID-Reihenfolge (`ORDER BY id FOR UPDATE`) — dieselbe Technik, mit der ADR 0009 bereits Deadlocks bei Mehrfach-Locks vermeidet — bevor sie neu prüft, ob wirklich jedes Spiel `COMPLETED` ist. Das macht das gleichzeitige Finalisieren der letzten zwei Gruppenspiele race-sicher: welche Transaktion auch immer das Gruppen-Lock als zweite bekommt, sieht garantiert den vollständigen, aktuellen Stand.

Sobald irgendein `GROUP_POSITION`-Slot dieser Gruppe aufgelöst wurde, wird `resultPropagatedAt` (ADR 0011) auf ALLEN Spielen der Gruppe gesetzt — nicht nur auf dem zuletzt finalisierten. Grund: jedes Ergebnis der Gruppe könnte im Prinzip die jetzt propagierte Tabelle beeinflusst haben; die bestehende Sperre aus ADR 0011 wird dafür unverändert wiederverwendet, keine neue Sperrlogik nötig.

## Verworfene Alternativen

- **Persistierte Gruppentabelle (`TournamentGroupStanding`), inkrementell fortgeschrieben:** verworfen. Würde eine neue Migration, ein neues Konsistenzproblem ("stimmt die persistierte Tabelle noch mit den Spielergebnissen überein?") und einen zweiten Ort für dieselbe Information schaffen — genau das, was Abschnitt 22 des Auftrags vermeiden will. Bei den hier relevanten Datenmengen (eine Turniergruppe hat wenige Teilnehmer, wenige Spiele) ist die Live-Berechnung trivial günstig; ein Persistenz-Layer hätte ausschließlich Komplexität ohne echten Performancegewinn eingebracht.
- **Head-to-Head-Tiebreak als zusätzliches sportliches Kriterium:** verworfen für diese Phase — vom Auftrag explizit ausgeschlossen (Abschnitt 6/31: "kein neues komplexes Head-to-Head-Regelwerk", sofern nicht bereits im Projekt vorgesehen). Punkte → Tordifferenz → Tore ist die im Auftrag selbst vorgegebene Standardregel.
- **Bei sportlichem Gleichstand einfach nach Teilnehmer-ID entscheiden (wie es viele einfache Implementierungen stillschweigend tun):** verworfen — das würde genau die vom Auftrag verbotene stille, für Nutzer unsichtbare Fehlentscheidung erzeugen (ein `GROUP_POSITION`-Slot bekäme ein Team zugewiesen, das sportlich nicht eindeutig berechtigt ist). Stattdessen: Tabelle bleibt deterministisch anzeigbar (die technische ID-Ordnung dient NUR der Darstellung, nie der Slot-Auflösung), der Slot bleibt offen, der Gleichstand wird in der UI sichtbar markiert (`*`).
- **GROUP_POSITION-Auflösung nur für das gerade finalisierte Spiel prüfen, nicht für die ganze Gruppe:** verworfen — bei zwei nahezu gleichzeitig finalisierten letzten Gruppenspielen könnte sonst keine der beiden Transaktionen zuverlässig erkennen, dass die Gruppe jetzt (durch die JEWEILS ANDERE Transaktion) vollständig ist. Das gruppenweite deterministische Lock löst dieses Problem strukturell.

## Konsequenzen

- Jeder Lesezugriff auf die Gruppenliste berechnet die Tabelle neu (zwei zusätzliche, indexierte Abfragen pro Turnier, kein N+1) — für die in der Praxis kleinen Turniergruppen vernachlässigbar; bei sehr großen Turnieren wäre das ein möglicher künftiger Optimierungspunkt (siehe Phase-16-Bericht, "Technische Schulden").
- Ein `GROUP_POSITION`-Slot kann dauerhaft offen bleiben, wenn zwei Teams nach Punkten/Tordifferenz/Toren exakt gleich stehen und die Gruppe bereits vollständig ist — das ist ABSICHTLICH so und kein Bug. Eine manuelle Auflösung durch einen Menschen (z. B. Losentscheid, wie im echten Turnierbetrieb üblich) ist bewusst nicht Teil dieser Phase (siehe Auftrag Abschnitt 31) und bliebe eine mögliche spätere Erweiterung.
- Jede künftige Änderung an der Rangfolge-Regel (z. B. ein Head-to-Head-Kriterium) betrifft ausschließlich die reine Funktion `computeGroupStandings` — keine Datenbankmigration nötig, da nichts von der aktuellen Regel abhängig persistiert ist.

## Bezug

- [0009 – Tenant-gebundene Mehrfach-Statement-Transaktionen](./0009-tenant-scoped-multi-statement-transactions.md) (deterministische Lock-Reihenfolge, hier auf Gruppenebene wiederverwendet)
- [0010 – Pending KO-Spielteilnehmer als TournamentMatchSlot](./0010-knockout-pending-match-slots.md) (dieselbe Slot-Architektur, hier für `GROUP_POSITION` statt `WINNER_OF_MATCH`/`LOSER_OF_MATCH` genutzt)
- [0011 – Bereits propagierte KO-Ergebnisse sind unveränderlich](./0011-propagated-result-immutability.md) (Sperrmechanismus, hier gruppenweit wiederverwendet)
- [PHASE_16_TOURNAMENT_GROUP_STANDINGS_REPORT.md](../../PHASE_16_TOURNAMENT_GROUP_STANDINGS_REPORT.md)
