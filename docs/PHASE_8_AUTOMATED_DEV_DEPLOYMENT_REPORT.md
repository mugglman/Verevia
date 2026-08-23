# Phase 8 – Automatisiertes DEV-Deployment

## 1. Phase-7-PR/Merge

PR #7 (`chore(deploy): add persistent Verevia development environment`) war vollständig grün, `mergeable_state: clean`, 0 offene Reviews/Kommentare, 0 Secret-Scanning-Alerts. Per `gh pr merge --squash` gemergt, Merge-SHA `6fdd563`. `main` lokal aktualisiert.

## 2. Branch

`chore/automated-dev-deployment` von `main` (`6fdd563`) erstellt.

## 2a. Nachtrag: PR #8 gemergt, vollständiger realer End-to-End-Nachweis

PR #8 war vollständig grün (`mergeable_state: clean`, 0 Secret-Scanning-Alerts, keine Änderungen an `verevia-prod` im Diff). Per `gh pr merge --squash` gemergt, Merge-SHA `b8799e2`.

Damit war zum ersten Mal die Voraussetzung erfüllt, die in Abschnitt 6/18 als strukturell blockierend beschrieben war (`workflow_dispatch`/`workflow_run` benötigen den Workflow auf dem Default-Branch). Unmittelbar nach dem Merge:

1. **CI auf `main`**: grün (`gh run watch`, Exit 0).
2. **`workflow_run` tatsächlich automatisch ausgelöst**: ja, ohne manuelles Zutun, unmittelbar nach dem grünen CI-Lauf (`Deploy DEV`, Run-ID `32625837276`).
3. **Build-and-push-Job** (13 min 20 s): API- und Web-Image erfolgreich gebaut und nach GHCR gepusht.
4. **Deploy-Job** (1 min 28 s): SSH als `verevia-deploy`, Forced Command ausgelöst, `deploy-dev.sh` lief vollständig durch — Log-Auszug (aus dem echten GitHub-Actions-Log extrahiert):

   ```text
   ==> Verevia DEV deployment starting: tag=b8799e234067
   ==> [1/8] Updating deployment checkout …
   HEAD is now at b8799e2 chore(ci): automate Verevia development deployment (#8)
   ==> [2/8] Backing up DEV database before touching anything
   Backing up verevia-dev-postgres … /srv/verevia/backups/verevia-dev-20260823T074606Z-b8799e234067.sql.gz
   Done: 8.0K written.
   ==> [4/8] Pulling images for tag b8799e234067
   ==> [6/8] Running migrations (prisma migrate deploy + seed)
   Database schema is up to date!
   Seeded tenant "TSV Benediktbeuern" …
   ==> [7/8] Rolling out api + web (tag b8799e234067)
   ==> [8/8] Healthchecks + smoke test
   ==> Deployment successful: b8799e234067
   ```

