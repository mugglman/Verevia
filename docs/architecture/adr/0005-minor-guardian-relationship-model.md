# 0005 – Eltern-/Kind-Beziehungen als PersonRelationship, nicht als RBAC-Rolle

## Status

**ACCEPTED** (2026-08-17)

## Kontext

Verevia verwaltet zahlreiche minderjährige Mitglieder mit Erziehungsberechtigten, die häufig eigene Verevia-Accounts besitzen, mehrere Kinder haben können und gleichzeitig eigenständige, andere Rollen im Verein innehaben können (z. B. gleichzeitig Trainerin und Mutter). Es stellt sich die Frage, ob "Elternteil"/"Erziehungsberechtigter" als RBAC-Rolle (analog zu `Trainer`, `Mitglied`) oder als eigenständiges Beziehungskonzept modelliert werden soll.

## Entscheidung

**"Elternteil"/"Erziehungsberechtigter" ist keine RBAC-Rolle, sondern eine gerichtete Beziehung zwischen zwei `Person`-Datensätzen**, abgebildet über eine neue Entität `PersonRelationship`:

- gerichtet (`fromPersonId` → `toPersonId`), nicht bidirektional gespeichert — die "Kind von"-Sicht wird invertiert abgefragt, nie dupliziert.
- Typisiert (`PARENT`, `LEGAL_GUARDIAN`, `EMERGENCY_CONTACT`) mit Flag `isLegalGuardian` für rechtliche Sorgeberechtigung.
- Verifizierungspflichtig (`verifiedByPersonId`) — keine ungeprüfte Selbstauskunft.
- Zeitlich begrenzbar (`validFrom`/`validUntil`) für den Übergang minderjährig → volljährig, ohne die Beziehung rückwirkend zu löschen.

Der fachliche Zugriff eines Erziehungsberechtigten auf Daten des Kindes wird als eigene, kontextabhängige Autorisierungsregel (ReBAC-Bedingung in CASL) neben dem RBAC-System behandelt, nicht innerhalb des Rollenkatalogs aus [0004](./0004-scoped-rbac-role-assignment.md).

Ausführliche Herleitung siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md), Abschnitte 6 und 9.

## Konsequenzen

- Mehrere Erziehungsberechtigte pro Kind, mehrere Kinder pro Erziehungsberechtigtem und Patchwork-Familien-Konstellationen sind ohne Sonderfälle abbildbar.
- Ein Elternteil, das gleichzeitig eine eigenständige Vereinsrolle innehat (z. B. Trainerin), benötigt keine Modell-Sonderbehandlung — `PersonRelationship` und `RoleAssignment` sind vollständig unabhängige, koexistierende Fakten auf derselben `Person`.
- Autorisierungslogik muss RBAC (Rollen/Scopes) und ReBAC (Beziehungen) kombinieren — höhere Komplexität in der Authorization-Schicht als bei reinem RBAC, aber fachlich korrekt.
- `PersonRelationship`-Erstellung/-Bestätigung erfordert einen definierten Verifizierungs-Workflow (Vereinsverantwortlicher oder bereits verifizierter Erziehungsberechtigter) — Sicherheitsanforderung, siehe Auth-/Identity-Bericht Abschnitt 16 (Guardian-Spoofing-Risiko).
- Rechtlich zu klärender Punkt (nicht Teil dieses ADR): ob und wie eine dokumentierte Einwilligung der Erziehungsberechtigten zusätzlich zur technischen Verifizierung erforderlich ist.

## Bezug

- [Auth-, Identity- und RBAC-Architektur](../../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)
- [Datenbank-Entwurf](../../database/Database.md)
- [0003 – Identity Model](./0003-identity-account-person-model.md)
- [0004 – Scoped RBAC](./0004-scoped-rbac-role-assignment.md)
