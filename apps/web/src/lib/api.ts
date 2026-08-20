import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 401 | 403 | 404 | 400 | number };

/**
 * Server-side fetch against apps/api, forwarding the incoming request's
 * session cookie (real better-auth session — see ../lib/auth-client.ts for
 * how it gets set — never a mocked/fake one) plus the resolved tenant id as
 * `X-Tenant-Id`. Every actual data read/write goes through this — the only
 * exception is the one-time tenant-slug lookup in ./tenant.ts.
 */
export async function apiFetch<T>(
  path: string,
  tenantId: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      cookie: cookieHeader,
      "x-tenant-id": tenantId,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }
  const data = (await response.json()) as T;
  return { ok: true, data };
}
