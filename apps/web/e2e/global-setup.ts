import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma, getTenantPrisma } from "@verevia/database";

/**
 * Real-auth fixture for the E2E happy path (Phase 3, section 28).
 *
 * Not a mock: this signs up a real better-auth user against the running
 * apps/api instance (same HTTP endpoint a real user's browser would call)
 * and stores the resulting session cookie for Playwright to reuse. The only
 * thing "fixture" about this is that Person/Membership/RoleAssignment are
 * created directly via Prisma instead of through a (not-yet-existing)
 * role-granting API — there is no production code path involved.
 *
 * Requires a live apps/api + PostgreSQL (API_URL, DATABASE_URL) and the
 * development seed (see packages/database/prisma/seed.ts) already applied,
 * so that the pilot tenant "tsv-benediktbeuern" / department "Fußball"
 * exist.
 */

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const PILOT_TENANT_SLUG = process.env.PILOT_TENANT_SLUG ?? "tsv-benediktbeuern";
const STORAGE_STATE_PATH = path.join(__dirname, ".auth", "state.json");

function parseSessionCookie(setCookieHeader: string): { name: string; value: string } {
  const firstPair = (setCookieHeader.split(",")[0] ?? "").split(";")[0] ?? "";
  const separatorIndex = firstPair.indexOf("=");
  return {
    name: firstPair.slice(0, separatorIndex).trim(),
    value: firstPair.slice(separatorIndex + 1).trim(),
  };
}

export default async function globalSetup(): Promise<void> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: PILOT_TENANT_SLUG },
    select: { id: true },
  });
  const db = getTenantPrisma(tenant.id);
  // Throws if the seed hasn't run yet — this is the fixture's only
  // dependency on department "Fußball" existing.
  await db.department.findFirstOrThrow({ where: { tenantId: tenant.id, name: "Fußball" } });

  const email = `e2e-${Date.now()}@example.invalid`;
  const password = "Sup3rSicher!E2E";
  const signupResponse = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: "POST",
    // better-auth requires Origin to match a trusted origin (see
    // packages/auth/src/index.ts) for CSRF protection; a real browser sets
    // this automatically, Node's fetch() does not.
    headers: { "content-type": "application/json", origin: APP_URL },
    body: JSON.stringify({ email, password, name: "E2E Testmitglied" }),
  });
  if (!signupResponse.ok) {
    throw new Error(`E2E fixture signup failed: ${signupResponse.status} ${await signupResponse.text()}`);
  }
  const setCookieHeader = signupResponse.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("E2E fixture signup did not return a session cookie");
  }
  const cookie = parseSessionCookie(setCookieHeader);

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const person = await db.person.create({
    data: { tenantId: tenant.id, firstName: "E2E", lastName: "Testmitglied" },
  });
  await prisma.membership.create({
    data: { userId: user.id, personId: person.id, status: "ACTIVE" },
  });
  await db.roleAssignment.create({
    data: {
      tenantId: tenant.id,
      personId: person.id,
      role: "TENANT_ADMIN",
      scopeType: "TENANT",
    },
  });

  await mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await writeFile(
    STORAGE_STATE_PATH,
    JSON.stringify({
      cookies: [
        {
          name: cookie.name,
          value: cookie.value,
          domain: new URL(APP_URL).hostname,
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    }),
    "utf-8",
  );

  // Only Prisma connections used for fixture setup; the browser/app hold
  // their own connections via the running apps/api process.
  await prisma.$disconnect();
}
