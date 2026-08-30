import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./client";

/**
 * Models deliberately excluded from tenant-scoping despite carrying a
 * `tenantId` field (see TENANT_SCOPED_MODELS below for why "carries
 * tenantId" is otherwise the sole criterion). Keep this list as short as
 * possible — every entry needs the same kind of justification `Tenant`
 * and `AccountInvitation` already have in schema.prisma.
 *
 * - `AccountInvitation`: bootstrap lookup problem (the public accept/
 *   lookup flow doesn't know the tenant yet — that's what it's
 *   discovering FROM the token), no RLS policy exists for this table at
 *   all, see its schema.prisma doc comment. Wrapping it here would just
 *   set a GUC that no policy reads.
 */
const TENANT_SCOPE_EXCLUSIONS = new Set(["AccountInvitation"]);

/**
 * Tenant-partitioned models — auto-derived from the Prisma schema itself
 * (every model with a `tenantId` field, minus TENANT_SCOPE_EXCLUSIONS)
 * rather than a hand-maintained list.
 *
 * This replaces an earlier hand-maintained `Set` literal that had to be
 * remembered and updated by hand for every new tenant-scoped model —
 * flagged explicitly as recurring technical debt going into Phase 9
 * ("Nach Phase-4-Bug prüfen, ob neue Prisma-Modelle automatisch bzw.
 * korrekt in der Tenant-Scope-Logik registriert werden"). The old
 * design's failure mode was fail-OPEN: forgetting to add a new
 * tenant-scoped model to the list silently ran it WITHOUT RLS context,
 * a real security bug that would only surface as leaked cross-tenant
 * rows, not a loud error. This derivation instead makes correctness a
 * structural property of "does this model have a `tenantId` column",
 * which every tenant-scoped model needs anyway for its composite FKs —
 * there is no separate list to forget to update. `User`/`Session`/
 * `Account`/`Verification`/`PlatformRoleAssignment`/`Tenant`/`Membership`
 * are correctly excluded automatically (none of them has a `tenantId`
 * field) — see docs/ARCHITEKTUR_FINALISIERUNG.md, section 8, for why
 * those are the global identity layer.
 *
 * Verified against `prisma/migrations/20260817150231_add_rls_and_scope_constraint`
 * and every later RLS-adding migration in `packages/database/src/__tests__/`
 * (a dedicated test asserts this derived set matches the DB tables that
 * actually have RLS enabled — see tenant-scoped-models.spec.ts).
 */
const TENANT_SCOPED_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "tenantId"))
    .map((model) => model.name)
    .filter((name) => !TENANT_SCOPE_EXCLUSIONS.has(name)),
);

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

/**
 * Runs `callback` inside a SINGLE tenant-scoped, RLS-enforcing Postgres
 * transaction — added in Phase 12 for the tournament schedule commit,
 * the first place in the codebase that genuinely needs several
 * tenant-scoped writes/reads to be atomic *together* (row-lock the
 * tournament, re-check for an existing schedule, insert every generated
 * match) rather than each individually atomic.
 *
 * `getTenantPrisma()` above deliberately wraps every single Prisma Client
 * call in its OWN `$transaction` — correct and sufficient for the vast
 * majority of call sites, but not composable: calling a second operation
 * on that extended client from inside an already-open transaction opens
 * an unrelated, second transaction on the underlying (non-extended)
 * `prisma` singleton instead of continuing the caller's transaction, so
 * multi-statement atomicity cannot be built on top of it. Rather than
 * changing `getTenantPrisma()`'s behavior for every existing call site,
 * this is an additive sibling: it opens exactly one interactive
 * transaction, sets `app.tenant_id` once at the start (same
 * `set_config(..., true)` — i.e. `SET LOCAL` — mechanism, on the same
 * connection), and hands the raw transaction client to the callback so
 * it can perform multiple tenant-scoped operations against it directly.
 * RLS is enforced identically to `getTenantPrisma()` — the guarantee
 * RLS actually depends on is "the SET LOCAL and the query run on the
 * same connection/transaction", which holds here by construction.
 *
 * See docs/architecture/adr/0009-tenant-scoped-multi-statement-transactions.md.
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error("withTenantTransaction() requires a non-empty tenantId.");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return callback(tx);
  });
}
