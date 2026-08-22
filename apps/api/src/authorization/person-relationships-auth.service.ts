import { Injectable } from "@nestjs/common";
import { getTenantPrisma } from "@verevia/database";
import { AuthorizationRelationship } from "./authorization.service";

/**
 * Loads the authenticated Person's outgoing PersonRelationships (i.e.
 * relationships where this Person is the potential guardian, `fromPerson`)
 * within the active tenant — used by AuthorizationService's ReBAC checks.
 * Named distinctly from `PersonRelationshipsService` (persons/ — the CRUD
 * API for managing relationships) to avoid confusion between "load for an
 * authorization decision" and "manage via the admin API".
 */
@Injectable()
export class PersonRelationshipsAuthService {
  async loadAsGuardian(tenantId: string, personId: string): Promise<AuthorizationRelationship[]> {
    const db = getTenantPrisma(tenantId);
    const relationships = await db.personRelationship.findMany({
      where: { fromPersonId: personId },
      select: { type: true, status: true, toPersonId: true },
    });
    return relationships;
  }
}
