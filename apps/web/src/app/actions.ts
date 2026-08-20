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
