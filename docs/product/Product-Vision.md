# Produktvision

## Problemstellung

Vereine organisieren Mannschaften, Abteilungen, Termine und Kommunikation heute häufig über eine Mischung aus Papier, Tabellen, Messenger-Gruppen und Einzellösungen. Das führt zu Reibungsverlusten zwischen Trainern, Mitgliedern, Eltern und Vorstand, insbesondere bei der Koordination von Terminen, Zu- und Absagen sowie Turnierplanung.

## Zielbild

Verevia soll eine zentrale, digitale Plattform sein, die alle am Vereinsleben Beteiligten verbindet: Mitglieder, Eltern, Trainer, Abteilungsleiter und Vorstand. Ausgangspunkt ist der Schwerpunkt Verein → Fußball → Mannschaft → Turnierplan; die Plattform ist jedoch von Beginn an so angelegt, dass weitere Abteilungen und Vereinsarten später ergänzt werden können.

## Zielgruppen

- Vereine als Organisation und zahlender Kunde
- Abteilungen und Mannschaften innerhalb eines Vereins
- Trainer und Betreuer
- Mitglieder
- Eltern beziehungsweise Sorgeberechtigte
- Vorstände
- Organisatoren (z. B. von Turnieren)

## Mehrwert

- ein zentraler Ort für Kalender, Termine, Zu-/Absagen und Anwesenheit statt verstreuter Einzellösungen
- klare Rollen- und Rechteverwaltung je Verein
- Unterstützung für Turnierplanung inklusive öffentlicher Turnierinformationen
- Grundlage, um perspektivisch weitere Abteilungen und Vereinsarten abzubilden

## Produktgrundsätze

- Mobile First und API First
- Mandantenfähigkeit von Beginn an (siehe [Multi-Tenancy.md](../architecture/Multi-Tenancy.md))
- Datenschutz und Sicherheit als Grundanforderung, nicht als nachträgliche Ergänzung
- modularer Aufbau, der schrittweise erweitert werden kann

## Abgrenzung zu einer reinen Mannschafts-App

Verevia soll **keine reine Fußball-App** und **keine bloße Kopie bestehender Mannschaftsverwaltungs-Tools** sein. Der fachliche Anspruch geht über die reine Mannschaftsorganisation hinaus: Verevia bildet den gesamten Verein ab – mit Abteilungen, Vereinsverwaltung, Vorstand und perspektivisch weiteren Vereinsarten. Die anfängliche Fokussierung auf Fußball und Mannschaften ist ein bewusst gewählter Startpunkt, nicht das langfristige Zielbild.

## Bezug

- [MVP-Abgrenzung](./MVP-Scope.md)
- [Rollen und Berechtigungen](./Roles-and-Permissions.md)
- [Markenidentität](../branding/Brand-Identity.md)