5. **GHCR-Verifikation** (öffentlicher, unauthentifizierter Registry-API-Abruf, kein Token nötig): beide Packages vorhanden, jeweils exakt mit den erwarteten zwei Tags — `ghcr.io/mugglman/verevia-api` → `["dev","b8799e234067"]`, `ghcr.io/mugglman/verevia-web` → `["dev","b8799e234067"]`. Der VPS-Pull erfolgte damit nachweislich real und anonym, wie in Abschnitt 3/10 vorhergesagt.
6. **Live-Umgebung**: `https://api.verevia.app/health` → `{"status":"ok","version":"b8799e234067"}` (die neue Version-Anzeige funktioniert also real, nicht nur im vorgezogenen Test aus Abschnitt 18), `/health/ready` → `{"status":"ok","database":"ok"}`, `app.verevia.app` weiterhin korrektes Redirect-Verhalten.
7. **Vollständiger authentifizierter Workflow-Test** (Playwright gegen die echten HTTPS-URLs, mit einem eigens für diesen Test angelegten, danach wieder vollständig entfernten `TENANT_ADMIN`-Testaccount — das ursprüngliche `dev-admin`-Passwort aus Phase 7 lag nicht mehr vor): Login ✓, Startseite zeigt „TSV Benediktbeuern" ✓, Fußball/E1 ✓, Personenverwaltung zeigt die Seed-Personen ✓, Rollen-Labels ✓, Beziehungs-Labels ✓, „Meine Kinder" lädt ✓ — **8/8 Prüfungen erfolgreich**.
8. **Datenintegrität**: 4 Personen/1 Tenant vor und nach dem Deployment identisch (der zwischenzeitlich für Test 7 angelegte fünfte, testeigene Datensatz wurde vollständig wieder entfernt — inklusive eines eigenen kleinen Fehlers dabei: ein erster, an einem SQL-Syntaxfehler gescheiterter Anlegeversuch hinterließ eine verwaiste `Person`-Zeile ohne zugehörige `Membership`/`RoleAssignment`, die bei der Nachkontrolle auffiel und sauber entfernt wurde — am Ende wieder exakt 4 Personen, verifiziert).
9. **Backup-Verifikation**: `verevia-dev-20260823T074606Z-b8799e234067.sql.gz`, 6 243 Bytes, `chmod 600`, enthält 15 `COPY`/`INSERT`-Anweisungen — nicht leer, nicht beschädigt.
10. **Aufräumen**: ein verwaistes anonymes Docker-Volume (Rest eines früheren, in Abschnitt 16 bereits sauber abgeschlossen geglaubten Restore-Test-Containers — `docker rm` ohne `-v` lässt anonyme Volumes zurück) wurde bei dieser Nachkontrolle gefunden und entfernt. Danach: ausschließlich die drei erwarteten DEV-Container + `verevia-traefik`, ausschließlich das eine erwartete benannte Datenvolume.
11. **Security-Re-Check**: keine Secrets im GitHub-Actions-Log (gezielt nach Private-Key-Markern und rohen Secret-Werten gesucht, keine Treffer), `verevia-prod`-Verzeichnis weiterhin leer/unangetastet, alle Docker-Netzwerke unverändert, Traefik weiterhin `running`.

**Ergebnis: die vollständige Kette `main → CI → workflow_run → Image-Build → GHCR-Push → SSH → Forced Command → deploy-dev.sh → Backup → Migration → Rollout → Healthcheck → Smoke-Test` ist jetzt real, zusammenhängend und erfolgreich nachgewiesen** — nicht mehr nur in die in Abschnitt 18 beschriebenen drei unabhängigen Teile zerlegt.

## 3. GHCR

`ghcr.io/mugglman/verevia-api`, `ghcr.io/mugglman/verevia-web`. Repository `mugglman/Verevia` ist **öffentlich** — Packages, die per `GITHUB_TOKEN` aus einem Workflow dieses Repos gepusht werden, sind damit standardmäßig ebenfalls öffentlich lesbar, ohne dass der VPS beim Pull überhaupt ein Credential benötigt (kein `docker login` auf dem VPS nötig — die einfachste, sicherste Variante: kein Pull-Token, der dort verwaltet/rotiert/geleakt werden könnte).

## 4. Image-Naming

`ghcr.io/mugglman/verevia-api` und `ghcr.io/mugglman/verevia-web`, wie im Auftrag vorgegeben.

## 5. Tagging

Jeder Build erhält zwei Tags: `:dev` (gleitend, immer der letzte erfolgreiche `main`-Build — reine Convenience, nicht die Deployment-Referenz) und `:<git-short-sha>` (12 Zeichen, unveränderlich). `docker-compose.dev-deploy.yml` referenziert `${DEPLOY_TAG:-dev}` — `deploy-dev.sh` setzt `DEPLOY_TAG` bei jedem automatisierten Lauf explizit auf den konkreten SHA; der Fallback auf `:dev` greift nur bei einem manuellen `docker compose up` außerhalb des Skripts.

