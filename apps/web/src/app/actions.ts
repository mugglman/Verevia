"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
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
