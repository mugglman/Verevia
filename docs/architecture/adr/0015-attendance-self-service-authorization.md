# 0015 – Anwesenheit: Self-Service-Zugriffspfad neben RBAC, kein neuer Authorization-Mechanismus

## Status

**ACCEPTED** (2026-09-12)

## Kontext

Phase 19 implementiert `Attendance` (Zu-/Absage sowie tatsächliche Anwesenheit einer `Person` zu einem `Event`) — der in `docs/database/Database.md` seit Projektbeginn skizzierte, direkte fachliche Nachfolger von Phase 18s `Event`.

Der bestehende RBAC-Lesezugriff auf ein `Event` (`EventsService.canAccess`, ADR 0014) setzt für Team-Events eine `RoleAssignment` mit `scopeType: TEAM` für das betroffene Team voraus. In der Praxis hat aber ein gewöhnlicher Spieler — laut `TeamMember`-Modellkommentar und `seed.ts` — häufig **nur** eine `TeamMember`-Zeile (fachliche Mannschaftszugehörigkeit), **keine** `RoleAssignment`. Ein Erziehungsberechtigter (der laut Phase 6 typischerweise selbst ebenfalls keine `RoleAssignment` besitzt, nur eine verifizierte `PersonRelationship`) kann daher unter der bestehenden RBAC-Regel ein Team-Event, zu dem sein Kind gehört, **gar nicht lesen** — und könnte folglich auch keine Zu-/Absage abgeben, wäre `Attendance` ausschließlich über denselben RBAC-Pfad zugänglich.

Diese Lücke ist keine Phase-19-Regression, sondern eine bereits in Phase 10/18 bewusst so getroffene, unveränderte Eigenschaft von `canOnMatch`. Sie zu schließen, indem `canOnMatch`/`canOnSeason` selbst um eine `TeamMember`-Prüfung erweitert würden, hätte Rückwirkungen auf `FootballMatch` und `Event` gleichermaßen — deutlich über den Phase-19-Auftrag (Anwesenheit) hinaus, und eine Änderung an einer bereits ausführlich getesteten, fremden Regel ohne fachlichen Auftrag dazu.

## Entscheidung

**Zwei koexistierende, unabhängig geprüfte Zugriffspfade auf `Attendance` — keine neue Authorization Engine, keine Änderung an `canOnMatch`/`canOnSeason`:**

1. **RBAC (Organisator)**: exakt `EventsService.canAccess(assignments, event, "read"|"update")`, unverändert wiederverwendet (nur dessen Sichtbarkeit von `private` auf `public` geändert, siehe `EventsService.canAccess`-Kommentar) — wer das Event lesen/bearbeiten darf, darf die volle Anwesenheitsliste lesen bzw. verwalten (RSVP überschreiben, tatsächliche Anwesenheit erfassen).
2. **Self-Service (Betroffene Person oder verifizierter Erziehungsberechtigter)**: `AttendancesService` prüft unabhängig, ob die Zielperson (der Aufrufer selbst, oder — via `AuthorizationService.getGuardianChildPersonIds`, Phase 6 ReBAC-Pfad, unverändert wiederverwendet — ein verifiziertes Kind) auf dem **Roster** des Events steht. Wer diesen Pfad erfüllt, darf ausschließlich die EIGENE bzw. eines Kindes RSVP setzen — niemals `attended` (das bleibt exklusiv Organisatoren-Feststellung).

„Roster" ist bewusst unterschiedlich definiert je Event-Scope, da das Datenmodell keine generische Mitgliederliste kennt:

- **Team-Event**: aktive `TeamMember` dieses Teams — die fachlich korrekte Mannschaftszugehörigkeit, unabhängig von einer `RoleAssignment`.
- **Department-Event**: jede Person mit einer `RoleAssignment`, die `canOnSeason(read, departmentId)` erfüllt — es gibt kein „DepartmentMember"-Äquivalent zu `TeamMember` im Datenmodell; Department-Events sind laut ADR 0014 ohnehin administrativer Natur (eine Versammlung), ihr faktischer Teilnehmerkreis sind Funktionsträger, keine beliebigen Vereinsmitglieder.

