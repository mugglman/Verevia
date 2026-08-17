# 0001 – Modularer Monolith statt Microservices in Phase 1

## Status

Angenommen

## Kontext

Verevia startet als neue Plattform mit einem eng umrissenen MVP-Fokus (Verein → Fußball → Mannschaft → Turnierplan), soll aber langfristig zahlreiche Module und Abteilungen unterstützen. Es stellt sich die Frage, ob die Anwendung von Beginn an als Microservices-Architektur oder als Monolith aufgebaut werden soll.

## Entscheidung

Verevia wird in Phase 1 als **modularer SaaS-Monolith** umgesetzt:

- Eine einzelne Backend-Anwendung (NestJS) mit klar getrennten fachlichen Modulen.
- Ein einzelnes Datenbankschema (PostgreSQL) mit strikter Mandantentrennung über `tenant_id`.
- Modulgrenzen werden im Code sauber gezogen, sodass eine spätere Auslagerung einzelner Module in eigenständige Dienste möglich bleibt, ohne dass sie in Phase 1 erforderlich ist.

## Konsequenzen

- Geringere Betriebskomplexität in der Frühphase (ein Deployment, eine Datenbank, weniger Infrastrukturaufwand).
- Schnellere Entwicklung des MVP, da keine Service-zu-Service-Kommunikation, kein verteiltes Tracing und kein Service-Mesh benötigt werden.
- Klare Modulgrenzen im Code sind notwendig, um eine spätere Auflösung in Microservices nicht unnötig zu erschweren.
- Skalierung erfolgt zunächst vertikal beziehungsweise über mehrere Instanzen des Monolithen, nicht über unabhängig skalierbare Services.

## Bezug

- [Architektur](../Architecture.md)
- [Mandantenfähigkeit](../Multi-Tenancy.md)
