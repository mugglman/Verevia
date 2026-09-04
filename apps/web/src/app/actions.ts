"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  // Unlike every other create action in this file, the match-creation form
  // lives on its own dedicated page (/fussball/spiele/neu, not inline on
  // the list) — without an explicit redirect the user would stay on the
  // now-stale "neu" page after submission instead of seeing the new match.
  redirect("/fussball/spiele");
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

export async function createTournamentAction(departmentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const mode = String(formData.get("mode") ?? "");
  const result = await apiFetch<{ id: string }>("/api/v1/football/tournaments", tenantId, {
    method: "POST",
    body: JSON.stringify({
      departmentId,
      name,
      startsAt,
      ...(description ? { description } : {}),
      ...(endsAt ? { endsAt } : {}),
      ...(seasonId ? { seasonId } : {}),
      ...(mode ? { mode } : {}),
    }),
  });
  revalidatePath("/fussball/turniere");
  // Section 26 of the work order: after creating a tournament, open its
  // detail page — unlike most create actions in this file, which stay on
  // an inline list, the create form lives on its own page.
  if (result.ok) {
    redirect(`/fussball/turniere/${result.data.id}`);
  }
  redirect("/fussball/turniere");
}

export async function updateTournamentAction(tournamentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const status = String(formData.get("status") ?? "");
  const mode = String(formData.get("mode") ?? "");
  await apiFetch(`/api/v1/football/tournaments/${tournamentId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({
      name,
      startsAt,
      status,
      ...(description ? { description } : {}),
      ...(endsAt ? { endsAt } : {}),
      ...(mode ? { mode } : {}),
    }),
  });
  revalidatePath(`/fussball/turniere/${tournamentId}`);
  revalidatePath("/fussball/turniere");
}

export async function addInternalParticipantAction(tournamentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const teamSeasonId = String(formData.get("teamSeasonId") ?? "");
  await apiFetch(`/api/v1/football/tournaments/${tournamentId}/participants`, tenantId, {
    method: "POST",
    body: JSON.stringify({ teamSeasonId }),
  });
  revalidatePath(`/fussball/turniere/${tournamentId}`);
}

export async function addExternalParticipantAction(tournamentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const externalName = String(formData.get("externalName") ?? "");
  await apiFetch(`/api/v1/football/tournaments/${tournamentId}/participants`, tenantId, {
    method: "POST",
    body: JSON.stringify({ externalName }),
  });
  revalidatePath(`/fussball/turniere/${tournamentId}`);
}

export async function assignParticipantGroupAction(
  tournamentId: string,
  participantId: string,
  formData: FormData,
) {
  const tenantId = await requireTenantId();
  const groupId = String(formData.get("groupId") ?? "");
  await apiFetch(`/api/v1/football/tournaments/${tournamentId}/participants/${participantId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({ groupId }),
  });
  revalidatePath(`/fussball/turniere/${tournamentId}`);
}

export async function createTournamentGroupAction(tournamentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "");
  await apiFetch(`/api/v1/football/tournaments/${tournamentId}/groups`, tenantId, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  revalidatePath(`/fussball/turniere/${tournamentId}`);
}

export async function addTournamentVenueAction(tournamentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const venueId = String(formData.get("venueId") ?? "");
  const label = String(formData.get("label") ?? "");
  await apiFetch(`/api/v1/football/tournaments/${tournamentId}/venues`, tenantId, {
    method: "POST",
    body: JSON.stringify({ venueId, ...(label ? { label } : {}) }),
  });
  revalidatePath(`/fussball/turniere/${tournamentId}`);
}

export async function removeTournamentVenueAction(tournamentId: string, venueId: string) {
  const tenantId = await requireTenantId();
  await apiFetch(`/api/v1/football/tournaments/${tournamentId}/venues/${venueId}`, tenantId, {
    method: "DELETE",
  });
  revalidatePath(`/fussball/turniere/${tournamentId}`);
}

