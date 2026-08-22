# Phase 7 – Permanentes DEV-Deployment auf Hostinger

## 1. Phase-6-PR/Merge

PR #6 (`feat(identity): implement guardian relationships and account invitations`) war vollständig grün (Install/Lint/Typecheck/Test/Build + 2× markdown-lint), `mergeable_state: clean`, 0 offene Reviews/Kommentare, 0 Secret-Scanning-Alerts. Per `gh pr merge --squash` gemergt, Merge-SHA `6cd463d`. `main` lokal aktualisiert.

## 2. Branch

`chore/dev-deployment` von `main` (`6cd463d`) erstellt.

## 3. Architektur

Die permanente DEV-Umgebung läuft als drei Docker-Container (`verevia-dev-postgres`, `verevia-dev-api`, `verevia-dev-web`) auf dem bestehenden Hostinger-VPS, hinter der bereits produktiv laufenden, unveränderten `verevia-traefik`-Instanz. `/srv/verevia/dev` ist ein echter Git-Checkout dieses Repositories (Branch `chore/dev-deployment`) — Images werden direkt dort per `docker compose build` erzeugt (kein GHCR/CI-Image-Push in dieser Phase, siehe „Nächster Schritt"). Ein viertes, nicht-dauerhaftes `migrate`-Service (gebaut aus derselben `api.Dockerfile`, Target `builder`) führt Migrationen und Seed als Einmal-Job aus (`docker compose run --rm migrate`), läuft nicht dauerhaft mit.

## 4. Container

| Container | Image | Zweck | Restart-Policy |
|---|---|---|---|
| `verevia-dev-postgres` | `postgres:17-alpine` | Datenbank, persistentes Volume `docker_verevia-dev-postgres-data` | `unless-stopped` |
| `verevia-dev-api` | selbstgebaut aus `infrastructure/docker/api.Dockerfile` (Target `runner`) | NestJS-API | `unless-stopped` |
| `verevia-dev-web` | selbstgebaut aus `infrastructure/docker/web.Dockerfile` (Target `runner`) | Next.js-Web | `unless-stopped` |
| `verevia-dev-migrate` | wie api, Target `builder` | Einmal-Job: Migrationen + Seed | `no` (kein Dauerbetrieb) |

Beide Anwendungs-Dockerfiles sind mehrstufig (`turbo prune` → vollständiger Install inkl. DevDependencies für den Build → separater, reiner Produktions-Install ohne DevDependencies → schlankes, non-root Runtime-Image). `apps/api`/`apps/web` laufen im Runtime-Image als eigens angelegter, nicht-privilegierter User `verevia` (UID 1001); `postgres` läuft — wie im offiziellen Image vorgesehen — mit seinem eigenen `postgres`-OS-User für den eigentlichen Serverprozess (verifiziert per `docker exec ... ps aux`, root wird nur transient vom Entrypoint-Skript für die initiale Verzeichnis-Berechtigung verwendet).

## 5. Netzwerke

- `verevia-dev` (bereits vor Phase 7 auf dem VPS vorbereitet, `external: true` in Compose): internes Backend-Netzwerk. `postgres` hängt **ausschließlich** hier — kein veröffentlichter Host-Port, kein `0.0.0.0:5432`, verifiziert per `docker ps` (Spalte PORTS zeigt nur `5432/tcp`, keine Host-Bindung).
- `verevia-proxy` (ebenfalls vorbereitet): das Netzwerk, das Traefik beobachtet (`providers.docker.network: verevia-proxy`, `exposedByDefault: false` — unverändert in der bestehenden Traefik-Konfiguration). Nur `api`/`web` hängen hier zusätzlich zu `verevia-dev`, `postgres` nie.

## 6. Domains

`https://app.verevia.app` → `verevia-dev-web:3000`, `https://api.verevia.app` → `verevia-dev-api:3001`, beide über Traefik-Labels an den jeweiligen Containern geroutet (`Host(...)`-Regel, Entrypoint `websecure`, TLS-Resolver `letsencrypt` — exakt die bereits bestehende, unveränderte Traefik-Konfiguration unter `/srv/verevia/shared/traefik`). `status.verevia.app` (bereits vorbereitet, aus einer früheren Verifikation) bleibt unangetastet.

## 7. HTTPS

Beide Domains besitzen gültige Let's-Encrypt-Zertifikate (Issuer `Let's Encrypt YR1`/`YR2`, Subject exakt `app.verevia.app`/`api.verevia.app`, ausgestellt beim ersten Start der Container, gültig bis 20.11.2026), extern per `openssl s_client` verifiziert — keine Traefik-Default-/Fallback-Zertifikate. `http://` auf beiden Domains liefert einen `308`-Redirect auf `https://` (Traefiks globale Entrypoint-Weiterleitung `web → websecure`, nicht pro Router konfiguriert, war bereits vorhanden).

## 8. Secrets-Konzept

Reale Secrets liegen ausschließlich in `/srv/verevia/dev/infrastructure/docker/.env` auf dem VPS (`chmod 600`, Owner `maik`), niemals committed (`.gitignore`-Muster `.env` erfasst diesen Pfad, per `git check-ignore -v` verifiziert). Das versionierte Template [`.env.dev.example`](../../infrastructure/docker/.env.dev.example) enthält ausschließlich Platzhalter. Alle Passwörter/Secrets per `openssl rand -base64 32` server-seitig generiert, nie über die Werkzeugausgabe dieser Sitzung angezeigt — mit einer Ausnahme, siehe Abschnitt 21 (Risiken/Vorfall).

## 9. Datenbank

PostgreSQL 17, persistentes benanntes Docker-Volume (`docker_verevia-dev-postgres-data`) — durch einen `docker compose restart` **und** eine ungeplante Container-Neuerstellung (ausgelöst durch eine spätere `.env`-Änderung, siehe Abschnitt 21) hindurch verifiziert unverändert erhalten geblieben (Tenant/4 Personen/User-Zähler vor und nach identisch). Zwei-Rollen-Modell wie in der lokalen Entwicklung: `verevia` (Superuser, nur für Migrationen) und `verevia_app` (nicht-privilegiert, für die laufenden api/web-Container) — das migrationseigene, hartkodierte Platzhalterpasswort der `verevia_app`-Rolle (`'change-me'`, siehe `add_non_superuser_app_role`-Migration) wurde nach dem ersten Migrationslauf per `ALTER ROLE verevia_app WITH PASSWORD ...` auf ein echtes, generiertes Secret geändert und die Verbindung mit dem neuen Passwort verifiziert.

## 10. Migrationen

`prisma migrate deploy` aus dem `migrate`-Einmal-Container gegen die leere, frisch erzeugte DEV-Datenbank ausgeführt — alle 8 Migrationen erfolgreich angewendet, anschließend `prisma migrate status` → „Database schema is up to date!". Kein `prisma db push` verwendet.

## 11. Seed

`tsx prisma/seed.ts` im selben `migrate`-Lauf ausgeführt: Tenant „TSV Benediktbeuern", Abteilung „Fußball", Teams E1/E2, vier fiktive Personen (Max Mustermann, Erika Musterfrau, Petra Beispiel, Anna Mustermann) mit Rollen (Trainer/Vereinsadministrator) und der Erziehungsberechtigten-Beziehung (Anna → Max) — wie erwartet, ausschließlich fiktive Daten, keine echten Zugangsdaten im Seed selbst.

## 12. Auth

Better-auth läuft unter `api.verevia.app`, `trustedOrigins` = `https://app.verevia.app`. Session-Cookie: `__Secure-`-Präfix, `Secure`, `HttpOnly`, `SameSite=Lax` — per echtem Login über HTTPS verifiziert (`Set-Cookie`-Header extern per curl geprüft). CORS: `Access-Control-Allow-Origin` exakt `https://app.verevia.app` (kein Wildcard) plus `Allow-Credentials: true`; ein nicht vertrauter Origin (`https://evil-attacker.example`) wird mit `403` server-seitig abgelehnt, nicht nur über fehlende CORS-Header. Damit ist erstmals real verifiziert, was in `docs/ARCHITEKTUR_FINALISIERUNG.md` (Abschnitt 1) als offener Nachtest markiert war: das Zusammenspiel aus Traefik-Reverse-Proxy-Headern, Express `trust proxy` und dem `Secure`-Cookie-Flag unter echter TLS-Terminierung.

**Während der Verifikation gefundener und behobener Fehler:** Der initiale Login-Test über einen echten Browser (Playwright gegen die echten deployten URLs) schlug fehl — nach erfolgreichem serverseitigem Login landete die Seite sofort wieder auf `/login`. Ursache: `app.verevia.app` und `api.verevia.app` sind als eigenständige Domains echte Cross-Origin-Endpunkte; der clientseitige `authClient` ruft `api.verevia.app` per `fetch(credentials:"include")` von `app.verevia.app` aus auf — `SameSite=Lax`-Cookies werden von Browsern jedoch **nicht** an Cross-Origin-`fetch`/`XHR`-Aufrufe angehängt (nur an Top-Level-Navigationen). In lokaler Entwicklung unsichtbar, da dort beide Apps unter `localhost` (nur unterschiedliche Ports, bereits „same-site") laufen. Behoben über better-auths `advanced.crossSubDomainCookies` (`packages/auth/src/index.ts`), aktiviert über eine neue, nur im Deployment gesetzte Umgebungsvariable `COOKIE_DOMAIN=.verevia.app` — dadurch bleibt `SameSite=Lax` erhalten (keine Lockerung auf `None` nötig), da beide Subdomains dann als „same-site" gelten. Nach dem Fix: Login + vollständige Funktionsprüfung (siehe Abschnitt 17) erfolgreich gegen die echten HTTPS-URLs verifiziert.

## 13. Deployment-Ablauf

```bash
# Einmalig / bei Bedarf: Repo auf dem VPS aktualisieren
cd /srv/verevia/dev && git pull origin main   # bzw. der jeweilige Feature-Branch

cd infrastructure/docker
docker compose -f docker-compose.dev-deploy.yml build
docker compose -f docker-compose.dev-deploy.yml up -d postgres
# warten bis postgres healthy, dann:
docker compose -f docker-compose.dev-deploy.yml run --rm migrate
docker compose -f docker-compose.dev-deploy.yml up -d api web
```

Alle Schritte wurden in dieser Phase tatsächlich ausgeführt (nicht nur dokumentiert) — siehe Abschnitte 9–12 und 17–18 für die jeweiligen Ergebnisse.

## 14. Update-Ablauf

Für ein späteres Code-Update (z. B. nach einem Merge nach `main`): `git pull` im Checkout, dann `docker compose build <service>` (nur die geänderten Images neu bauen) gefolgt von `docker compose up -d <service>` (Compose erstellt automatisch nur die betroffenen Container neu, Postgres bleibt unberührt, solange sich dessen eigene Konfiguration/`.env`-Werte nicht ändern — siehe die Beobachtung in Abschnitt 21 zu unerwarteten Neuerstellungen bei `.env`-Änderungen). Falls sich das Datenmodell geändert hat: vor dem Neustart von `api`/`web` erneut `docker compose run --rm migrate`.

## 15. Rollback-Grundidee

Kein automatisiertes Rollback-Tooling in dieser Phase. Grundidee für den manuellen Fall: `git checkout <vorheriger-commit>` im `/srv/verevia/dev`-Checkout, `docker compose build` + `up -d` wie beim normalen Update — funktioniert für reine Code-Rollbacks. Für Schema-Rollbacks (bereits angewendete Prisma-Migration rückgängig machen) existiert **keine** automatisierte Lösung — das ist im aktuellen, noch jungen Zustand des Datenmodells nicht kritisch, sollte aber vor Produktivbetrieb explizit adressiert werden (siehe „Nächster Schritt").

## 16. Backup-Befehl

[`infrastructure/scripts/backup-dev-db.sh`](../../infrastructure/scripts/backup-dev-db.sh), auf dem VPS unter `/srv/verevia/dev/infrastructure/scripts/backup-dev-db.sh` — ein `pg_dump` (liest Zugangsdaten aus `infrastructure/docker/.env`, niemals per Kommandozeilen-Argument) nach `/srv/verevia/backups/verevia-dev-<Zeitstempel>.sql.gz`, `chmod 600`. Real ausgeführt und verifiziert: Dump enthält echte Seed-Daten (`TSV Benediktbeuern` im Dump-Inhalt gefunden), 8,0 KB. Kein Retention-/Rotations-/Offsite-Konzept — bewusst nur die geforderte Baseline, siehe Abschnitt 20.

## 17. Funktionstest

Da der clientseitige Login-Zustand (siehe Abschnitt 12) echtes JavaScript/Hydration erfordert, wurde die Prüfung mit Playwright gegen die **echten** deployten HTTPS-URLs durchgeführt (nicht gegen `localhost`, wie im Auftrag gefordert): echter DEV-Admin-Account (siehe Abschnitt 19) meldet sich über `https://app.verevia.app/login` an → Startseite zeigt „TSV Benediktbeuern" → Abteilung „Fußball" mit Teams E1/E2 → Team-E1-Seite lädt → `/personen` zeigt die vier Seed-Personen inkl. Rollen-Labels („Trainer"/„Vereinsadministrator") und Beziehungs-Labels („Erziehungsberechtigt...") → `/meine-kinder` lädt fehlerfrei. **8/8 Prüfungen erfolgreich.**

## 18. Restart-Test

`docker compose restart` (alle drei Dienste) ausgeführt. Ergebnis: alle drei Container wieder `healthy`, Datenbestand unverändert (Tenant-/Personen-/User-Zähler vor/nach identisch), `https://api.verevia.app/health/ready` weiterhin `200 {"status":"ok","database":"ok"}`, `https://app.verevia.app/` weiterhin korrektes Redirect-Verhalten. Reboot-Resilienz **statisch** verifiziert (kein tatsächlicher VPS-Reboot durchgeführt, wie im Auftrag vorgegeben): alle drei Container `RestartPolicy: unless-stopped`, `systemctl is-enabled docker` → `enabled` — die Kombination stellt sicher, dass sowohl der Docker-Daemon als auch alle drei Container nach einem VPS-Neustart automatisch wieder hochfahren würden.

## 19. DEV-Admin-Testweg

Ein fiktiver DEV-Administrator (`dev-admin@verevia.invalid`, Name „Dev Admin") wurde über den echten better-auth-Signup-Endpunkt (`POST /api/auth/sign-up/email`, gegen die echte HTTPS-URL) angelegt und per `Membership` mit der bereits im Seed vorhandenen `TENANT_ADMIN`-Person „Petra Beispiel" verknüpft. Das generierte Passwort wurde **ausschließlich serverseitig auf dem VPS erzeugt** (`openssl rand`), nie in eine Datei, ein Log oder dieses Dokument geschrieben — es wurde dir im Chat direkt mitgeteilt (siehe Chat-Abschlussbericht), nicht hier. Empfehlung: nach dem ersten eigenen Login das Passwort selbst ändern.

## 20. Backup-Basis

Siehe Abschnitt 16 — vorhanden, getestet, bewusst minimal (kein Retention-/Offsite-Konzept, das bleibt ein späteres Arbeitspaket, siehe „Nächster Schritt").

## 21. Secrets geprüft / Risiken (inkl. Vorfall)

**Sicherheitsvorfall während der Umsetzung (transparent dokumentiert, sofort behoben):** Beim ersten `docker compose config`-Aufruf zur Strukturprüfung wurden versehentlich die vollständig interpolierten Secrets (Postgres-Superuser-Passwort, App-Rollen-Passwort, `BETTER_AUTH_SECRET`) in die Werkzeugausgabe dieser Sitzung geschrieben — zu diesem Zeitpunkt hatte noch **kein** Container diese Werte tatsächlich verwendet (Postgres war zu diesem Zeitpunkt bereits gestartet, aber `api`/`web` noch nicht, und niemand außer dieser Sitzung hatte je Zugriff auf die Werte). Alle drei Secrets wurden unmittelbar danach, vor jeder weiteren Verwendung, neu generiert (rotiert). Für alle folgenden Prüfungen wurde ausschließlich `docker compose config --no-interpolate` verwendet, und jede Passwort-Erzeugung/-Verwendung danach lief als serverseitige Shell-Pipeline auf dem VPS, ohne den Wert je in die Werkzeugausgabe zu schreiben.

Sicherheits-Checkliste (Abschnitt 26 des Auftrags), alle Punkte real geprüft:

- DB nicht öffentlich erreichbar ✓ (kein `0.0.0.0:5432`, kein Host-Port überhaupt)
- Container laufen non-root, soweit sinnvoll ✓ (api/web: expliziter User `verevia`; postgres: Serverprozess läuft als `postgres`-User, root nur transient im Entrypoint — Standardverhalten des offiziellen Images)
- Secrets nicht im Git ✓ (`.env` per `.gitignore` erfasst, verifiziert)
- `.env` nicht im Git ✓ (dieselbe Prüfung)
- keine Default-Passwörter im tatsächlichen `.env` ✓ (0 Treffer für `change-me`)
- keine offenen Debug-Ports ✓ (nur die drei erwarteten internen Ports + Traefiks 80/443)
- kein öffentliches Traefik-Dashboard ✓ (unverändert `exposedByDefault: false`, keine Dashboard-Route unter den beiden neuen Domains gefunden)
- HTTPS gültig ✓ (Abschnitt 7)
- Auth-Cookies sicher ✓ (Abschnitt 12)
- CORS restriktiv ✓ (Abschnitt 12, inkl. negativem Test mit fremdem Origin)
- RLS weiterhin aktiv ✓ (`relrowsecurity`/`relforcerowsecurity` = `true` auf den geprüften Tabellen; `verevia_app` sieht ohne gesetzten Tenant-Kontext nachweislich 0 Zeilen trotz vorhandener Daten — fail-closed real gegen die DEV-Datenbank verifiziert)
- App nutzt nicht die Superuser-DB-Verbindung für Requests ✓ (`API_DATABASE_URL`/`WEB_DATABASE_URL` nutzen `verevia_app`, nicht `verevia`)

**Verbleibende Risiken:**

- Kein automatisiertes Image-Build/-Push (GHCR o. ä.) — Images werden direkt auf dem VPS aus dem Checkout gebaut; ein Build-Fehler mitten im Deployment ist manuell zu beheben, kein automatischer Rollback auf ein zuvor funktionierendes Image.
- Postgres wird bei **jeder** Änderung an der gemeinsamen `.env`-Datei von Compose neu erstellt (nicht nur neu gestartet), auch wenn sich für Postgres selbst nichts Inhaltliches ändert — beobachtet, als `COOKIE_DOMAIN` (ein reiner API-Wert) ergänzt wurde. Unschädlich, da das Volume unabhängig vom Container persistiert (real verifiziert, siehe Abschnitt 9), aber ein kurzer, vermeidbarer Moment ohne laufenden Datenbank-Container bei jedem `.env`-Update. Ließe sich durch getrennte `.env`-Dateien pro Service vermeiden — für den aktuellen Umfang als unnötige Komplexität zurückgestellt.
- Kein Backup-Retention-/Rotations-/Offsite-Konzept (Abschnitt 16/20).
- Kein Schema-Rollback-Mechanismus (Abschnitt 15).
- UFW-Status weiterhin nicht verifizierbar ohne `sudo` (wie bereits seit Phase 1 bekannt) — laut Auftrag bewusst nicht angefordert.
- Kleiner, unschädlicher Rückstand: Beim finalen Entfernen des temporären SSH-Schlüssels zeigte eine Zwischenprüfung `wc -l` von `authorized_keys` noch „1 Zeile" statt der erwarteten 0 — der Zugriff war zu diesem Zeitpunkt (korrekt) bereits entzogen, sodass sich das nicht mehr aufklären ließ. Der erneute Verbindungsversuch mit dem entfernten Schlüssel schlug wie erwartet fehl (siehe Abschnitt 22), das eigentliche Sicherheitsziel ist damit erreicht; der genaue Dateiinhalt bliebe bei Gelegenheit manuell zu prüfen.

## 22. Quality Gates

Lokal: `pnpm install --frozen-lockfile`/`lint`/`typecheck`/`test`/`build` — alle grün (51+46 Tests). Deployment: `docker compose config` (strukturell, ohne Secrets in der Ausgabe), Images gebaut, Container gestartet, Migrationen, Seed, Healthchecks, HTTPS, Login, Funktions-/Smoke-Test gegen die echten deployten URLs, Restart-Test — siehe die jeweiligen Abschnitte oben. Keine Prüfung deaktiviert oder umgangen.

## 23. GitHub/PR

Branch `chore/dev-deployment`, mehrere Commits (Infrastruktur-Grundgerüst, `apps/web/public`-Fix, `NODE_ENV`-Fix, Cross-Subdomain-Cookie-Fix), gepusht. **PR wird im Anschluss an diesen Bericht erstellt, bewusst nicht gemergt.**

## 24. Verevia-prod

Nicht angefasst: keine Traefik-Konfigurationsänderung außerhalb neuer Container-Labels, kein `verevia-prod`-Netzwerk verwendet, keine Produktiv-DB erzeugt, keine Produktiv-Secrets erzeugt, keine DNS-Änderung, keine echten Nutzerdaten verwendet.

## 25. Nächster empfohlener Schritt

Aus rein technischer Sicht ist die permanente DEV-Umgebung vollständig funktionsfähig und verifiziert. Sinnvolle nächste Schritte, keiner davon in dieser Phase begonnen: (a) automatisierter Image-Build/-Push über GitHub Actions statt Build direkt auf dem VPS, (b) ein ausgearbeitetes Backup-Retention-/Restore-Test-Konzept vor jedem Produktivbetrieb, (c) ein echter Mail-Provider (weiterhin aus Phase 6 offen), (d) ein eigenständiges Arbeitspaket für die eigentliche Produktivumgebung (`verevia-prod`), sobald das fachlich gewünscht ist.
