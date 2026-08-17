# Phase 1 — Baseline-Bericht

> Status: Abschlussbericht des Arbeitspakets "Skeleton verifizieren und Baseline herstellen". Baut auf [PHASE_1_SKELETON_REPORT.md](./PHASE_1_SKELETON_REPORT.md) auf (Status dort: SKELETON READY).
>
> Erstellt: 2026-08-17. Ausschließlich Verifikation und Baseline-Herstellung — keine fachlichen Verevia-Features implementiert, keine Production-Anwendung auf dem VPS installiert.

## 1. Git-Ausgangszustand

- Branch zu Beginn: `chore/initial-project-setup`, identisch mit `origin/chore/initial-project-setup` (keine Divergenz), 4 Commits vor `main`, 0 Commits zurück — `main` ist ein reiner Vorfahre.
- Uncommittete Änderungen aus den vorangegangenen Arbeitspaketen (Architekturdokumente + Skeleton) lagen vollständig im Arbeitsverzeichnis vor.
- `apps/admin/README.md`-Löschung war bereits gestaged (`git rm --cached` aus einer früheren Sitzung).

## 2. Docker-Version (lokal)

**Nicht verfügbar.** Weder Docker Desktop noch Colima/Podman auf dieser Entwicklungsmaschine installiert (`docker`, `docker compose`: command not found). Auf ausdrücklichen Wunsch **nicht** durch Installation eines lokalen Ersatzes (Homebrew-PostgreSQL oder Docker Desktop) umgangen. Stattdessen: Verifikation auf dem VPS (Abschnitt 3).

## 3. PostgreSQL-Test / 4. Prisma/PostgreSQL-Verifikation

**Isoliert auf dem Verevia-VPS (`verevia-dev`-Netzwerk) durchgeführt**, da lokal kein Docker verfügbar ist.

Vorgehen:

1. Temporärer, eindeutig gekennzeichneter Container `verevia-tmp-verify-postgres` (Labels `verevia.purpose=temporary-verification`), Image `postgres:17-alpine`, **ausschließlich** auf dem internen Docker-Netzwerk `verevia-dev` — **kein Host-Port-Mapping** (`docker port` liefert keinen Eintrag). Eigenes, für den Test neu erzeugtes Volume `verevia-tmp-verify-pgdata`.
2. `pg_isready` bestätigt: `accepting connections`.
3. Temporärer Einweg-Container `verevia-tmp-verify-runner` (Image `node:22-alpine`, `--rm`, selbes Netzwerk) mit `@prisma/client`/`prisma` **exakt in Version 6.19.3** (identisch zur Monorepo-Baseline), minimalem Test-Schema (`VerifyPing`) und Testskript:
   - `npm install` → OK
   - `prisma db push` → `Your database is now in sync with your Prisma schema` (196ms)
   - `$connect()` → OK
   - `create()` (Insert) → OK, UUID zurückgegeben
   - `count()` → `1` → korrekt
   - `deleteMany()` (Cleanup) → OK
   - `$disconnect()` → OK

**Ergebnis: Prisma 6.19.3 ↔ PostgreSQL 17 real verifiziert, vollständig erfolgreich.** Kein produktives Datenmodell, keine Migration — ausschließlich der technische Nachweis wie gefordert.

### Cleanup

- `verevia-tmp-verify-postgres` gestoppt und entfernt.
- `verevia-tmp-verify-pgdata`-Volume entfernt.
- Test-Arbeitsverzeichnis auf dem VPS entfernt (root-owned `node_modules`-Reste eines vorangegangenen Cleanup-Versuchs über einen `alpine`-Hilfscontainer beseitigt, da vom `node:22-alpine`-Container als root erzeugt).
- **Nicht entfernt** (bewusst, nicht Teil des Auftrags): die drei gezogenen Docker-Images (`postgres:17-alpine`, `node:22-alpine`, `alpine:latest`, zusammen ca. 670 MB) verbleiben im lokalen Image-Cache des VPS — reine Layer-Caches, nichts läuft, kein Sicherheits- oder Betriebsrisiko. Auf Wunsch in einem späteren Schritt per `docker image rm` entfernbar.
- Verifiziert: `docker ps`/`docker ps -a` nach Cleanup zeigen ausschließlich weiterhin `verevia-traefik` (unverändert seit vor diesem Arbeitspaket), `docker volume ls` zeigt keine `verevia-tmp-*`-Einträge mehr.

## 5. VPS-Verifikation