export interface ScheduleSettingsInput {
  matchDurationMinutes: number;
  changeoverMinutes: number;
  minimumRestMinutes: number;
  venueIds: string[];
  schedulingStartsAt?: string;
}

export interface ScheduleActionResult<T> {
  ok: boolean;
  status?: number;
  message?: string;
  data?: T;
}

/**
 * Unlike every other action in this file, this one isn't bound to a
 * `<form action={...}>` — it's called imperatively from the schedule
 * generator's client component (`TournamentScheduleGenerator`) so the
 * preview result can be rendered without a full page navigation. Returns
 * the API response directly rather than revalidating/redirecting: a
 * preview never writes to the database (see PHASE_12 report).
 */
export async function previewTournamentScheduleAction(
  tournamentId: string,
  settings: ScheduleSettingsInput,
): Promise<ScheduleActionResult<unknown>> {
  const tenantId = await requireTenantId();
  const result = await apiFetch(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`, tenantId, {
    method: "POST",
    body: JSON.stringify(settings),
  });
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return { ok: true, data: result.data };
}

/**
 * Persists the previewed schedule — same settings plus the fingerprint the
 * client received from its last preview call (server re-validates and
 * re-generates from fresh data before writing anything, see
 * TournamentScheduleService.commit). On success, redirects back to the
 * tournament detail page (same "own page + redirect after mutation"
 * pattern as createTournamentAction/createMatchAction) so the newly
 * persisted matches are visible immediately.
 */
export async function commitTournamentScheduleAction(
  tournamentId: string,
  settings: ScheduleSettingsInput,
  fingerprint: string,
): Promise<ScheduleActionResult<unknown>> {
  const tenantId = await requireTenantId();
  const result = await apiFetch(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`, tenantId, {
    method: "POST",
    body: JSON.stringify({ ...settings, fingerprint }),
  });
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  revalidatePath(`/fussball/turniere/${tournamentId}`);
  redirect(`/fussball/turniere/${tournamentId}`);
}

export type KnockoutEntrantInput = { type: "TEAM"; participantId: string } | { type: "GROUP_POSITION"; groupId: string; position: number };

export interface KnockoutSettingsInput {
  entrants: KnockoutEntrantInput[];
  includeThirdPlace: boolean;
  matchDurationMinutes: number;
  changeoverMinutes: number;
  minimumRestMinutes: number;
  venueIds: string[];
  schedulingStartsAt?: string;
}

/**
 * Same "not bound to a form action" shape as previewTournamentScheduleAction
 * — called imperatively from TournamentKnockoutGenerator so the bracket
 * preview can render without a full page navigation. A preview never writes
 * to the database (see PHASE_13 report).
 */
export async function previewTournamentKnockoutAction(
  tournamentId: string,
  settings: KnockoutSettingsInput,
): Promise<ScheduleActionResult<unknown>> {
  const tenantId = await requireTenantId();
  const result = await apiFetch(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`, tenantId, {
    method: "POST",
    body: JSON.stringify(settings),
  });
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return { ok: true, data: result.data };
}

/**
 * Persists the previewed knockout bracket — same settings plus the
 * fingerprint from the last preview call (server re-validates and
 * re-generates from fresh data before writing anything, see
 * TournamentKnockoutService.commit). On success, redirects back to the
 * tournament detail page, same pattern as commitTournamentScheduleAction.
 */
export async function commitTournamentKnockoutAction(
  tournamentId: string,
  settings: KnockoutSettingsInput,
  fingerprint: string,
): Promise<ScheduleActionResult<unknown>> {
  const tenantId = await requireTenantId();
  const result = await apiFetch(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`, tenantId, {
    method: "POST",
    body: JSON.stringify({ ...settings, fingerprint }),
  });
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  revalidatePath(`/fussball/turniere/${tournamentId}`);
  redirect(`/fussball/turniere/${tournamentId}`);
}

