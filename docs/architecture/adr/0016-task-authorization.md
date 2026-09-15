# 0016 – Aufgaben: Team-Scope wiederverwendet canOnMatch, Person-Scope leitet Berechtigung aus der Zielperson-Mannschaftszugehörigkeit ab, Selbst-Erledigung für die Zielperson

## Status

**ACCEPTED** (2026-09-12)

## Hinweis zur Nummerierung

Zum Zeitpunkt dieser Entscheidung ist PR #23 (Phase 19 „Anwesenheit", ADR 0015) noch offen, aber bewusst nicht gemergt (siehe Arbeitsauftrag: „Phase-19-Branch nicht nachträglich verändern"). Um eine Kollision beim späteren Merge zu vermeiden, überspringt diese ADR die Nummer 0015 und verwendet **0016** — auf `main` ist 0014 aktuell die höchste vergebene Nummer, 0015 ist durch die ausstehende Phase-19-PR bereits reserviert.

## Kontext

Phase 20 implementiert das in `docs/database/Database.md` seit Projektbeginn skizzierte, bislang nicht umgesetzte `Task` — der nächste offene Punkt aus Roadmap.md „Phase 3 – Operative Mannschaftsplanung" nach Kalender/Termine (Phase 18) und Zu-/Absagen/Anwesenheit (Phase 19, PR #23). `docs/ARCHITEKTUR_BERICHT.md` bestätigt zusätzlich, dass „Push-Mitteilungen" (der einzige verbleibende Punkt derselben Roadmap-Phase) neue Infrastruktur (Redis/BullMQ) voraussetzt, die im Projekt noch nicht existiert — Aufgaben ist damit der einzige sofort umsetzbare nächste Schritt.

Eine `Task` gehört laut Database.md „zu einer Mannschaft oder Person" — nie beides, nie keines (strukturell identisch zum bereits etablierten XOR-Muster von `Event.teamId`/`departmentId`, ADR 0014, und `TournamentParticipant.teamSeasonId`/`externalName`, ADR 0008). Zwei offene Fragen: (1) wer darf eine Aufgabe anlegen/bearbeiten, (2) wer darf eine Aufgabe als erledigt markieren.