- **SSH-Host-Key**: per `ssh-keyscan` (read-only, kein Verbindungsversuch) abgerufen, dir zur Bestätigung vorgelegt (ED25519 `SHA256:DZye+PkRYHPODvNXXK5EHsEq5285LjMYUzrxtD2jht0`, RSA, ECDSA ebenfalls gezeigt) — **von dir bestätigt**, danach erst in `known_hosts` übernommen.
- **Zugriff**: Da Passwort-Authentifizierung nicht automatisiert durchführbar ist und du das ausdrücklich nicht selbst per Copy-Paste-Kommando erledigen wolltest, wurde ein **sitzungsgebundenes, temporäres SSH-Schlüsselpaar** erzeugt. Den Public Key hast du manuell (per deinem bestehenden Passwort-Login) zu `~/.ssh/authorized_keys` hinzugefügt. Nach einem ersten fehlgeschlagenen Versuch (Datei-/Verzeichnisrechte) hast du `chmod 700 ~/.ssh` / `chmod 600 ~/.ssh/authorized_keys` korrigiert — danach erfolgreich verbunden.
- **Root-SSH**: nicht verwendet, ausschließlich `maik`.
- **Nach Abschluss**: Temporärer Key aus `~/.ssh/authorized_keys` auf dem VPS entfernt (`sed -i`) und lokal gelöscht — verifiziert durch einen fehlschlagenden Verbindungsversuch danach. Kein dauerhafter Zugriff verbleibt.

### Bestandsprüfung (read-only)

| Prüfung | Ergebnis |
|---|---|
| `whoami` | `maik` |
| `hostnamectl` | Ubuntu 24.04.4 LTS, Kernel 6.8.0-137-generic, KVM-VM |
| `uptime` | 6:44 h, Load Average 0.00/0.00/0.00 |
| `df -h` | `/` 96G, 3.9G belegt (5 %), 92G frei |
| `free -h` | 7.8Gi RAM gesamt, 495Mi belegt, 6.3Gi frei, 2.0Gi Swap ungenutzt |
| `docker --version` | Docker 29.7.2 |
| `docker compose version` | v5.4.0 |
| `docker ps` (vor Test) | ausschließlich `verevia-traefik` (4h Uptime) |
| `docker network ls` | `verevia-dev`, `verevia-prod`, `verevia-proxy` (+ Standardnetzwerke) vorhanden |
| `ufw status` | **nicht geprüft** — erfordert `sudo`-Passwort, das gemäß Auftrag nicht angefordert/eingegeben wurde |
| `systemctl --failed` | 0 fehlgeschlagene Units |
| `/srv/verevia` | `backups/`, `dev/`, `prod/`, `shared/` — wie dokumentiert |
| `/srv/verevia/shared/traefik` | `compose.yml`, `config/`, `letsencrypt/` — wie dokumentiert |

**Keine Konfiguration verändert.** UFW/Fail2Ban/SSH/Traefik/DNS/Docker-Netzwerke/Production-Verzeichnisse/persistente Daten wurden nicht angefasst.

## 6. Traefik-Status

`verevia-traefik` (Image `traefik:v3.7.10`) läuft seit 4 Stunden stabil, Ports `0.0.0.0:80`/`0.0.0.0:443` korrekt gebunden (öffentlicher Reverse Proxy — das ist hier richtig, im Unterschied zu PostgreSQL). Letzte 50 Log-Zeilen zeigen ausschließlich normalen Internet-Hintergrundrauschen-Traffic (automatisierte Scans nach `/`, `/.env`, `/.git/config` etc.), durchgängig korrekt mit `404` beantwortet — kein Router matcht, kein Fehlverhalten.

## 7. HTTPS-/DNS-Test

