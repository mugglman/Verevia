-- Manuelle SQL-Erweiterung (Prisma 6 bildet weder mehrspaltige CHECK-Constraints
-- noch PostgreSQL Row-Level-Security deklarativ ab), siehe
-- docs/PHASE_2_CORE_REPORT.md, Abschnitt "RLS-Implementierung".

-- ---------------------------------------------------------------------------
-- CHECK-Constraint: RoleAssignment-Scope-Konsistenz (ADR 0004)
-- TENANT     => departmentId NULL, teamId NULL
-- DEPARTMENT => departmentId NOT NULL, teamId NULL
-- TEAM       => teamId NOT NULL
-- ---------------------------------------------------------------------------

ALTER TABLE "role_assignment"
ADD CONSTRAINT role_assignment_scope_consistency CHECK (
  ("scopeType" = 'TENANT'     AND "departmentId" IS NULL     AND "teamId" IS NULL) OR
  ("scopeType" = 'DEPARTMENT' AND "departmentId" IS NOT NULL AND "teamId" IS NULL) OR
  ("scopeType" = 'TEAM'       AND "teamId" IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- Row-Level-Security: tenant-partitionierte Tabellen
--
-- Tenant-Kontext wird pro Transaktion über `SET LOCAL app.tenant_id = '<uuid>'`
-- gesetzt (siehe packages/database/src/tenant-prisma.ts). Fail-closed: fehlt
-- der Kontext, liefert current_setting(..., true) NULL, und `"tenantId" = NULL`
-- ist in SQL nie wahr - es werden dann KEINE Zeilen sichtbar, statt aller.
--
-- FORCE ROW LEVEL SECURITY ist zwingend nötig, da die Anwendung sonst als
-- Tabelleneigentümer verbindet und RLS für den Owner standardmäßig NICHT
-- gilt (leicht übersehene PostgreSQL-Falle).
--
-- Je Tabelle vier separate Policies (SELECT/INSERT/UPDATE/DELETE) statt einer
-- FOR ALL-Policy, damit jede Operation einzeln nachvollziehbar und testbar
-- ist (siehe RLS-Integrationstests).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['department', 'team', 'person', 'role_assignment', 'person_relationship']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

    EXECUTE format(
      'CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Explizit KEINE RLS auf: tenant (Wurzel der Hierarchie, siehe schema.prisma-
-- Kommentar), user/session/account/verification/platform_role_assignment
-- (globale Identitätsebene, siehe docs/ARCHITEKTUR_FINALISIERUNG.md Abschnitt 8).
-- ---------------------------------------------------------------------------
