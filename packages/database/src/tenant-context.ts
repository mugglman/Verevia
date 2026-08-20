import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped tenant context, per docs/ARCHITEKTUR_FINALISIERUNG.md,
 * section 7. Set once per request by the (future) TenantContextGuard in
 * apps/api, after validating the resolved tenantId against the caller's
 * active Membership — never trusted directly from client input here.
 */
export interface TenantContext {
  tenantId: string;
  userId?: string;
  personId?: string;
}

const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(
  context: TenantContext,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantContextStorage.run(context, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}