Zusätzlich liefert `GET /events/:eventId/attendances` einen minimalen, rein lesenden Event-Kontext (Titel, Zeitraum, Ort, Beschreibung) mit — genug, damit ein Erziehungsberechtigter ohne RBAC-Lesezugriff auf das Event selbst trotzdem erkennt, wann/wo der Termin stattfindet, um sinnvoll zu- oder abzusagen. Das Web (`/kalender/[id]`) zeigt für diesen Fall eine bewusst reduzierte Ansicht (`AttendanceOnlyEventView`) ohne jede Bearbeiten-/Löschen-Affordanz.

## Verworfene Alternativen

- **`canOnMatch`/`canOnSeason` um eine `TeamMember`-Prüfung erweitern**: verworfen — beträfe auch `FootballMatch` und `Event`s RBAC-Pfad, weit über den Attendance-Auftrag hinaus, und würde eine bereits umfassend getestete, in Phase 10/18 bewusst getroffene Regel ohne fachlichen Anlass verändern.
- **Attendance ausschließlich über RBAC zugänglich machen (kein Self-Service-Pfad)**: verworfen — hätte die Kernfunktion (Eltern sagen für ihr Kind zu/ab) für den in `seed.ts` dokumentierten Normalfall (Spieler/Eltern ohne eigene Rolle) faktisch unbenutzbar gemacht.
- **Ein `DepartmentMember`-Modell einführen, um Team- und Department-Roster einheitlich zu behandeln**: verworfen als verfrühte Abstraktion — kein weiterer Bedarf dafür existiert aktuell im Datenmodell; die zwei unterschiedlichen, aber jeweils exakt zum Datenmodell passenden Roster-Definitionen genügen für den heutigen Umfang.
- **Ein zweiter, öffentlicher „Minimal-Event"-Endpunkt analog `PublicTournamentController` (ADR 0013)**: verworfen — hier geht es nicht um öffentliche, nicht-authentifizierte Sichtbarkeit, sondern um einen engen, weiterhin authentifizierten Self-Service-Pfad; die Antwort von `GET /events/:eventId/attendances` selbst trägt den nötigen Event-Kontext, kein separater Endpunkt nötig.

## Konsequenzen

- `EventsService.canAccess` und `EventsService.findRaw` sind jetzt `public` (reine Sichtbarkeitsänderung, keine Verhaltensänderung) — `AttendancesService` reicht dieselbe Funktion/Query durch, statt sie zu duplizieren.
- Ein künftiges, ähnlich gelagertes Self-Service-Feature (z. B. `Task`/Aufgabe mit persönlicher Erledigung) hat mit diesem Präzedenzfall eine klare Vorlage: RBAC-Organisatorpfad und Self-Service-Zielpersonpfad unabhängig prüfen, statt RBAC selbst aufzuweichen.
- Die Web-Detailseite (`/kalender/[id]`) muss zwei Antworten (`/events/:id` und `/events/:id/attendances`) parallel abfragen und je nach Erfolg zwischen `EventDetail` (volle Verwaltung) und `AttendanceOnlyEventView` (reduzierte Self-Service-Ansicht) wählen — ein Muster, das bei einem künftigen ähnlichen Feature wiederverwendbar ist.

## Bezug

- [0014 – Kalendertermine: Autorisierung folgt der Scope-Art](./0014-event-dual-scope-authorization.md) (RBAC-Basis, hier unverändert wiederverwendet)
- [0005 – Minderjährige/Erziehungsberechtigte-Beziehungsmodell](./0005-minor-guardian-relationship-model.md) (`PersonRelationship`/ReBAC-Grundlage für `getGuardianChildPersonIds`)
- [docs/database/Database.md](../../database/Database.md), Entität „Attendance (Anwesenheit)"
- [PHASE_19_ATTENDANCE_REPORT.md](../../PHASE_19_ATTENDANCE_REPORT.md)
