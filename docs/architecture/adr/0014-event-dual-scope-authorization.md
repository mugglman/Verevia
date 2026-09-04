# 0014 – Kalendertermine: Autorisierung folgt der Scope-Art (Team vs. Department)

## Status

**ACCEPTED** (2026-09-01)

## Kontext

Phase 18 implementiert das in `docs/database/Database.md` seit Projektbeginn skizzierte, bislang nicht umgesetzte `Event` (Termin) — der erste noch offene Teil von Roadmap.md „Phase 3 – Operative Mannschaftsplanung", nachdem die gesamte Turnierplan-Vertikale (Roadmap Phase 4) mit Phase 17 abgeschlossen wurde.

Ein `Event` gehört laut Database.md „zu einem Team oder Department" — nie beides, nie keines (strukturell identisch zum bereits etablierten XOR-Muster von `TournamentParticipant.teamSeasonId`/`externalName`, ADR 0008). Die offene Frage: welche Rollen dürfen einen Termin anlegen/bearbeiten?

Zwei bestehende, bereits etablierte Muster kamen infrage:

1. **`canOnTeam`/`canOnSeason`-Muster** (`TeamSeason`, `FootballTournament`): nur `TENANT_ADMIN`/`DEPARTMENT_ADMIN` dürfen anlegen/bearbeiten — administrative Mannschafts-/Turnierverwaltung.
2. **`canOnMatch`-Muster** (`FootballMatch`, Phase 10): zusätzlich auch `COACH`/`TEAM_MANAGER` des betroffenen Teams — eine alltägliche Trainer-Aufgabe. Explizit begründet in `docs/product/Roles-and-Permissions.md`, Phase-10-Ergänzung: *„ein Spiel ist eine alltägliche Trainer-Aufgabe, keine administrative Mannschaftsverwaltung"*.

Ein Trainingstermin ist fachlich eindeutig näher an „Spiel anlegen" als an „Mannschaft/Saison verwalten" — ein Trainer legt sein wöchentliches Training selbst an, ohne dafür einen Administrator zu benötigen.

## Entscheidung

**Die Autorisierung eines `Event` folgt seiner Scope-Art, nicht einer einzigen einheitlichen Regel:**

- **Team-gebundenes Event** (`teamId` gesetzt, z. B. Training): wiederverwendet `canOnMatch` unverändert — `TENANT_ADMIN` immer, `DEPARTMENT_ADMIN` der Abteilung dieses Teams, sowie `COACH`/`TEAM_MANAGER` dieses Teams dürfen anlegen/bearbeiten; andere `TEAM`-Scope-Rollen (`ASSISTANT_COACH`, `PLAYER`) dürfen nur lesen.
- **Department-gebundenes Event** (`departmentId` gesetzt, z. B. eine Abteilungsversammlung): wiederverwendet `canOnSeason` unverändert — nur `TENANT_ADMIN`/`DEPARTMENT_ADMIN` dieser Abteilung dürfen anlegen/bearbeiten; jede Rolle mit Bezug zu dieser Abteilung (direkt oder über ein Team) darf lesen.

`EventsService.canAccess()` verzweigt rein strukturell zwischen beiden (`if (event.teamId) { canOnMatch(...) } else { canOnSeason(...) }`) — **keine neue, dritte Autorisierungsmethode** in `AuthorizationService`, ausschließlich Wiederverwendung der beiden bestehenden Methoden mit ihrer jeweils bereits etablierten, dokumentierten Bedeutung.

Zusätzlich: `GET /events/creatable-scopes` (neuer, dedizierter Endpunkt) berechnet für den aufrufenden Nutzer serverseitig, für welche konkreten Teams/Departments er tatsächlich einen Termin anlegen darf — dieselbe `canAccess`-Logik, iteriert über alle Teams/Departments des Mandanten. Grund: `TeamDto.canEdit`/eine reine Department-Leseliste hätten die FALSCHEN Rechte widergespiegelt (`canOnTeam`- statt `canOnMatch`-Semantik) und das Web-Auswahlformular hätte Optionen angeboten, die serverseitig doch abgelehnt worden wären.

## Verworfene Alternativen

- **Einheitlich `canOnSeason`-artige Regel für alle Events** (nur Admins legen an): verworfen — würde jeden Trainer zwingen, für ein wöchentliches Training einen Administrator zu bemühen, obwohl exakt dieselbe fachliche Situation bei `FootballMatch` bereits anders (und laut Auftrag bewusst so) entschieden wurde.
- **Einheitlich `canOnMatch`-artige Regel für alle Events, auch department-gebundene**: verworfen — ein department-weiter Termin (z. B. eine Versammlung) betrifft nicht „ein Team", für das ein einzelner Trainer zuständig wäre; ihn jedem `COACH` einer beliebigen Mannschaft der Abteilung anlegen zu lassen, würde Verantwortlichkeiten verwischen, die `canOnSeason` bei `FootballTournament`/`Season` bereits bewusst den Administratoren vorbehält.
- **Eine neue, eigene `canOnEvent`-Methode in `AuthorizationService`**, die intern dieselbe Fallunterscheidung kapselt: verworfen zugunsten der direkten Verzweigung in `EventsService` — spiegelt exakt, wie `MatchesService.canAccess` bereits zwischen `canOnMatch` (Vereinsmatch) und `canOnSeason` (Turniermatch) unterscheidet (ADR 0008), ohne dafür eine dritte Methode zu benötigen. Konsistenz mit diesem bereits etablierten Muster wurde einer zusätzlichen Indirektionsebene vorgezogen.
- **`TeamDto`/`DepartmentDto` um ein Event-spezifisches `canCreateEvents`-Feld erweitern**: verworfen — hätte die bestehenden, für andere Zwecke (Team-/Departmentverwaltung selbst) bereits klar definierten DTOs mit einer fremden, ressourcenspezifischen Semantik vermischt. Ein dedizierter `EventsService`-Endpunkt hält die Zuständigkeit dort, wo die Regel eigentlich lebt.

## Konsequenzen

- Ein künftiges team-oder-department-gebundenes Feature (z. B. `Task`/Aufgabe, laut Database.md ebenfalls noch nicht implementiert) hat mit diesem Phase-18-Präzedenzfall bereits eine klare Vorlage: zuerst fachlich einordnen, ob es eher „alltägliche Trainer-Aufgabe" (`canOnMatch`-Muster) oder „administrative Verwaltung" (`canOnSeason`-Muster) ist, statt eine neue Regel zu erfinden.
- `EventsService.canAccess` muss bei einer künftigen Änderung an `canOnMatch`/`canOnSeason` automatisch mitziehen (keine eigene, potenziell abweichende Kopie der Regeln) — das ist beabsichtigt, nicht zufällig.
- `GET /events/creatable-scopes` iteriert bei jedem Aufruf alle Teams/Departments des Mandanten in-memory — für die in der Praxis kleinen Vereine dieses Produkts vernachlässigbar (siehe ADR 0012, dieselbe Größenordnungs-Begründung).

## Bezug

- [0008 – Turnierspiele erweitern FootballMatch](./0008-tournament-match-model.md) (`canOnMatch`/`canOnSeason`-Verzweigungsmuster, hier auf `Event` übertragen)
- [docs/product/Roles-and-Permissions.md](../../product/Roles-and-Permissions.md), Phase-10-Ergänzung („ein Spiel ist eine alltägliche Trainer-Aufgabe")
- [docs/database/Database.md](../../database/Database.md), Entität „Event (Termin)"
- [PHASE_18_CALENDAR_EVENTS_REPORT.md](../../PHASE_18_CALENDAR_EVENTS_REPORT.md)
