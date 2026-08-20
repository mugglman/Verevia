import { prisma } from "@verevia/database";

/**
 * Resolves the pilot tenant's id from its well-known slug. Direct DB read
 * of `Tenant` is deliberate and safe: `Tenant` carries no RLS policy (it is
 * the root of the tenant hierarchy, not tenant-scoped data itself — see
 * packages/database/prisma/schema.prisma), and this is the ONLY place
 * apps/web touches the database directly. All actual club/department/team
 * DATA still flows through the real, authorized apps/api HTTP endpoints
 * (see ./api.ts) — this function only resolves which tenant to ask about,
 * since this phase has no multi-tenant switcher UI ("kein öffentliches
 * Vereins-Onboarding" — single pilot tenant only, per the Phase 3 work
 * order).
 */
const PILOT_TENANT_SLUG = process.env.PILOT_TENANT_SLUG ?? "tsv-benediktbeuern";

export async function resolvePilotTenantId(): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: PILOT_TENANT_SLUG },
    select: { id: true },
  });
  return tenant?.id ?? null;
}
