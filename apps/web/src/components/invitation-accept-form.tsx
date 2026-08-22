"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface InvitationAcceptFormProps {
  token: string;
  email: string;
  accountExists: boolean;
}

/**
 * Client component (Phase 6, section 24): signs up or logs in via the
 * real better-auth client — the exact same mechanism as /login — then
 * calls the API's accept endpoint with the now-established session. No
 * production code path here is mocked; the only "shortcut" is that the
 * invitation token itself came from the (dev-only) console mail provider
 * rather than a real inbox, see docs/PHASE_6_GUARDIAN_INVITATIONS_REPORT.md.
 */
export function InvitationAcceptForm({ token, email, accountExists }: InvitationAcceptFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const authResult = accountExists
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({ email, password, name });

    if (authResult.error) {
      setError(
        accountExists
          ? "Anmeldung fehlgeschlagen. Bitte Passwort prüfen."
          : "Registrierung fehlgeschlagen. Bitte Eingaben prüfen.",
      );
      setSubmitting(false);
      return;
    }

    const acceptResponse = await fetch(`${API_URL}/api/v1/invitations/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });

    if (!acceptResponse.ok) {
      setError(
        "Die Einladung konnte nicht angenommen werden. Möglicherweise ist sie nicht mehr gültig.",
      );
      setSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-neutral-700">
          E-Mail
        </label>
        <input
          id="email"
          type="email"
          value={email}
          readOnly
          className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
        />
      </div>
      {!accountExists && (
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium text-neutral-700">
            Dein Name
          </label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium text-neutral-700">
          {accountExists ? "Passwort" : "Passwort festlegen"}
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-[#e5484d]">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {submitting
          ? "Wird verarbeitet…"
          : accountExists
            ? "Anmelden und Einladung annehmen"
            : "Konto erstellen und Einladung annehmen"}
      </button>
    </form>
  );
}