Die Team-Variante (eine gemeinsame Mannschaftsaufgabe, z. B. „Trikots waschen") ist fachlich identisch zur bereits für `Event`/`FootballMatch` getroffenen Einordnung: eine alltägliche Trainer-Aufgabe, keine administrative Mannschaftsverwaltung.

Die Person-Variante (eine individuelle Zuweisung, z. B. „Erste-Hilfe-Set mitbringen") ist neu: `Task` selbst trägt keinen Team-/Department-Scope, wenn `personId` gesetzt ist. Wer darf einer bestimmten Person eine Aufgabe zuweisen? Und: eine gewöhnliche Person hat oft — wie bereits in ADR 0015 (Phase 19, dieselbe Beobachtung unabhängig re-hergeleitet) festgestellt — gar keine eigene `RoleAssignment`, nur eine `TeamMember`-Zeile (siehe `seed.ts`). Ohne einen Self-Service-Pfad könnte die Zielperson ihre eigene zugewiesene Aufgabe nicht einmal sehen, geschweige denn als erledigt markieren.

## Entscheidung

**Zwei fachlich unterschiedliche Autorisierungsfragen, keine neue Authorization Engine:**

1. **Anlegen/Bearbeiten (Titel, Beschreibung, Fälligkeit, Löschen)** — ausschließlich Organisatorrollen, abhängig vom Scope:
   - **Team-Aufgabe**: direkte Wiederverwendung von `canOnMatch` (unverändert) — `TENANT_ADMIN` immer, `DEPARTMENT_ADMIN` der Abteilung dieses Teams, `COACH`/`TEAM_MANAGER` dieses Teams; andere `TEAM`-Scope-Rollen lesen nur.
   - **Personen-Aufgabe**: `TasksService.canAccess` löst zur Prüfzeit die aktiven `TeamMember`-Zeilen der Zielperson auf und wendet `canOnMatch` auf JEDES ihrer Teams an — wer mindestens eines der Teams der Zielperson als `COACH`/`TEAM_MANAGER` verwaltet (oder `DEPARTMENT_ADMIN`/`TENANT_ADMIN` ist), darf die Aufgabe anlegen/bearbeiten. Kein neues `AuthorizationService`-Primitive — die Verzweigung und die Team-Auflösung leben direkt in `TasksService`, exakt wie `EventsService.canAccess` bereits zwischen `canOnMatch`/`canOnSeason` verzweigt (ADR 0014).
2. **Status setzen (offen/erledigt)** — zusätzlich zur Organisatorrolle darf dies die Zielperson selbst bzw. ihr verifizierter Erziehungsberechtigter (`AuthorizationService.getGuardianChildPersonIds`, Phase 6, unverändert wiederverwendet) — der ETABLIERTE Self-Service-Pfad, unabhängig davon, ob dieselbe Person auch RBAC-Rechte besitzt. Bei einer Team-Aufgabe gibt es keine einzelne „Zielperson" — hier bleibt das Setzen des Status ausschließlich Organisatoren vorbehalten (wie Anlegen/Bearbeiten).

`GET /tasks/creatable-scopes` (analog `GET /events/creatable-scopes`, ADR 0014) liefert dem Aufrufer serverseitig berechnet, für welche Teams er Team-Aufgaben anlegen darf und für welche Personen er Personen-Aufgaben anlegen darf (Union der aktiven Kader-Mitglieder aller Teams, für die er create-berechtigt ist) — verhindert, dass das Web-Formular Ziele anbietet, die serverseitig doch abgelehnt würden.

## Verworfene Alternativen

- **Ein `DepartmentMember`-Modell oder ein neues `assigneeTeamId`-Feld auf `Task` selbst**, um die Autorisierung ohne Laufzeit-Auflösung zu ermöglichen: verworfen — verdoppelt eine bereits vorhandene Information (`TeamMember`), führt zu Inkonsistenzrisiko (die Aufgabe müsste bei einem Teamwechsel der Person manuell nachgezogen werden), und `TeamMember` ist ohnehin schon die fachlich korrekte Quelle für „zu welchem Team gehört diese Person".
- **Personen-Aufgaben ausschließlich `TENANT_ADMIN`-verwaltbar** (keine Coach-Delegation): verworfen — würde exakt dieselbe künstliche Einschränkung wiederholen, die für `FootballMatch`/`Event` bereits bewusst vermieden wurde (ein Trainer muss für eine alltägliche Aufgabenzuweisung keinen Administrator bemühen).
- **Ein selbst erstelltes, rein persönliches To-Do ohne Organisator** (jede Person legt sich selbst Aufgaben an): verworfen als Scope-Erweiterung über die Datenmodell-Beschreibung („zugeordnet", nicht „erstellt von der Zielperson selbst") hinaus — nicht in den Projektunterlagen belegt, siehe Arbeitsauftrag „keine Features erfinden".
- **Getrennte Endpunkte für „Anlegen für Team" und „Anlegen für Person"**: verworfen zugunsten eines einzigen `POST /tasks` mit XOR-Feldern, exakt wie `POST /events` (ADR 0014) — ein einheitliches Formular mit kombiniertem „Für wen"-Feld ist für Aufrufer und Frontend einfacher als zwei parallele Flows.

## Konsequenzen

- `TasksService` benötigt zur Autorisierungsprüfung einer Personen-Aufgabe einen zusätzlichen `TeamMember`-Lookup (die aktiven Teams der Zielperson) — für die in der Praxis kleinen Kader dieses Produkts vernachlässigbar (siehe ADR 0012, dieselbe Größenordnungs-Begründung).
- Verlässt eine Person alle ihre Teams (jede `TeamMember`-Zeile wird `INACTIVE`), verliert automatisch jeder bisherige Team-Coach die Bearbeitungsberechtigung für ihre offenen Personen-Aufgaben — nur noch `TENANT_ADMIN` kann sie verwalten. Dies ist eine bewusste, aus der Ableitungsregel folgende Konsequenz, keine gesonderte Behandlung nötig.
- Ein künftiges, ähnlich geartetes Feature (Zuweisung an eine Person ohne eigenen Team-/Department-Scope am Zielmodell) hat mit diesem Präzedenzfall eine klare Vorlage: Berechtigung über die Zielperson-Beziehungen ableiten, statt ein redundantes Scope-Feld einzuführen.

## Bezug

- [0014 – Kalendertermine: Autorisierung folgt der Scope-Art](./0014-event-dual-scope-authorization.md) (Team-XOR-Scope-Muster, hier auf `Task` übertragen)
- [0005 – Minderjährige/Erziehungsberechtigte-Beziehungsmodell](./0005-minor-guardian-relationship-model.md) (`PersonRelationship`/ReBAC-Grundlage für `getGuardianChildPersonIds`)
- [docs/database/Database.md](../../database/Database.md), Entität „Task (Aufgabe)"
- [PHASE_20_TASK_TRACKING_REPORT.md](../../PHASE_20_TASK_TRACKING_REPORT.md)