| Domain | DNS | TLS | HTTP-Status | Interpretation |
|---|---|---|---|---|
| `verevia.app` | ✅ auflösbar | Traefik-Default-Zertifikat (selbstsigniert, `CN=TRAEFIK DEFAULT CERT`) | 404 | Erwartet: kein Router konfiguriert, daher kein Let's-Encrypt-Zertifikat für diesen Host, Traefik antwortet mit seinem Fallback-Zertifikat + 404 |
| `app.verevia.app` | ✅ | wie oben | 404 | wie oben |
| `api.verevia.app` | ✅ | wie oben | 404 | wie oben |
| `status.verevia.app` | ✅ | **gültiges Let's-Encrypt-Zertifikat** (`CN=status.verevia.app`, Issuer `Let's Encrypt R-Serie`, gültig bis 15.11.2026) | 404 | Vom früheren Testcontainer stammendes Zertifikat, weiterhin gültig; kein aktueller Router, daher 404 von Traefik selbst |

**Kein Problem, kein lokaler TLS-Bug** — zur Kontrolle wurde die generelle TLS-Verifikationsfähigkeit dieser Maschine gegen `google.com` bestätigt (Status 200). Das Verhalten für `verevia.app`/`app.…`/`api.…` ist exakt das erwartbare Verhalten ohne konfigurierten Router (siehe Auftrag, Abschnitt 7).

## 8. Gitignore-Prüfung

Alle geforderten Fälle mit `git check-ignore` verifiziert:

| Datei/Muster | Erwartung | Ergebnis |
|---|---|---|
| `.env`, `.env.local`, `.env.production`, `.env.development` | ignoriert | ✅ |
| `node_modules/`, `.next/`, `dist/`, `coverage/` | ignoriert | ✅ |
| Playwright-Artefakte (`test-results/`, `playwright-report/`) | ignoriert | ✅ (neu ergänzt) |
| lokale Datenbanken (`*.sqlite` u. ä.) | ignoriert | ✅ (neu ergänzt) |
| `pnpm-lock.yaml` | **versioniert** | ✅ (war zuvor fälschlich ignoriert — behoben) |
| `.env.example` | **versioniert** | ✅ |
| `package.json`, `apps/web/package.json` | **versioniert** | ✅ |

Zusätzlich behoben: `.env.production`/`.env.development`/`.env.test` waren zuvor **nicht** von den bestehenden Mustern erfasst (nur `.env` exakt und `.env.*.local`) — ergänzt. Eine fehlerhafte, nicht als Kommentar markierte Zeile (fehlendes `#`) am Dateiende korrigiert.

## 9. Dependency-Baseline

Gegen die Vorgabe geprüft — **vollständig konsistent, keine Abweichung**:

| Vorgabe | Tatsächlich (Monorepo-weit einheitlich) |
|---|---|
| Next.js 16.x | 16.3.1 |
| React 19.x | 19.2.8 |
| NestJS 11.x | 11.2.1 |
| Prisma 6.19.x | 6.19.3 (`prisma` und `@prisma/client` identisch) |
| better-auth 1.6.x | 1.6.29 |
| TypeScript 5.9.x | 5.9.3 (in allen 7 Packages identisch) |
| ESLint 9.x | `^9.18.0` (resolved 9.39.5, in allen 7 Packages identisch) |
| Vitest 4.x | 4.1.10 |
| Playwright 1.x | 1.62.1 |

**Keine Major-Upgrades durchgeführt.** Prisma 7, TypeScript 7 ("tsgo"), ESLint 10 bewusst nicht verwendet (siehe [ADR 0002](./architecture/adr/0002-authentication-strategy.md) für Prisma; die anderen beiden aus konsistenten Gründen analog zurückgestellt).

## 10. Quality Gates

Aus vollständig bereinigtem Zustand (kein Turbo-Cache, keine `dist/`/`.next/`-Verzeichnisse, keine `.tsbuildinfo`-Dateien, alle kontrolliert vorab entfernt):

| Befehl | Ergebnis |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ (`Lockfile is up to date, resolution step is skipped`) |
| `pnpm lint` | ✅ 7/7 Pakete, keine Warnungen |
| `pnpm typecheck` | ✅ 7/7 Pakete |
| `pnpm test` | ✅ (Unit-Tests web+api grün, No-Op für database/auth) |
| `pnpm build` | ✅ (web, api, database, auth — vollständige `dist/`/`.next/`-Outputs verifiziert, **keine** Turbo-Warnung zu fehlenden Outputs mehr) |

Keine Prüfung deaktiviert oder umgangen.

## 11. Git-Status (vor Commit)

64 geänderte/neue Pfade (50 neu, 13 geändert, 1 gelöscht). Keine `node_modules/`, `.next/`, `dist/`, `.env.local`/`.env.production`, `*.tsbuildinfo`, `test-results/`, `playwright-report/`, `*.sqlite`. Grobe Secret-Suche (Private-Key-Marker, AWS-Key-Muster) in Diff: keine Treffer.

## 12. Commit-/Branch-Status

- **Empfehlung A gewählt**: Commit direkt auf `chore/initial-project-setup` (Begründung: Branch existiert exakt für diesen Zweck, keine Divergenz zu `main`, inhaltlich durchgängige Fortsetzung der bisherigen Arbeit).
- Vorschau (Branch, Dateianzahl, geplante Commit-Message, Secret-Check) vor dem Commit gezeigt und von dir bestätigt.
- Commit erstellt: `f359df1` — *"chore: initialize Verevia monorepo skeleton and finalize architecture docs"* (83 Dateien nach `git add -A`, da einige zuvor als Verzeichnis-Eintrag gezählte Pfade beim Staging in Einzeldateien aufgelöst wurden).
- **Gepusht** nach `origin/chore/initial-project-setup` (kein Force-Push, keine History-Rewrite, reines Fast-Forward-Anhängen) — auf deine ausdrückliche Bestätigung hin.
- `main` **nicht** angerührt, kein PR erstellt — PR-nach-main bleibt ein separater, noch zu entscheidender Schritt.

