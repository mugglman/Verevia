/**
 * Shared TypeScript types for Verevia apps and packages.
 *
 * Technical skeleton only — no domain types yet. Domain types (Tenant,
 * Person, RoleAssignment, ...) follow in the Prisma-Schema work package,
 * see docs/ARCHITEKTUR_FINALISIERUNG.md.
 */

export interface HealthStatus {
  status: "ok" | "error";
}