## 6. GitHub Actions

`.github/workflows/deploy-dev.yml`, zwei Jobs:

- **build-and-push**: checkt den deployten Commit aus, baut `api.Dockerfile`/`web.Dockerfile` mit `docker/build-push-action`, pusht beide Tags pro Image nach GHCR. `permissions: contents: read, packages: write` — keine weiteren Rechte.
- **deploy**: schreibt den privaten Schlüssel aus dem Secret in eine temporäre Datei (nie geloggt, am Ende explizit gelöscht), verbindet sich per SSH als `verevia-deploy` und übergibt den Git-Short-SHA als Kommando — der Forced Command auf dem VPS ignoriert alles außer diesem SHA-String ohnehin (siehe Abschnitt 8).

Ausgelöst wird der Workflow durch `workflow_run` auf Abschluss des bestehenden `CI`-Workflows (nur bei `conclusion == success`, nur auf `main`) — die bestehende Quality-Pipeline (`ci.yml`) wurde **nicht verändert**, dieser Workflow reagiert nur auf ihr Ergebnis. Zusätzlich `workflow_dispatch` für manuelle Läufe. `concurrency: verevia-dev-deployment, cancel-in-progress: false` — verhindert parallele Migrationsläufe, bricht aber kein bereits laufendes Deployment ab.

**Wichtige Einschränkung, transparent dokumentiert:** GitHub Actions macht `workflow_dispatch` (und die Sichtbarkeit für `gh workflow run`) ausschließlich für Workflow-Dateien verfügbar, die bereits auf dem Default-Branch existieren — `deploy-dev.yml` liegt bis zum Merge von PR #8 nur auf diesem Feature-Branch. Ein Test über die echte GitHub-Actions-Oberfläche war damit in dieser Phase strukturell nicht möglich, ohne genau die (explizit untersagte) Merge-Aktion vorzunehmen. Wie stattdessen real getestet wurde: siehe Abschnitt 18.

## 7. Deployment-Authentifizierung

Siehe Abschnitt 8/9 — dedizierter, forced-command-eingeschränkter SSH-Key, kein `GITHUB_TOKEN`-basierter Zugriff auf den VPS (der schützt nur GHCR, nicht SSH).

## 8. VPS Deployment-User/Key

**User**: `verevia-deploy`, eigener Linux-User, vom Nutzer selbst per `sudo` angelegt (kein root-Zugriff für Claude erforderlich/verwendet). Mitglied der `docker`-Gruppe.

**Wichtige, unbeschönigte Sicherheitsfeststellung**: Mitgliedschaft in der `docker`-Gruppe ist faktisch mit Root-Rechten auf dem Host gleichzusetzen (ein Mitglied kann trivial `/` in einen Container mounten und darüber als Root auf alles zugreifen). `verevia-deploy` erhält dadurch **keine echte Rechte-Isolation** von `maik` durch Unix-Berechtigungen — was es tatsächlich bekommt, ist eine getrennte Identität (eigener Audit-Trail, eigener widerrufbarer Key) und, als die eigentliche Sicherheitsgrenze, ein SSH-Key, der ausschließlich einen fest hinterlegten Befehl ausführen kann (siehe unten). Das wird hier bewusst nicht als vollständige Isolation dargestellt — keine Scheinsicherheit.

**Key**: `verevia-github-dev-deploy`, dediziertes ED25519-Schlüsselpaar, ausschließlich für Phase 8 erzeugt. Der private Schlüssel wurde **ausschließlich** als GitHub-Actions-Secret (`DEV_SSH_PRIVATE_KEY`) hinterlegt, niemals committed, niemals auf dem VPS gespeichert, und nach erfolgreicher Einrichtung auch von der lokalen Entwicklungsmaschine wieder gelöscht (minimale Restexposition). Der öffentliche Schlüssel wurde vom Nutzer selbst (mangels Claude-sudo-Zugriff) unter `/home/verevia-deploy/.ssh/authorized_keys` hinterlegt.