## 13. Gefundene Probleme

1. `.env.production`/`.env.development`/`.env.test` waren nicht von `.gitignore` erfasst.
2. Fehlerhafte, nicht auskommentierte letzte Zeile in `.gitignore` (fehlendes `#`).
3. Playwright-Artefakte und lokale Datenbank-Dateien waren nicht in `.gitignore` berücksichtigt.
4. Lokales Docker-Compose für PostgreSQL band den Port implizit auf `0.0.0.0` statt `127.0.0.1` (kein akutes Risiko lokal, aber unnötig offen).
5. SSH-Host-Key von `vps.verevia.app` war auf dieser Maschine noch nicht vertraut (erwartungsgemäß, erster Verbindungsversuch).
6. Temporärer SSH-Key wurde nach dem Hinzufügen zunächst nicht akzeptiert (Datei-/Verzeichnisrechte von `~/.ssh`/`authorized_keys` auf dem VPS).
7. Cleanup der Prisma-Testumgebung auf dem VPS scheiterte zunächst an root-owned `node_modules`-Dateien (vom Node-Container als root erzeugt).

## 14. Vorgenommene Korrekturen

1. `.gitignore` um `.env.production`/`.env.development`/`.env.test`, Playwright-Artefakte (`test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`) und lokale DB-Dateien (`*.db`, `*.sqlite`, `*.sqlite3`) ergänzt.
2. Fehlerhafte Kommentarzeile in `.gitignore` korrigiert (`#`-Präfix ergänzt).
3. `infrastructure/docker/docker-compose.yml`: Postgres-Port explizit auf `127.0.0.1:5432:5432` gebunden statt implizit `0.0.0.0`, inklusive Kommentar zur Begründung und expliziter Vorgabe für die spätere Production-Konfiguration (kein Host-Port-Mapping überhaupt, nur internes Docker-Netzwerk).
4. Host-Key nach deiner Bestätigung in `known_hosts` übernommen.
5. Du hast die Dateirechte auf dem VPS korrigiert (`chmod 700 ~/.ssh`, `chmod 600 ~/.ssh/authorized_keys`) — danach Verbindung erfolgreich.
6. Root-owned Cleanup-Reste über einen `alpine`-Hilfscontainer (der die Dateien mit denselben Rechten wieder entfernen kann) beseitigt.

## 15. Verbleibende Risiken

- **UFW-Status nicht verifiziert** (sudo-Passwort nötig, nicht abgefragt) — sollte in einer Sitzung mit direktem sudo-Zugriff nachgeholt werden, bevor produktive Dienste exponiert werden.
- **Drei Docker-Images verbleiben im VPS-Cache** (postgres/node/alpine, ~670 MB) — kein Risiko, aber unnötiger Speicherverbrauch; bei Bedarf entfernbar.
- **`packages/database` enthält weiterhin kein fachliches Schema** — die Prisma/Postgres-Verifikation lief gegen ein Wegwerf-Schema (`VerifyPing`), nicht gegen das künftige Domainmodell.
- **PR nach `main` noch nicht erstellt** — bewusst offen gelassen, eigene Entscheidung von dir.
- Bereits aus dem Skeleton-Bericht bekannt und weiterhin gültig: Playwright-E2E nie tatsächlich ausgeführt (Browser-Binaries fehlen), `packages/auth` nicht in `apps/api` gemountet.

## 16. Empfehlung für Phase 2

1. PR von `chore/initial-project-setup` nach `main` erstellen (Inhalt: Architekturphase + Skeleton + diese Baseline-Verifikation als ein zusammenhängender, review-fähiger Umfang).
2. UFW-Status bei Gelegenheit mit direktem sudo-Zugriff nachholen.
3. Danach: eigenes Arbeitspaket für das fachliche Prisma-Schema (Tenant/Person/Membership/RoleAssignment/PersonRelationship/…) aus [Database.md](./database/Database.md) und [ARCHITEKTUR_FINALISIERUNG.md](./ARCHITEKTUR_FINALISIERUNG.md) — die technische Prisma/PostgreSQL-Pipeline ist jetzt nachweislich funktionsfähig.

## Bezug

- [Phase-1-Skeleton-Bericht](./PHASE_1_SKELETON_REPORT.md)
- [Architektur-Finalisierung](./ARCHITEKTUR_FINALISIERUNG.md)
- [Lokale Entwicklung](./DEVELOPMENT.md)
