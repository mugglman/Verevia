# Phase 1 — Skeleton-Bericht

> Status: Abschlussbericht des Arbeitspakets "Projekt-Skeleton und Entwicklungsgrundlage". Baut auf den ACCEPTED-Entscheidungen aus [ARCHITEKTUR_BERICHT.md](./ARCHITEKTUR_BERICHT.md), [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](./AUTH_IDENTITY_RBAC_ARCHITEKTUR.md) und [ARCHITEKTUR_FINALISIERUNG.md](./ARCHITEKTUR_FINALISIERUNG.md) auf.
>
> Erstellt: 2026-08-17. Ausschließlich technisches Fundament — keine fachlichen Verevia-Features implementiert.

## 1. Ausgangszustand

- Branch: `chore/initial-project-setup` (identisch zum Stand vor Beginn dieses Arbeitspakets), nicht nach `main` gemerged. `main` ist ein reiner Vorfahre dieses Branches (Fast-Forward-Merge wäre technisch unriskant), es wurde aber **kein Merge/Push durchgeführt** — das bleibt eine bewusste, offene Entscheidung für dich.
- Vor Beginn dieses Arbeitspakets lagen aus der vorangegangenen Architekturphase bereits **unverändert uncommittete** Änderungen im Arbeitsverzeichnis (4 geänderte + 8 neue Dokumentationsdateien: `ARCHITEKTUR_BERICHT.md`, `AUTH_IDENTITY_RBAC_ARCHITEKTUR.md`, ADRs 0002–0006 etc.). Diese wurden **nicht committet**, nur ergänzt — es wurde zu keinem Zeitpunkt `git commit`, `git push` oder ein destruktiver Git-Befehl ausgeführt.
- `apps/admin/` existierte als Platzhalterverzeichnis (nur README) und widersprach der ACCEPTED-Entscheidung "keine separate Admin-App" — wurde in diesem Arbeitspaket entfernt (`git rm`, Verzeichnis gelöscht).
- `packages/utils/` (Platzhalter aus der Doku-Phase, nicht Teil der für dieses Arbeitspaket vorgegebenen Paketliste) wurde **unverändert belassen**.
- Keine `package.json`, keine Lockfile, kein Code existierte vor diesem Arbeitspaket — reiner Dokumentationsstand.

## 2. Implementierte Monorepo-Struktur

```
Verevia/
├── apps/
│   ├── web/      Next.js 16 (App Router)
│   └── api/       NestJS 11
├── packages/
│   ├── ui/         Shared-UI-Grundgerüst
│   ├── database/     Prisma-Grundkonfiguration
│   ├── auth/           better-auth-Struktur
│   ├── types/            Shared-Types-Grundgerüst
│   ├── config/             Shared TS-/ESLint-Konfiguration
│   └── utils/                (unverändert, Platzhalter)
├── infrastructure/docker/docker-compose.yml   (lokale PostgreSQL)
├── .github/workflows/ci.yml
├── docs/DEVELOPMENT.md, PHASE_1_SKELETON_REPORT.md
├── pnpm-workspace.yaml, turbo.json, package.json, pnpm-lock.yaml, .npmrc
```

Abweichung vom ursprünglichen Vorschlag im Arbeitsauftrag: **keine `apps/admin`**, wie in den ACCEPTED-Architekturentscheidungen festgelegt.

## 3. Installierte Technologien und Versionen

| Bereich | Technologie | Version |
|---|---|---|
| Runtime | Node.js | ≥ 20 erforderlich (lokal verifiziert: 22 LTS-Ziel für CI, faktisch entwickelt auf 25.2.1) |
| Package Manager | pnpm | 9.15.9 |
| Monorepo | Turborepo | 2.10.10 |
| Sprache | TypeScript | 5.9.3 (bewusst nicht TS 7 "tsgo" — zu neu, siehe Abschnitt 14) |
| Frontend | Next.js | 16.3.1 |
| | React / React DOM | 19.2.8 |
| | Tailwind CSS | 4.3.3 |
| Backend | NestJS (`@nestjs/core` etc.) | 11.2.1 |
| Datenbank | PostgreSQL (lokal, Docker) | 17-alpine |
| ORM | Prisma / `@prisma/client` | 6.19.3 (bewusst `^6.x`, nicht 7 — siehe [ADR 0002](./architecture/adr/0002-authentication-strategy.md)) |
| Auth | better-auth | 1.6.29 |
| Linting | ESLint | 9.39.5 (bewusst `9.x`, nicht 10 — siehe Abschnitt 14) |
| | typescript-eslint | 8.x |
| Testing (Unit) | Vitest | 4.1.10 |
| Testing (API E2E) | Supertest | 7.2.2 |
| Testing (Web E2E) | Playwright | 1.62.1 |
| CI | GitHub Actions | — |