export async function createTournamentMatchAction(tournamentId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const homeParticipantId = String(formData.get("homeParticipantId") ?? "");
  const awayParticipantId = String(formData.get("awayParticipantId") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const homeAway = String(formData.get("homeAway") ?? "");
  const tournamentGroupId = String(formData.get("tournamentGroupId") ?? "");
  const venueId = String(formData.get("venueId") ?? "");
  await apiFetch(`/api/v1/football/tournaments/${tournamentId}/matches`, tenantId, {
    method: "POST",
    body: JSON.stringify({
      homeParticipantId,
      awayParticipantId,
      startsAt,
      homeAway,
      type: "TOURNAMENT",
      ...(tournamentGroupId ? { tournamentGroupId } : {}),
      ...(venueId ? { venueId } : {}),
    }),
  });
  revalidatePath(`/fussball/turniere/${tournamentId}`);
}

/**
 * Phase 15: records a tournament match's result — deliberately just a thin
 * wrapper around the EXISTING PATCH /football/matches/:id endpoint (Phase
 * 14), not a new API route. Setting status to COMPLETED here is what
 * triggers the already-existing server-side WinnerOfMatch/LoserOfMatch
 * slot propagation; this action adds no new backend logic. Called
 * imperatively (not bound to a `<form action>`) from the client result-
 * entry form so a 409 ("already propagated") can be shown inline instead
 * of surfacing Next.js's default error boundary — same
 * ScheduleActionResult pattern as previewTournamentKnockoutAction.
 */
export async function updateTournamentMatchResultAction(
  tournamentId: string,
  matchId: string,
  result: { homeScore: number; awayScore: number },
): Promise<ScheduleActionResult<unknown>> {
  const tenantId = await requireTenantId();
  const response = await apiFetch(`/api/v1/football/matches/${matchId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({ status: "COMPLETED", homeScore: result.homeScore, awayScore: result.awayScore }),
  });
  if (!response.ok) {
    return { ok: false, status: response.status, message: response.message };
  }
  revalidatePath(`/fussball/turniere/${tournamentId}`);
  return { ok: true, data: response.data };
}

/**
 * Phase 18 — Kalender/Termine. `scope` is a single combined value from the
 * create form's "Für wen"-select (`team:<id>` or `department:<id>`, see
 * EventCreateForm) — parsed here into exactly one of teamId/departmentId,
 * matching the API's event_scope_xor rule.
 */
export async function createEventAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const scope = String(formData.get("scope") ?? "");
  const [scopeKind, scopeId] = scope.split(":");
  const title = String(formData.get("title") ?? "");
  const type = String(formData.get("type") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const venueId = String(formData.get("venueId") ?? "");
  const description = String(formData.get("description") ?? "");
  await apiFetch("/api/v1/events", tenantId, {
    method: "POST",
    body: JSON.stringify({
      ...(scopeKind === "team" ? { teamId: scopeId } : {}),
      ...(scopeKind === "department" ? { departmentId: scopeId } : {}),
      title,
      type,
      startsAt,
      endsAt,
      ...(venueId ? { venueId } : {}),
      ...(description ? { description } : {}),
    }),
  });
  revalidatePath("/kalender");
  // Same reasoning as createMatchAction: the create form lives on its own
  // dedicated page, not inline on the list.
  redirect("/kalender");
}

export async function updateEventAction(eventId: string, formData: FormData) {
  const tenantId = await requireTenantId();
  const title = String(formData.get("title") ?? "");
  const type = String(formData.get("type") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const venueId = String(formData.get("venueId") ?? "");
  const description = String(formData.get("description") ?? "");
  await apiFetch(`/api/v1/events/${eventId}`, tenantId, {
    method: "PATCH",
    body: JSON.stringify({
      title,
      type,
      startsAt,
      endsAt,
      venueId: venueId || undefined,
      description: description || undefined,
    }),
  });
  revalidatePath(`/kalender/${eventId}`);
  revalidatePath("/kalender");
}

export async function deleteEventAction(eventId: string) {
  const tenantId = await requireTenantId();
  await apiFetch(`/api/v1/events/${eventId}`, tenantId, { method: "DELETE" });
  revalidatePath("/kalender");
  redirect("/kalender");
}
