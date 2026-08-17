import { PrismaClient } from "@prisma/client";

/**
 * Shared PrismaClient singleton.
 *
 * Technical skeleton only. Does NOT yet implement the tenant-scoped
 * transaction/RLS wrapper (`TenantPrismaService`) specified in
 * docs/ARCHITEKTUR_FINALISIERUNG.md, section 7 — that lands together with
 * the actual domain schema in a later work package. Feature code must not
 * depend on this export directly for tenant-scoped queries once that
 * wrapper exists.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient } from "@prisma/client";