## 4. apps/web

Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS 4, ESLint (`eslint-config-next`), `src/`-Verzeichnisstruktur. Minimale technische Startseite (`Verevia` / `Development Environment` / `System operational`), keine fachlichen Komponenten. Vitest-Unit-Test (`page.smoke.test.tsx`) und Playwright-E2E-Grundgerüst (`e2e/home.spec.ts`) vorhanden.

**Verifiziert:** `pnpm build` erfolgreich, `next start` liefert die Startseite mit korrektem Inhalt (curl-Test, siehe Abschnitt 12).

## 5. apps/api

NestJS 11, TypeScript, `GET /health` → `{"status":"ok"}`, sonst keine fachlichen Controller. Unit-Test (`health.controller.spec.ts`, Vitest) und E2E-Test (`health.e2e-spec.ts`, Supertest) vorhanden. `.swcrc` + `unplugin-swc` für korrekte Dekorator-Metadaten unter Vitest (siehe Abschnitt 14).

**Verifiziert:** `pnpm build` erzeugt lauffähiges `dist/main.js`, `node dist/main.js` + `curl http://localhost:3001/health` liefert `{"status":"ok"}`.

## 6. Packages

- **`packages/ui`** — Grundgerüst, keine Komponentenbibliothek installiert, keine fachlichen Komponenten (shadcn/ui-Grundlage bewusst in `apps/web` vorgesehen, siehe README).
- **`packages/database`** — Prisma **^6.x**, PostgreSQL-Datasource, ein Platzhaltermodell (`HealthCheck`) zur technischen Pipeline-Verifikation. **Kein** fachliches Datenmodell (kein Tenant/Person/RoleAssignment/PersonRelationship/Turnier) — folgt in einem eigenen Arbeitspaket.
- **`packages/auth`** — better-auth-Grundkonfiguration (E-Mail/Passwort, Prisma-Adapter), **noch nicht** in `apps/api` gemountet. Der im vorherigen Arbeitspaket verifizierte Mounting-Ansatz (`toNodeHandler`, `bodyParser: false`, Express-5-Wildcard) ist dokumentiert, aber nicht umgesetzt.
- **`packages/config`** — geteilte TypeScript-Basiskonfigurationen (`base.json`, `nextjs.json`, `nestjs.json`) und eine geteilte ESLint-Flat-Config (`eslint/base.mjs`).
- **`packages/types`** — Grundgerüst, keine fachlichen Domain-Types.

## 7. Lokale Datenbank-Infrastruktur

`infrastructure/docker/docker-compose.yml`: ausschließlich PostgreSQL 17 (Named Volume, Healthcheck). **Kein Redis** — bewusst nicht "vorsorglich" ergänzt, da aktuell technisch nicht benötigt.

**Einschränkung:** Diese lokale Entwicklungsumgebung hat **kein Docker installiert** (weder Docker Desktop noch Colima/Podman) — `docker compose up -d` konnte in dieser Sitzung **nicht ausgeführt und nicht gegen eine echte Instanz verifiziert werden**. Die Compose-Datei wurde stattdessen strukturell geprüft (valides YAML, erwartete Struktur). **Offener Nachtest** auf einer Maschine mit Docker, bevor `db:push` erstmals produktiv genutzt wird.

## 8. Environment-Konzept

`.env.example` aktualisiert um `PORT`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (zusätzlich zu den bereits vorhandenen `NODE_ENV`, `APP_URL`, `API_URL`, `DATABASE_URL`, `TENANT_MODE`). Keine echten Secrets im Repository. `.gitignore` deckt `.env`, `.env.local`, `.env.*.local` bereits korrekt ab.

## 9. Teststruktur

| Ebene | Werkzeug | Ort | Status |
|---|---|---|---|
| Unit (Web) | Vitest + Testing Library | `apps/web/src/app/__tests__/` | grün |
| Unit (API) | Vitest + `@nestjs/testing` | `apps/api/src/health/*.spec.ts` | grün |
| E2E (API) | Supertest | `apps/api/test/health.e2e-spec.ts` | grün |
| E2E (Web) | Playwright | `apps/web/e2e/home.spec.ts` | **vorbereitet, nicht ausgeführt** (Browser-Binaries nicht installiert, kein Pflichtbestandteil der Quality Gates laut Auftrag) |

## 10. CI-Konfiguration

`.github/workflows/ci.yml`: `pnpm/action-setup` + `actions/setup-node` (Node 22, `cache: pnpm`) → `pnpm install --frozen-lockfile` → Lint → Typecheck → Test → Build, bei Push auf `main` und bei Pull Requests. Kein automatisches Deployment. Bestehender `markdown-check.yml` bleibt unverändert bestehen (unabhängiger Workflow).

