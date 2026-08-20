import { PrismaClient } from "@prisma/client";

/**
 * Admin/superuser Prisma client for TEST FIXTURE SETUP/TEARDOWN ONLY.
 * Bypasses RLS entirely — the official postgres Docker image's
 * `POSTGRES_USER` role is a PostgreSQL superuser, and superusers always
 * bypass row-level security regardless of `FORCE ROW LEVEL SECURITY` (see
 * docs/PHASE_2_CORE_REPORT.md, "gefundene Probleme"). Application code and
 * `getTenantPrisma()` are expected to run as the separate, non-superuser
 * `verevia_app` role (see migration `add_non_superuser_app_role`) so that
 * RLS actually applies — never use this client for anything resembling
 * application logic, only for test data setup/teardown.
 */
export function createAdminPrismaForTests(): PrismaClient {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    throw new Error(
      "ADMIN_DATABASE_URL must be set to run RLS integration tests (superuser connection, bypasses RLS for fixture setup).",
    );
  }
  return new PrismaClient({ datasources: { db: { url } } });
}
