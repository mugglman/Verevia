import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma, getTenantPrisma } from "@verevia/database";

/**
 * Real-auth fixtures for the E2E happy paths (Phase 3 section 28, extended
 * in Phase 4 section 24 with a COACH session).
 *
 * Not a mock: each fixture signs up a real better-auth user against the
 * running apps/api instance (same HTTP endpoint a real user's browser
 * would call) and stores the resulting session cookie for Playwright to
 * reuse. The only thing "fixture" about this is that Person/Membership/
 * RoleAssignment/TeamMember are created directly via Prisma instead of
 * through a (not-yet-existing) role-granting/team-membership-granting UI
 * flow for TEST DATA SETUP — there is no production code path involved.
 *
 * Requires a live apps/api + PostgreSQL (API_URL, DATABASE_URL) and the
 * development seed (see packages/database/prisma/seed.ts) already applied,
 * so that the pilot tenant "tsv-benediktbeuern" / department "Fußball" /
 * teams E1+E2 exist.
 */

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const PILOT_TENANT_SLUG = process.env.PILOT_TENANT_SLUG ?? "tsv-benediktbeuern";
const AUTH_DIR = path.join(__dirname, ".auth");
const ADMIN_STORAGE_STATE_PATH = path.join(AUTH_DIR, "state.json");
const COACH_STORAGE_STATE_PATH = path.join(AUTH_DIR, "state-coach.json");
const CANDIDATE_PERSON_NAME_PATH = path.join(AUTH_DIR, "candidate-person.json");

function parseSessionCookie(setCookieHeader: string): { name: string; value: string } {
  const firstPair = (setCookieHeader.split(",")[0] ?? "").split(";")[0] ?? "";
  const separatorIndex = firstPair.indexOf("=");
  return {
    name: firstPair.slice(0, separatorIndex).trim(),
    value: firstPair.slice(separatorIndex + 1).trim(),
  };
}

async function signUpAndGetCookie(label: string): Promise<{ cookie: { name: string; value: string }; userId: string }> {
  const email = `e2e-${label}-${Date.now()}@example.invalid`;
  const password = "Sup3rSicher!E2E";
  const signupResponse = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: "POST",
    // better-auth requires Origin to match a trusted origin (see
    // packages/auth/src/index.ts) for CSRF protection; a real browser sets
    // this automatically, Node's fetch() does not.
    headers: { "content-type": "application/json", origin: APP_URL },
    body: JSON.stringify({ email, password, name: `E2E ${label}` }),
  });
  if (!signupResponse.ok) {
    throw new Error(
      `E2E fixture signup (${label}) failed: ${signupResponse.status} ${await signupResponse.text()}`,
    );
  }
  const setCookieHeader = signupResponse.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error(`E2E fixture signup (${label}) did not return a session cookie`);
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { cookie: parseSessionCookie(setCookieHeader), userId: user.id };
}

async function writeStorageState(filePath: string, cookie: { name: string; value: string }) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
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
}

export default async function globalSetup(): Promise<void> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: PILOT_TENANT_SLUG },
    select: { id: true },
  });
  const db = getTenantPrisma(tenant.id);
  // Throws if the seed hasn't run yet — this is the fixture's only
  // dependency on department "Fußball"/teams E1+E2 existing.
  const football = await db.department.findFirstOrThrow({
    where: { tenantId: tenant.id, name: "Fußball" },
  });
  const teamE1 = await db.team.findFirstOrThrow({
    where: { tenantId: tenant.id, departmentId: football.id, name: "E1" },
  });

  // Idempotency: every fixture Person below uses firstName "E2E" — clean up
  // leftovers from a previous run of this suite against the same database
  // first, otherwise repeated local/CI runs accumulate duplicate "E2E
  // Kandidat" rows (seen in practice: a text-based Playwright assertion
  // started matching multiple <option> elements after several reruns).
  const stalePersons = await db.person.findMany({
    where: { tenantId: tenant.id, firstName: "E2E" },
    select: { id: true },
  });
  if (stalePersons.length > 0) {
    const staleIds = stalePersons.map((p) => p.id);
    const staleMemberships = await prisma.membership.findMany({
      where: { personId: { in: staleIds } },
      select: { userId: true },
    });
    const staleUserIds = staleMemberships.map((m) => m.userId);
    await db.teamMember.deleteMany({ where: { tenantId: tenant.id, personId: { in: staleIds } } });
    await db.roleAssignment.deleteMany({
      where: { tenantId: tenant.id, personId: { in: staleIds } },
    });
    await prisma.membership.deleteMany({ where: { personId: { in: staleIds } } });
    await db.person.deleteMany({ where: { tenantId: tenant.id, id: { in: staleIds } } });
    if (staleUserIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: staleUserIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: staleUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: staleUserIds } } });
    }
  }

  // TENANT_ADMIN fixture (Phase 3 happy path + Phase 4 "add member" flow).
  const admin = await signUpAndGetCookie("admin");
  const adminPerson = await db.person.create({
    data: { tenantId: tenant.id, firstName: "E2E", lastName: "Admin" },
  });
  await prisma.membership.create({
    data: { userId: admin.userId, personId: adminPerson.id, status: "ACTIVE" },
  });
  await db.roleAssignment.create({
    data: {
      tenantId: tenant.id,
      personId: adminPerson.id,
      role: "TENANT_ADMIN",
      scopeType: "TENANT",
    },
  });
  await writeStorageState(ADMIN_STORAGE_STATE_PATH, admin.cookie);

  // A Person not yet assigned to any team — the "Person hinzufügen" flow
  // on the E1 page selects this one (see e2e/team-membership.spec.ts).
  const candidate = await db.person.create({
    data: { tenantId: tenant.id, firstName: "E2E", lastName: "Kandidat" },
  });
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(
    CANDIDATE_PERSON_NAME_PATH,
    JSON.stringify({ fullName: `${candidate.firstName} ${candidate.lastName}` }),
    "utf-8",
  );

  // COACH of E1 fixture (Phase 4 section 24: sees E1 members, but not the
  // administrative Personenverwaltung).
  const coach = await signUpAndGetCookie("coach-e1");
  const coachPerson = await db.person.create({
    data: { tenantId: tenant.id, firstName: "E2E", lastName: "CoachE1" },
  });
  await prisma.membership.create({
    data: { userId: coach.userId, personId: coachPerson.id, status: "ACTIVE" },
  });
  await db.roleAssignment.create({
    data: {
      tenantId: tenant.id,
      personId: coachPerson.id,
      role: "COACH",
      scopeType: "TEAM",
      teamId: teamE1.id,
    },
  });
  await writeStorageState(COACH_STORAGE_STATE_PATH, coach.cookie);

  // Only Prisma connections used for fixture setup; the browser/app hold
  // their own connections via the running apps/api process.
  await prisma.$disconnect();
}
