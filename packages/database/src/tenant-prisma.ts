import type { PrismaClient } from "@prisma/client";
import { prisma } from "./client";

/**
 * Tenant-partitioned models (must match the RLS-enabled tables in
 * prisma/migrations/20260817150231_add_rls_and_scope_constraint).
 * `User`/`Session`/`Account`/`Verification`/`PlatformRoleAssignment` are
 * intentionally excluded — they are the global identity layer, see
 * docs/ARCHITEKTUR_FINALISIERUNG.md, section 8.
 */
const TENANT_SCOPED_MODELS = new Set([
  "Department",
  "Team",
  "Person",
  "RoleAssignment",
  "PersonRelationship",
  "TeamMember",
]);

type ModelDelegate = Record<string, (args: unknown) => unknown>;

/**
 * Returns a tenant-bound Prisma client for the given `tenantId`, per
 * docs/ARCHITEKTUR_FINALISIERUNG.md, section 7 / ADR 0006.
 *
 * `tenantId` is captured by closure at call time rather than re-derived from
 * `AsyncLocalStorage` inside the extension callback — deliberately. An
 * earlier implementation read `getTenantContext()` from within
 * `$allOperations`, but Prisma's query engine dispatch does not reliably
 * preserve `AsyncLocalStorage` continuity into that callback (verified while
 * building this: the context was consistently `undefined` inside
 * `$allOperations` even though it was clearly set via `runWithTenantContext`
 * one frame up). `AsyncLocalStorage`/`getTenantContext()` remain the right
 * tool for propagating tenant context through ordinary application code
 * (e.g. a NestJS guard/interceptor resolving the tenant once per request);
 * the call site is expected to do exactly that and then obtain its
 * request-scoped client via `getTenantPrisma(getTenantContext().tenantId)`.
 *
 * Every operation on a tenant-scoped model runs inside a single Prisma
 * interactive transaction that first calls
 * `set_config('app.tenant_id', …, true)` (the functional equivalent of
 * `SET LOCAL`) and then performs the actual operation via the SAME
 * transactional client (`tx`) — guaranteeing both statements run on the
 * same underlying connection, which a separate `$executeRaw` followed by a
 * separate query call would NOT guarantee under connection pooling.
 *
 * Fails loud (throws) if `tenantId` is falsy, in addition to the
 * database-level fail-closed RLS policies — defense in depth, not reliance
 * on either layer alone.
 *
 * Return type is annotated as the plain `PrismaClient` rather than the
 * precise `$extends(...)` result: the extension wraps existing operations
 * without adding new ones, so every normal model method
 * (`.person.findMany()` etc.) keeps its full, correct typing for callers —
 * while avoiding TS2742 ("inferred type cannot be named without a reference
 * to .pnpm/...") when this function's return type is emitted into the
 * package's `.d.ts` declaration file.
 */
export function getTenantPrisma(tenantId: string): PrismaClient {
  if (!tenantId) {
    throw new Error("getTenantPrisma() requires a non-empty tenantId.");
  }

  const extended = prisma.$extends({
    name: `tenant-scoped-rls:${tenantId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const modelDelegateName = model.charAt(0).toLowerCase() + model.slice(1);

          return prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
            const delegate = (tx as unknown as Record<string, ModelDelegate>)[modelDelegateName];
            const method = delegate?.[operation];
            if (!method) {
              throw new Error(`Unknown operation "${operation}" for model "${model}".`);
            }
            return method(args);
          });
        },
      },
    },
  });

  return extended as unknown as PrismaClient;
}
