import { notFound } from "next/navigation";
import { InvitationAcceptForm } from "@/components/invitation-accept-form";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

interface PublicInvitationDto {
  tenantName: string;
  personFirstName: string;
  email: string;
  accountExists: boolean;
}

/**
 * Public page — no login required to view (Phase 6, section 24). Fetches
 * directly against the API (not via apps/web/src/lib/api.ts's apiFetch,
 * which assumes a resolved tenant + forwarded session cookie — neither
 * applies here, this page precedes both).
 */
export default async function EinladungPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const response = await fetch(`${API_URL}/api/v1/invitations/${token}`, { cache: "no-store" });
  if (!response.ok) {
    notFound();
  }
  const invitation = (await response.json()) as PublicInvitationDto;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-background)] px-4 py-16">
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="text-xl font-semibold text-[var(--color-dark)]">
          Einladung zu {invitation.tenantName}
        </h1>
        <p className="text-sm text-neutral-600">
          Du wurdest eingeladen, dich für {invitation.personFirstName} bei{" "}
          {invitation.tenantName} auf Verevia anzumelden.
        </p>
      </div>
      <InvitationAcceptForm
        token={token}
        email={invitation.email}
        accountExists={invitation.accountExists}
      />
    </main>
  );
}