**`authorized_keys`-Eintrag**:

```text
restrict,command="/srv/verevia/dev/infrastructure/scripts/deploy-dev.sh" ssh-ed25519 AAAA... verevia-github-dev-deploy
```

`restrict` (modernes OpenSSH-Kürzel für `no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc` plus Deaktivierung künftiger Erweiterungen) kombiniert mit `command=` — der Key kann ausschließlich `deploy-dev.sh` auslösen, niemals eine interaktive Shell.

Berechtigungen (vom Nutzer per `sudo` gesetzt, von Claude verifiziert): `/home/verevia-deploy` 750, `/home/verevia-deploy/.ssh` 700, `authorized_keys` 600, jeweils Owner `verevia-deploy:verevia-deploy`.

## 9. Forced Command — real getestet

Alle drei Eigenschaften wurden gegen den echten, permanenten Schlüssel real verifiziert (nicht nur konfiguriert):

- **Keine interaktive Shell**: `ssh -tt ... "whoami"` → `"PTY allocation request failed on channel 0"` — die PTY-Anfrage wird server-seitig abgelehnt, selbst wenn der Client sie explizit anfordert.
- **Kein Port-Forwarding**: ein `-L`-Tunnel wird vom Client zwar lokal geöffnet (normales SSH-Verhalten), aber ein tatsächlicher Verbindungsversuch **durch** den Tunnel liefert `"channel 2: open failed: administratively prohibited: open failed"` — die exakte, eindeutige OpenSSH-Fehlermeldung für eine serverseitig verweigerte `direct-tcpip`-Kanalanfrage.
- **Beliebige Kommandos werden ignoriert**: `ssh ... "whoami; id; cat /etc/passwd"` führt **nicht** diese Befehle aus — stattdessen läuft ausschließlich `deploy-dev.sh`, das den übergebenen String als (ungültigen) Deploy-Tag interpretiert und mit `"Refusing invalid deploy tag: ..."` ablehnt. Das beweist zugleich, dass `deploy-dev.sh`s eigene Eingabevalidierung greift, bevor irgendetwas Sicherheitsrelevantes passiert.

## 10. GHCR-Pull

Da das Repository öffentlich ist, sind die daraus gepushten Packages standardmäßig ebenfalls öffentlich lesbar — der VPS benötigt für `docker compose pull` kein Credential, kein `docker login`, keinen Token, der dort verwaltet werden müsste. **Nicht real getestet in dieser Phase** (siehe Abschnitt 18/22 — Grund: `workflow_dispatch` war strukturell nicht auslösbar, und das lokal verfügbare `gh`-Token hat keinen `write:packages`-Scope für einen manuellen Push-Test). Empfehlung: unmittelbar nach dem Merge von PR #8 den ersten echten automatischen Lauf beobachten und den GHCR-Pull-Schritt dort erstmals real verifizieren.

## 11. Deployment-Script (deploy-dev.sh)

[`infrastructure/scripts/deploy-dev.sh`](../../infrastructure/scripts/deploy-dev.sh), versioniert, 8 Schritte, jeder mit lautem Abbruch (`set -euo pipefail`, non-zero Exit) statt stiller Fehlerbehandlung:

1. Deploy-Tag validieren (strikt: `dev` oder 7–40 Hex-Zeichen — der Wert kann aus einem SSH-Forced-Command-String stammen und wird als nicht vertrauenswürdig behandelt)
2. Checkout aktualisieren (`git fetch && checkout main && reset --hard origin/main` — robust gegenüber jedem Ausgangszustand)
3. DB-Backup (bricht das gesamte Deployment ab, wenn es fehlschlägt — siehe Abschnitt 15)
4. Deploy-Tag in `.env` festhalten
5. Images pullen
6. Postgres sicherstellen (starten + auf `healthy` warten)
7. Migration + Seed als Einmal-Job (bricht bei Fehler ab, **ohne** die laufenden api/web-Container anzufassen — siehe Abschnitt 16)
8. api/web auf die neuen Images aktualisieren, Healthchecks abwarten, externen Smoke-Test gegen `https://api.verevia.app/health` und `https://app.verevia.app/` ausführen

