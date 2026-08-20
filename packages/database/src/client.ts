import { PrismaClient } from "@prisma/client";

/**
 * Shared PrismaClient singleton.
 *
 * Use directly ONLY for the global identity models (User, Session, Account,
 * Verification, PlatformRoleAssignment) — e.g. from packages/auth. For any
 * tenant-scoped model (Department, Team, Person, RoleAssignment,
 * PersonRelationship), use `tenantPrisma` from ./tenant-prisma instead; see
 * docs/ARCHITEKTUR_FINALISIERUNG.md, section 7, and ADR 0006.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