`pnpm-lock.yaml` wurde dafür aus `.gitignore` entfernt (war zuvor fälschlich ignoriert — ohne committetes Lockfile wäre `--frozen-lockfile` in CI nicht funktionsfähig gewesen und Builds nicht reproduzierbar).

## 11. VPS-Verifikation

**Nicht durchgeführt.** `ssh -o BatchMode=yes maik@vps.verevia.app` schlägt mit `Host key verification failed` fehl — dieser Rechner hat den Host-Key des VPS noch nie akzeptiert. Eine nicht-interaktive Verbindung war daher nicht möglich, ohne entweder (a) den Host-Key ungeprüft zu akzeptieren oder (b) ein Passwort einzugeben — beides sollte gemäß Auftrag nicht eigenmächtig geschehen ("STOPPE an der Passwortabfrage"). Da dieses Tool keine echte interaktive Passwort-Eingabe in Echtzeit unterstützt, wurde der Verbindungsversuch an dieser Stelle abgebrochen, statt ihn zu umgehen.

**Für einen erfolgreichen Verifikationslauf nötig:** Ein interaktives Terminal, in dem du selbst den Host-Key bestätigst und ggf. das Passwort eingibst — anschließend können die in Abschnitt 19 des Auftrags gelisteten Read-Only-Prüfungen (Docker-Version, Netzwerke, `/srv/verevia`-Struktur, Traefik-Status, Speicher/RAM) nachgeholt werden.

## 12. Quality-Gate-Ergebnisse

Alle fünf Befehle wurden **tatsächlich ausgeführt**, mehrfach, zuletzt aus einem vollständig bereinigten Zustand (kein Turbo-Cache, keine `dist/`-Verzeichnisse, keine `.tsbuildinfo`-Dateien):

| Befehl | Ergebnis |
|---|---|
| `pnpm install` | ✅ grün |
| `pnpm lint` | ✅ grün (7/7 Pakete) |
| `pnpm typecheck` | ✅ grün (7/7 Pakete) |
| `pnpm test` | ✅ grün (Unit-Tests web+api, No-Op für database/auth) |
| `pnpm build` | ✅ grün (web, api, database, auth — ui/types ohne eigenen Build-Schritt, siehe Abschnitt 14) |

Zusätzlich manuell verifiziert: `apps/api/dist/main.js` bootet und beantwortet `GET /health` korrekt; `apps/web` liefert nach `next build && next start` die erwartete Startseite. **Keine Prüfung wurde deaktiviert oder umgangen**, um ein grünes Ergebnis zu erzwingen — alle unten in Abschnitt 14 dokumentierten Probleme wurden ursächlich behoben.

## 13. Git-Status

Nach Abschluss: 63 geänderte/neue Pfade, **nichts committet** (weisungsgemäß — Commits erfolgen nur auf explizite Anfrage). `git status --short` enthält keine `node_modules/`, `.next/`, `dist/`, `.env.local`- oder `*.tsbuildinfo`-Einträge; eine grobe Secret-Suche (Private-Key-Marker, AWS-Key-Muster) in den geänderten/neuen Dateien lieferte keinen Treffer. `apps/admin/` wurde per `git rm` entfernt.

## 14. Bekannte Einschränkungen

- **Docker lokal nicht verfügbar** in dieser Entwicklungsumgebung — `docker compose up -d` strukturell, aber nicht funktional verifiziert (siehe Abschnitt 7).
- **VPS-Verifikation nicht durchgeführt** (siehe Abschnitt 11).
- **Playwright-E2E nicht ausgeführt** (Browser-Binaries nicht installiert) — Grundgerüst vorhanden und typecheck-/lint-geprüft, aber nie tatsächlich gegen einen laufenden Server gelaufen.
- **`packages/auth` ist nicht in `apps/api` gemountet** — reine Struktur, wie im Auftrag gefordert.
- **`packages/database` enthält kein fachliches Schema** — wie im Auftrag gefordert.

## 15. Technische Schulden bzw. während der Umsetzung gefundene und behobene Probleme

Diese Punkte wurden **innerhalb dieses Arbeitspakets identifiziert und korrigiert** (keine offenen Schulden mehr, hier zur Nachvollziehbarkeit dokumentiert):