## 12. Compose

`docker-compose.dev-deploy.yml` referenziert jetzt `image: ghcr.io/mugglman/verevia-{api,web}:${DEPLOY_TAG:-dev}` statt `build:` — der VPS baut keinen Sourcecode mehr selbst. Der `migrate`-Service nutzt **dasselbe** `api`-Image (kein separates "Builder"/"Migrate"-Image) — möglich, weil `prisma` und `tsx` von `@verevia/database`s `devDependencies` zu regulären `dependencies` verschoben wurden (siehe Abschnitt 17, gefundener Fehler #1).

## 13. Migration

`prisma migrate deploy` läuft als eigener, kurzlebiger Container (`docker compose run --rm migrate`), **vor** dem Rollout von api/web. Real getestet (siehe Abschnitt 18): alle 8 Migrationen bereits angewendet (`"No pending migrations to apply"`, `"Database schema is up to date!"`), Seed lief danach erfolgreich und idempotent (identische Tenant-ID vor/nach).

## 14. Backup

Vor jedem Deployment, vor jeder Migration — `backup-dev-db.sh <.env> <deploy-tag>`, Dateiname `verevia-dev-<Zeitstempel>-<SHA>.sql.gz`. Ein fehlgeschlagenes Backup (`exit 1`) bricht `deploy-dev.sh` sofort ab, bevor irgendetwas an der laufenden Umgebung verändert wird.

## 15. Retention

Zählbasiert, Standard 14 (Umgebungsvariable `RETENTION_COUNT` überschreibbar), ausschließlich Dateien mit dem Präfix `verevia-dev-` betroffen — real getestet mit `RETENTION_COUNT=2`: bei 4 vorhandenen Dumps wurden korrekt genau die 2 ältesten entfernt, die 2 neuesten blieben erhalten, keine anderen Dateien im Verzeichnis angefasst.

## 16. Restore-Test

Real durchgeführt: ein frischer, komplett separater, temporärer PostgreSQL-17-Container (`verevia-phase8-restore-test`, kein Netzwerk-/Volume-Bezug zur laufenden DEV-Datenbank) wurde gestartet, der neueste Dump per `psql -v ON_ERROR_STOP=1` eingespielt (fehlerfrei, alle `CREATE POLICY`/`ALTER TABLE`-Anweisungen erfolgreich), und die Daten verifiziert: 4 Personen, 1 Tenant ("TSV Benediktbeuern") — exakt wie erwartet. Anschließend vollständig entfernt (`docker rm -f`, keine benannten Volumes verblieben). Die laufende DEV-Datenbank wurde zu keinem Zeitpunkt für diesen Test verwendet oder verändert.

## 17. Migrationsfehler-Verhalten

Migration läuft als eigener Schritt **vor** dem Aktualisieren von api/web (siehe `deploy-dev.sh`, Schritt 7). Schlägt sie fehl, bricht das Skript sofort ab (`exit 1`) — Schritt 8 (Rollout) wird nie erreicht, die zuvor laufenden api/web-Container bleiben unverändert auf der alten Version aktiv. Kein automatischer DB-Schema-Rollback (siehe Abschnitt 19) — bewusst, wie im Auftrag vorgegeben.

## 18. Realer Deployment-Test

**Was strukturell nicht ging**: `deploy-dev.sh`s eigener erster Schritt synchronisiert unbedingt auf den echten `origin/main` — das bedeutet, dass die neue Phase-8-Logik (Registry-Images, `DEPLOY_TAG`, das Skript selbst) grundsätzlich **nicht** über den echten SSH-Forced-Command-Pfad end-to-end vor einem tatsächlichen Merge nach `main` testbar ist, unabhängig davon, wie der Aufruf erfolgt (das gilt gleichermaßen für einen SSH-Aufruf wie für `workflow_dispatch`, siehe Abschnitt 6). Ein erster Versuch, dies über einen rein lokalen Git-Ref-Alias auf dem VPS-Checkout zu umgehen, scheiterte, weil `git fetch origin main` diesen Alias grundsätzlich mit dem tatsächlichen Remote-Stand überschreibt — das wurde live beobachtet (der Checkout sprang auf den alten Phase-7-Stand zurück) und danach sauber wiederhergestellt, keine bleibenden Spuren.

**Was stattdessen real getestet wurde** (bewusst in drei unabhängige, aber jeweils vollständig echte Teile zerlegt, transparent statt eine nicht mögliche durchgehende Kette zu behaupten):

1. **Echter Image-Build** — mit denselben Dockerfiles, die auch GitHub Actions verwenden würde, auf dem VPS gebaut (`docker build -f infrastructure/docker/api.Dockerfile ...`), getaggt exakt wie es der Workflow täte (`:dev` + `:<sha>`). Dabei wurde ein echter Fehler gefunden und behoben (siehe unten).
2. **Echte funktionale Pipeline** — Backup → `DEPLOY_TAG` setzen → Postgres sicherstellen → `docker compose run --rm migrate` → `docker compose up -d api web` → Healthchecks → externer Smoke-Test (`curl` gegen die echten HTTPS-URLs) → Datenintegritätsprüfung (DB direkt) → funktionaler Rauchtest (echter Signup über die echte HTTPS-API) — jeder einzelne Schritt exakt die gleichen Befehle, die `deploy-dev.sh` selbst ausführt, direkt als `verevia-deploy` ausgeführt (nicht über den SSH-Forced-Command-Pfad, um die self-sync-Problematik zu umgehen), gegen die echte laufende Infrastruktur (echtes Postgres, echtes Traefik, echte Domains).
3. **Echte SSH-Zugriffskontrolle** — siehe Abschnitt 9, über den echten Forced-Command-Pfad mit dem echten permanenten Schlüssel.

**Gefundener und behobener Fehler**: `prisma/seed.ts` importiert sein Geschwistermodul über einen relativen Quellpfad (`../src/index`, nicht den kompilierten `dist/`-Output) — im Runtime-Image fehlte `packages/database/src` (nur `dist/` wurde kopiert), wodurch `docker compose run migrate` mit `Cannot find module '../src/index'` fehlschlug. Die Migration selbst war bereits erfolgreich durchgelaufen, nur der Seed-Schritt schlug fehl. Behoben durch Ergänzen von `packages/database/src` in `api.Dockerfile`s Runner-Stage; danach zweimal erfolgreich (Migration + Seed) reproduziert.

**Ergebnis**: Backup ✓, Migration ✓, Seed ✓ (idempotent, gleiche Tenant-ID), Rollout ✓, Healthchecks ✓ (`{"status":"ok","version":"4421031cc78f"}` — die `APP_VERSION`-Anzeige aus Abschnitt „Deployment-Metadaten" funktioniert also ebenfalls real), externer Smoke-Test ✓, Datenintegrität ✓ (4 Personen/1 Tenant/1 User vor und nach identisch, auch über eine zwischenzeitliche Postgres-Container-Neuerstellung hinweg), echter Signup-Rauchtest über HTTPS ✓.

## 19. Rollback

Kein automatisiertes Rollback-Tooling. Manuelles Vorgehen (dokumentiert, nicht gebaut): den gewünschten vorherigen SHA-Tag ermitteln (`docker images` auf dem VPS oder die GHCR-Package-Historie), `DEPLOY_TAG=<alter-sha>` in `infrastructure/docker/.env` setzen, `docker compose pull api web && docker compose up -d api web`. **Code-Rollback ≠ DB-Schema-Rollback** — ein bereits angewendetes `prisma migrate deploy` lässt sich damit nicht automatisch rückgängig machen; bei einer schema-brechenden Migration wäre ein manueller Restore aus einem Backup (Abschnitt 16 zeigt, dass das grundsätzlich funktioniert) der praktikable Weg. Kein Blocker für diese Phase, aber ausdrücklich vor jedem Produktivbetrieb zu formalisieren.

## 20. Security Review

- Deployment-Key minimal berechtigt ✓ (Abschnitt 8/9, real getestet)
- Privater Key ausschließlich als GitHub Secret ✓ (nie committed, nie auf dem VPS, lokale Kopie nach Einrichtung gelöscht)
- Kein Passwort-SSH für die Automation ✓ (ausschließlich Key-basiert)
- DB nicht exponiert ✓ (unverändert seit Phase 7 — kein veröffentlichter Port)
- GHCR-Auth minimal ✓ (kein Token nötig — öffentliches Repo, siehe Abschnitt 3/10)
- Secrets nicht geloggt ✓ — durchgehend `--no-interpolate` bzw. `bash -c` mit `set -a; source .env; set +a` innerhalb eines einzigen sudo-Aufrufs verwendet, nie ein rohes `cat .env`; der Phase-7-Vorfall (versehentlich interpolierte Secrets in Werkzeugausgabe) wiederholte sich in dieser Phase **nicht**
- Backup-Dateien restriktiv berechtigt ✓ (`chmod 600`, verifiziert)
- Kein Production-Zugriff ✓ (`verevia-prod` zu keinem Zeitpunkt berührt)
- Deployment-Script gibt keine Secrets aus ✓ (Passwörter ausschließlich über `PGPASSWORD`-Umgebungsvariable an `docker exec`, nie in `echo`/Log-Zeilen)
- **Offene, unbeschönigte Einschränkung**: Docker-Gruppenmitgliedschaft von `verevia-deploy` = faktische Root-Äquivalenz, siehe Abschnitt 8 — die tatsächliche Sicherheitsgrenze ist der Forced Command, nicht Unix-Berechtigungen.

## 21. Secrets

GitHub Secret: `DEV_SSH_PRIVATE_KEY`. GitHub Variables (bewusst *nicht* als Secret, da nicht geheim): `DEV_SSH_HOST=vps.verevia.app`, `DEV_SSH_USER=verevia-deploy`. Kein GHCR-Token nötig (Abschnitt 10). Keine weiteren Deployment-Secrets — `BETTER_AUTH_SECRET`/DB-Passwörter etc. leben unverändert ausschließlich in `infrastructure/docker/.env` auf dem VPS (Phase 7).

## 22. VPS-Zustand

`verevia-dev-api`/`verevia-dev-web`/`verevia-dev-postgres` laufen mit den durch den echten automatischen Lauf gepushten und gepullten Images (`ghcr.io/mugglman/verevia-{api,web}:b8799e234067`), alle drei `healthy` — dies ist jetzt der reale, durch die GitHub-Actions-Pipeline selbst herbeigeführte Zustand, nicht mehr ein manuell nachgestellter. Restart real getestet (`docker compose restart`, vor dem Merge) — alle Container wieder gesund, Daten unverändert. Ein bei der Nachkontrolle gefundenes verwaistes anonymes Docker-Volume (Rest eines Restore-Tests) wurde entfernt, siehe Abschnitt 2a. `verevia-prod` unangetastet. **Nicht in dieser Phase behoben**, als bekanntes technisches Detail dokumentiert: die Runtime-Images sind mit ca. 1,7 GB deutlich größer als für ein schlankes Node/Nest/Next-Image üblich (üblich wären eher 150–400 MB) — vermutlich verursacht durch die jetzt in den Produktions-Dependencies enthaltenen Prisma-CLI-Engine-Binaries (Abschnitt 12/17). Funktional unproblematisch (92 GB frei auf dem VPS), aber ein sinnvoller Optimierungspunkt für später (z. B. `binaryTargets` in `schema.prisma` auf die tatsächlich benötigte Plattform beschränken).

## 23. Quality Gates

Lokal: `pnpm install --frozen-lockfile`/`lint`/`typecheck`/`test`/`build` — alle grün (52 API-Tests inkl. der neuen Health-Version-Tests, 46 Web-Tests). Deployment: Image-Builds, Backup, Migration, Seed, Rollout, Healthchecks, externer Smoke-Test, Datenintegrität, Restart, Retention, Restore — alle real durchgeführt. **Nach dem Merge zusätzlich**: der komplette echte `workflow_run`-Lauf inkl. GHCR-Push/Pull und authentifiziertem Browser-Workflow-Test — siehe Abschnitt 2a. Damit sind inzwischen alle ursprünglich offenen Punkte aus Abschnitt 18 real abgedeckt.

## 24. GitHub/PR

Branch `chore/automated-dev-deployment`, mehrere Commits, gepusht, PR #8 erstellt und **gemergt** (Merge-SHA `b8799e2`, siehe Abschnitt 2a).

## 25. Verbleibende Risiken

- Runtime-Image-Größe (~1,7 GB) — funktional unproblematisch, aber unnötig groß (Abschnitt 22).
- Kein automatisches DB-Schema-Rollback (Abschnitt 19) — bewusste, dokumentierte Einschränkung, kein Blocker für DEV.
- `verevia-deploy`s Docker-Gruppenmitgliedschaft ist keine echte Privilegientrennung von `maik` (Abschnitt 8/20) — die einzige wirksame Grenze ist der Forced Command, real getestet (Abschnitt 9).
- Backups weiterhin ohne Offsite-Kopie (unverändert aus Phase 7).
- Postgres wird bei jeder Änderung an der gemeinsamen `.env` unnötig neu erstellt (bereits aus Phase 7 bekannt, unverändert) — Daten überleben das nachweislich, aber ein kurzer, vermeidbarer Moment ohne laufende DB pro `.env`-Edit.
- Die für die Ersteinrichtung angelegte temporäre Sudoers-Regel (`/etc/sudoers.d/verevia-claude`, `maik ALL=(verevia-deploy) NOPASSWD: ALL`) ist **nicht** Teil der dauerhaften Architektur und muss vom Nutzer selbst entfernt werden (`sudo rm /etc/sudoers.d/verevia-claude`) — Claude hat dafür keine ausreichenden Rechte (siehe Abschnitt 2a/Sicherheitsprüfung).

## 26. Technische Schulden

- Runtime-Image-Optimierung (Prisma-Engine-`binaryTargets` einschränken, ggf. Multi-Arch-Vermeidung).
- Kein automatisierter, regelmäßiger Restore-Test (nur einmalig, manuell in dieser Phase) — ein wiederkehrender, z. B. wöchentlicher Cron-Restore-Test wäre die konsequente Fortsetzung.
- Kein strukturiertes Deployment-Log/-Historie über die reinen GitHub-Actions-Logs hinaus (z. B. ein `/srv/verevia/backups`-artiges Verzeichnis mit Deployment-Metadaten pro Lauf).
- `.env`-bedingte Postgres-Neuerstellung (siehe Risiken) ließe sich durch getrennte `.env`-Dateien pro Service vermeiden — für den aktuellen Umfang als unnötige Komplexität zurückgestellt.

## 27. Nächster empfohlener Schritt

Der automatisierte DEV-Deployment-Pfad ist jetzt vollständig real nachgewiesen. Sinnvolle nächste Schritte: die temporäre Sudoers-Regel entfernen (siehe Abschnitt 25), Runtime-Image-Größe reduzieren, ein wiederkehrender Restore-Test, und — sobald fachlich gewünscht — ein eigenes Arbeitspaket für die echte Produktivumgebung (`verevia-prod`).
