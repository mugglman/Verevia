import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { prisma } from "@verevia/database";

interface HealthResponse {
  status: "ok";
}

interface ReadinessResponse {
  status: "ok" | "error";
  database: "ok" | "error";
}

// VERSION_NEUTRAL + explicit exclude from the /api prefix (see main.ts):
// /health(/ready) is an operational healthcheck path, not a versioned
// fachlicher Domain-Endpunkt (siehe ADR 0007).
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: "ok" };
  }

  /**
   * Separate readiness check per the Phase 2 work order, section 25:
   * verifies the database is actually reachable (a lightweight `SELECT 1`
   * against the global, non-tenant-scoped `prisma` client — no tenant
   * context is meaningful here). Never returns connection strings or other
   * secrets, only a boolean-ish status.
   */
  @Get("ready")
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<ReadinessResponse> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "ok" };
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        database: "error",
      } satisfies ReadinessResponse);
    }
  }
}