1. **`@types/react-dom@19.2.8` existierte nicht** (tatsächlich aktuell: `19.2.4`) — Versionsangabe korrigiert.
2. **ESLint 10 ist mit dem Next.js-ESLint-Ökosystem noch nicht durchgängig kompatibel**: `eslint-config-next`s transitive Abhängigkeiten (`eslint-plugin-import`, `-react`, `-jsx-a11y`) deklarieren nur `eslint <= 9`. Analog zum Prisma-7-Befund aus der Architekturphase auf **ESLint `^9.x`** zurückgestuft.
3. **`@vitejs/plugin-react@4.x` inkompatibel mit Vite 8** (von Vitest 4 verwendet) — auf `^6.0.5` aktualisiert.
4. **FlatCompat + `eslint-config-next` erzeugte einen `TypeError: Converting circular structure to JSON`** beim Web-Lint. Ursache: `eslint-config-next` liefert seit einigen Next-Versionen bereits ein natives Flat-Config-Array (`eslint-config-next/core-web-vitals`) — der zusätzliche `FlatCompat`-Umweg war unnötig und fehlerhaft. Direktimport behebt das Problem und vereinfacht die Konfiguration (eine Abhängigkeit weniger).
5. **Vitest kann nicht per `require()` geladen werden** — `apps/api/.swcrc` transformierte Testdateien nach CommonJS, Vitest ist aber ESM-only. `module.type` auf `es6` korrigiert.
6. **Playwright- und Vitest-Tests kollidierten** in `apps/web` (beide nutzen standardmäßig `*.spec.ts`) — Vitest-`include`/`exclude` explizit auf `src/**` beschränkt, `e2e/**` ausgeschlossen.
7. **`apps/api` baute ins Leere**: Die geteilte `packages/config/typescript/nestjs.json` enthielt ein relatives `outDir: "./dist"`. Bei `extends` löst TypeScript relative Pfade **relativ zur Basisdatei auf, nicht zum konsumierenden Projekt** — der Build landete unbemerkt in `packages/config/typescript/dist` statt `apps/api/dist`, `nest build` meldete trotzdem Erfolg (Exit 0). Gefunden über Turborepo's eigene Output-Prüfung (`WARNING no output files found`). Behoben, indem `outDir`/`rootDir` aus der geteilten Basiskonfiguration entfernt und stattdessen explizit in `apps/api/tsconfig.build.json` gesetzt wurden — konsistent mit dem bereits korrekten Muster in `packages/database`/`packages/auth`.
8. **Nachfolgend maskierte ein veralteter `tsconfig.build.tsbuildinfo`-Cache denselben Fehlerzustand** ein weiteres Mal: nach manuellem `rm -rf dist` ohne Löschen der zugehörigen `.tsbuildinfo` hielt `tsc --incremental` das (gelöschte) Ergebnis für aktuell und emittierte nichts, meldete aber weiterhin Exit 0. In `docs/DEVELOPMENT.md` als bekannter Stolperstein dokumentiert; betrifft **keine** frischen Checkouts/CI, da `*.tsbuildinfo` über `.gitignore` ausgeschlossen ist.
9. **`pnpm-lock.yaml` war in `.gitignore` fälschlich ausgeschlossen** (Altlast aus der reinen Doku-Phase) — für ein Monorepo mit `--frozen-lockfile`-CI zwingend zu committen. Korrigiert.
10. **`apps/database`/`apps/auth` fehlte `@types/node`** — `process.env`-Zugriffe schlugen beim Typecheck fehl. Ergänzt.

**Verbleibend, bewusst nicht behoben (kein Bug, sondern spätere Entscheidung):**

- Prisma 7 (Driver-Adapter-Modell) und TypeScript 7 ("tsgo") sind beide bereits verfügbar, wurden aber bewusst nicht verwendet — siehe [ADR 0002](./architecture/adr/0002-authentication-strategy.md) für Prisma; TypeScript 7 aus Konsistenzgründen analog zurückgestellt (kein ADR nötig, gleiche Begründung: zu neu für die übrige Tooling-Landschaft).

## 16. Empfohlener nächster Schritt

1. Diesen Bericht sowie den aktuellen Arbeitsstand (63 Pfade, nicht committet) durchsehen und freigeben.
2. Entscheiden: `chore/initial-project-setup` (inkl. sämtlicher Architektur- und Skeleton-Arbeit) nach `main` mergen? Danach committen — bisher wurde weisungsgemäß nichts committet.
3. VPS-Verifikation (Abschnitt 11) in einer interaktiven Sitzung nachholen.
4. `docker compose up -d` auf einer Maschine mit Docker gegen die echte lokale Postgres-Instanz verifizieren, inklusive `pnpm --filter @verevia/database db:push`.
5. Danach erst: eigenes Arbeitspaket für das fachliche Prisma-Schema (Tenant/Person/Membership/RoleAssignment/PersonRelationship/…) aus [Database.md](./database/Database.md) und [ARCHITEKTUR_FINALISIERUNG.md](./ARCHITEKTUR_FINALISIERUNG.md).

## Bezug

- [Architektur-Bericht](./ARCHITEKTUR_BERICHT.md)
- [Auth-, Identity- und RBAC-Architektur](./AUTH_IDENTITY_RBAC_ARCHITEKTUR.md)
- [Architektur-Finalisierung](./ARCHITEKTUR_FINALISIERUNG.md)
- [Lokale Entwicklung](./DEVELOPMENT.md)
