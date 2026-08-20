-- Wichtiger Befund während der RLS-Implementierung (siehe
-- docs/PHASE_2_CORE_REPORT.md, Abschnitt "gefundene Probleme"):
--
-- Der über POSTGRES_USER im offiziellen postgres-Docker-Image angelegte
-- Rollenname ist automatisch SUPERUSER. PostgreSQL-Superuser umgehen Row
-- Level Security IMMER, unabhängig von FORCE ROW LEVEL SECURITY - das lässt
-- sich pro Rolle nicht abschalten. Ohne diese Migration liefe die
-- Anwendung faktisch ohne jede RLS-Durchsetzung, obwohl Policies existieren.
--
-- Deshalb: eine dedizierte, NICHT-privilegierte Anwendungsrolle, über die
-- apps/api (und alle Tests) sich verbinden. Migrationen (`prisma migrate
-- dev/deploy`) laufen weiterhin über die ursprüngliche (Owner-)Rolle.
--
-- 'change-me' ist ein bewusster Platzhalter, konsistent mit den übrigen
-- Dev-Zugangsdaten in .env.example und infrastructure/docker/docker-compose.yml.
-- Für jede über lokale Entwicklung hinausgehende Umgebung MUSS dieses
-- Passwort separat (außerhalb der versionierten Migration) gesetzt werden.

DO $$
DECLARE
  db_name text := current_database();
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'verevia_app') THEN
    CREATE ROLE verevia_app WITH
      LOGIN
      PASSWORD 'change-me'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS;
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO verevia_app', db_name);
END
$$;

GRANT USAGE ON SCHEMA public TO verevia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO verevia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO verevia_app;
