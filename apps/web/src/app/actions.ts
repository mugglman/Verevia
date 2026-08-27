"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import type { RoleName } from "@/lib/roles";
import { ROLE_SCOPE } from "@/lib/roles";
import { resolvePilotTenantId } from "@/lib/tenant";

async function requireTenantId(): Promise<string> {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    throw new Error("Pilot tenant not seeded");
  }
  return tenantId;
}

export async function updateClubNameAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  await apiFetch("/api/v1/club", tenantId, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  revalidatePath("/");
}

export async function createDepartmentAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  await apiFetch("/api/v1/departments", tenantId, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  revalidatePath("/");
}

export async function updateDepartmentNameAction(departmentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  await apiFetch(`/api/v1/departments/${departmentId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  revalidatePath(`/abteilungen/${departmentId}`);
}

export async function createTeamAction(departmentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  await apiFetch("/api/v1/teams", tenantId, {
    method: "POST",
    body: JSON.stringify({ name, departmentId }),
  });
  revalidatePath(`/abteilungen/${departmentId}`);
}

export async function updateTeamNameAction(teamId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  await apiFetch(`/api/v1/teams/${teamId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  revalidatePath(`/mannschaften/${teamId}`);
}

export async function addTeamMemberAction(teamId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const personId = String(formData.get("personId") ?? "");
  await apiFetch(`/api/v1/teams/${teamId}/members`, tenantId, {
    method: "POST",
    body: JSON.stringify({ personId }),
  });
  revalidatePath(`/mannschaften/${teamId}`);
}

export async function removeTeamMemberAction(teamId: string, personId: string) {
  const tenantId = await requireTenantId();
  await apiFetch(`/api/v1/teams/${teamId}/members/${personId}`, tenantId, {
    method: "DELETE",
  });
  revalidatePath(`/mannschaften/${teamId}`);
}

export async function createPersonAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  await apiFetch("/api/v1/persons", tenantId, {
    method: "POST",
    body: JSON.stringify({ firstName, lastName }),
  });
  revalidatePath("/personen");
}

export async function updatePersonAction(personId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  await apiFetch(`/api/v1/persons/${personId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({ firstName, lastName }),
  });
  revalidatePath("/personen");
}

export async function grantRoleAction(personId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const role = String(formData.get("role") ?? "") as RoleName;
  // scopeType is derived server-side from the chosen role, never trusted
  // from the client — mirrors the same rule the API itself enforces.
  const scopeType = ROLE_SCOPE[role];
  const departmentId = formData.get("departmentId");
  const teamId = formData.get("teamId");
  await apiFetch(`/api/v1/persons/${personId}/roles`, tenantId, {
    method: "POST",
    body: JSON.stringify({
      role,
      scopeType,
      ...(scopeType === "DEPARTMENT" && departmentId ? { departmentId: String(departmentId) } : {}),
      ...(scopeType === "TEAM" && teamId ? { teamId: String(teamId) } : {}),
    }),
  });
  revalidatePath("/personen");
}

export async function revokeRoleAction(personId: string, roleAssignmentId: string) {
  const tenantId = await requireTenantId();
  await apiFetch(`/api/v1/persons/${personId}/roles/${roleAssignmentId}`, tenantId, {
    method: "DELETE",
  });
  revalidatePath("/personen");
}

export async function inviteAccountAction(personId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const email = String(formData.get("email") ?? "");
  await apiFetch(`/api/v1/persons/${personId}/invitations`, tenantId, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  revalidatePath("/personen");
}

export async function revokeInvitationAction(personId: string, invitationId: string) {
  const tenantId = await requireTenantId();
  await apiFetch(`/api/v1/persons/${personId}/invitations/${invitationId}`, tenantId, {
    method: "DELETE",
  });
  revalidatePath("/personen");
}

export async function createSeasonAction(departmentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  await apiFetch("/api/v1/seasons", tenantId, {
    method: "POST",
    body: JSON.stringify({ departmentId, name, startsAt, endsAt }),
  });
  revalidatePath("/fussball/saisons");
  revalidatePath("/fussball");
}

export async function updateSeasonAction(seasonId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const status = String(formData.get("status") ?? "");
  await apiFetch(`/api/v1/seasons/${seasonId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({ name, startsAt, endsAt, status }),
  });
  revalidatePath("/fussball/saisons");
  revalidatePath("/fussball");
}

export async function createRelationshipAction(personId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const toPersonId = String(formData.get("toPersonId") ?? "");
  const type = String(formData.get("type") ?? "");
  await apiFetch(`/api/v1/persons/${personId}/relationships`, tenantId, {
    method: "POST",
    body: JSON.stringify({ toPersonId, type }),
  });
  revalidatePath("/personen");
}

export async function revokeRelationshipAction(personId: string, relationshipId: string) {
  const tenantId = await requireTenantId();
  await apiFetch(`/api/v1/persons/${personId}/relationships/${relationshipId}`, tenantId, {
    method: "DELETE",
  });
  revalidatePath("/personen");
}

export async function createMatchAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const teamSeasonId = String(formData.get("teamSeasonId") ?? "");
  const opponentName = String(formData.get("opponentName") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const homeAway = String(formData.get("homeAway") ?? "");
  const type = String(formData.get("type") ?? "");
  const venueId = String(formData.get("venueId") ?? "");
  const notes = String(formData.get("notes") ?? "");
  await apiFetch("/api/v1/football/matches", tenantId, {
    method: "POST",
    body: JSON.stringify({
      teamSeasonId,
      opponentName,
      startsAt,
      homeAway,
      type,
      ...(venueId ? { venueId } : {}),
      ...(notes ? { notes } : {}),
    }),
  });
  revalidatePath("/fussball/spiele");
}

export async function updateMatchAction(matchId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const opponentName = String(formData.get("opponentName") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const homeAway = String(formData.get("homeAway") ?? "");
  const type = String(formData.get("type") ?? "");
  const status = String(formData.get("status") ?? "");
  const venueId = String(formData.get("venueId") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const homeScoreRaw = String(formData.get("homeScore") ?? "");
  const awayScoreRaw = String(formData.get("awayScore") ?? "");
  await apiFetch(`/api/v1/football/matches/${matchId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({
      opponentName,
      startsAt,
      homeAway,
      type,
      status,
      notes,
      ...(venueId ? { venueId } : {}),
      ...(homeScoreRaw ? { homeScore: Number(homeScoreRaw) } : {}),
      ...(awayScoreRaw ? { awayScore: Number(awayScoreRaw) } : {}),
    }),
  });
  revalidatePath("/fussball/spiele");
  revalidatePath(`/fussball/spiele/${matchId}`);
}

export async function createVenueAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  const street = String(formData.get("street") ?? "");
  const postalCode = String(formData.get("postalCode") ?? "");
  const city = String(formData.get("city") ?? "");
  await apiFetch("/api/v1/venues", tenantId, {
    method: "POST",
    body: JSON.stringify({
      name,
      ...(street ? { street } : {}),
      ...(postalCode ? { postalCode } : {}),
      ...(city ? { city } : {}),
    }),
  });
  revalidatePath("/spielstaetten");
}

export async function updateVenueAction(venueId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  const street = String(formData.get("street") ?? "");
  const postalCode = String(formData.get("postalCode") ?? "");
  const city = String(formData.get("city") ?? "");
  const status = String(formData.get("status") ?? "");
  await apiFetch(`/api/v1/venues/${venueId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({ name, street, postalCode, city, status }),
  });
  revalidatePath("/spielstaetten");
}
