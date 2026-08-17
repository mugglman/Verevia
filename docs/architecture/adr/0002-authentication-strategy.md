# 0002 – Authentifizierung: selbst gehostete Auth-Library statt Eigenbau oder externer Identity-Provider

## Status

**ACCEPTED** (2026-08-17, nach erfolgreichem technischem Spike — siehe [ARCHITEKTUR_FINALISIERUNG.md](../../ARCHITEKTUR_FINALISIERUNG.md), Abschnitte 1–3)

## Kontext

Verevia benötigt E-Mail/Passwort-Login, E-Mail-Verifizierung, Passwort-Reset, Session-Management mit Revocation, CSRF-Schutz, Rate-Limiting sowie später MFA und Passkeys. Sicherheitskritische Kryptografie- und Session-Logik soll nicht selbst entwickelt werden. Gleichzeitig soll kein zusätzlicher, eigenständiger Identity-Dienst (z. B. Keycloak) betrieben werden, sofern kein zwingender technischer Grund vorliegt — insbesondere wegen des begrenzten RAM-Budgets des VPS (8 GB, geteilt mit Postgres, Traefik und den Anwendungscontainern) und wegen der doppelten Datenhaltung von Identitätsdaten, die ein externer IdP mit sich bringt.

Ausführliche Bewertung siehe [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md), Abschnitte 2–3.

## Entscheidung

Authentifizierung wird über **better-auth** umgesetzt, eingebunden **innerhalb** von `apps/api` (NestJS), im selben Node-Prozess (kein separater Dienst/Container), mit Prisma-Adapter auf der gemeinsamen Postgres-Datenbank.

Vor endgültigem Commitment wird ein **timeboxter technischer Spike** zu Beginn von Phase 1 durchgeführt, der das Mounten von better-auth in NestJS (Sessions, CSRF, Rate-Limiting) verifiziert. Bei relevanten Integrationsproblemen ist der dokumentierte Fallback: Passport.js (`@nestjs/passport`, `passport-local`) kombiniert mit `argon2` (Hashing), `@nestjs/throttler` (Rate-Limiting) und einem eigenen, schlanken Session-Store — jeweils etablierte Einzelbausteine, keine Eigenentwicklung von Kryptografie.

Keycloak, Ory Kratos, SuperTokens sowie SaaS-Identity-Provider (Clerk, Auth0, WorkOS) werden für die aktuelle Phase explizit **nicht** eingesetzt. Erneute Bewertung vorgesehen, falls in Phase 7 echte externe SSO-/Verbandsanbindung entsteht.

## Spike-Ergebnis (2026-08-17)

Ein isolierter technischer Spike (NestJS 11, better-auth 1.6.29, Prisma 6.19, außerhalb des Repositorys) hat die Integration erfolgreich verifiziert: direktes Mounten von better-auth auf der Express-Instanz von NestJS ohne Community-Wrapper, korrektes Session-/Cookie-Handling, CORS/Trusted-Origins inklusive serverseitiger Origin-Validierung, E-Mail/Passwort-Login, Passwort-Reset, E-Mail-Verifikation und Session-Revocation. Details siehe [ARCHITEKTUR_FINALISIERUNG.md](../../ARCHITEKTUR_FINALISIERUNG.md), Abschnitt 1.

Zwei zusätzliche, verbindliche Festlegungen aus dem Spike:

- **Prisma wird für Phase 1 auf `^6.x` gepinnt** (nicht `^7`), da Prisma 7 das Datasource-`url`-Feld zugunsten eines Driver-Adapter-Modells entfernt hat und das aktuelle Ökosystem-Tooling überwiegend auf den klassischen Schema-Stil ausgelegt ist.
- Zwei Implementierungs-Gotchas müssen im Phase-1-Setup von `apps/api` beachtet werden: (1) NestJS-Body-Parser muss deaktiviert und nach dem Mounten von better-auth manuell wieder aktiviert werden; (2) Express 5 (NestJS-11-Standard) erfordert die neue Wildcard-Routen-Syntax (`{*splat}`) beim Mounten des better-auth-Handlers.

## Konsequenzen

- Kein zusätzlicher Betriebsdienst, kein zusätzlicher RAM-Verbrauch auf dem VPS.
- Identitätsdaten liegen in derselben Datenbank wie alle übrigen Anwendungsdaten — vereinfachte Datenhaltung, volle Datenhoheit (relevant für DSGVO-taugliche Architektur bei Minderjährigendaten).
- Abhängigkeit von einer vergleichsweise jungen Bibliothek (better-auth, seit 2024) — mitigiert durch dokumentierten Fallback und Versions-Pinning/Security-Monitoring.
- Auth-Logik bleibt im Backend (`apps/api`), nicht im Frontend (`apps/web`) — konsistent mit dem API-First-Prinzip aus [Architecture.md](../Architecture.md).
- Die vorbereitete Subdomain `auth.verevia.app` kann weiterhin auf denselben NestJS-Prozess (bzw. später bei Bedarf auf ein ausgelagertes Auth-Modul) zeigen, ohne dass sich am Datenmodell etwas ändert.

## Bezug

- [Auth-, Identity- und RBAC-Architektur](../../AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)
- [Architektur-Bericht](../../ARCHITEKTUR_BERICHT.md)
- [0001 – Modularer Monolith](./0001-modular-monolith.md)
