# Modulprioritäten

> Status: Entwurf. Die Priorisierung kann sich im Projektverlauf noch ändern.

## Prioritätsskala

| Priorität | Bedeutung |
|---:|---|
| 1 | sehr hoch |
| 2 | hoch |
| 3 | mittel |
| 4 | niedrig |
| 5 | später |

## Übersicht

| Modul | Priorität |
|---|---:|
| Mannschaften | 1 |
| Turnierplan | 1 |
| Kalender | 1 |
| Aufgaben | 1 |
| Mitglieder | 1 |
| Eltern | 1 |
| Trainer | 1 |
| Push-Mitteilungen | 1 |
| Anwesenheit | 1 |
| Statistik | 1 |
| Website | 1 |
| Platzbelegung | 2 |
| Vereinsverwaltung | 2 |
| Chat | 3 |
| Dokumente | 3 |
| Finanzen | 3 |
| Inventar | 4 |
| Abteilungen | 5 |
| Sponsoren | 5 |
| Schiedsrichter | 5 |
| Verbände | 5 |

## Wichtige fachliche Einordnung

Obwohl die umfassende Unterstützung zusätzlicher Abteilungen (über Fußball hinaus) erst in einer späteren Priorität geplant ist, müssen Abteilungen im grundlegenden Datenmodell **von Anfang an** vorhanden sein (siehe [Database.md](../database/Database.md), Entität `Department`). Dies stellt sicher, dass die spätere Erweiterung um weitere Abteilungen und Vereinsarten keine grundlegende Datenmodelländerung erfordert.

## Bezug

- [MVP-Abgrenzung](../product/MVP-Scope.md)
- [Roadmap](../roadmap/Roadmap.md)
