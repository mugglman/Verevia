"use client";

import { useState } from "react";

export interface MatchDateTimeInputProps {
  /** ISO UTC instant to prefill (edit form) — converted to the browser's local wall-clock for display. */
  defaultValueIso?: string;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Renders a native `datetime-local` input and mirrors it into a hidden
 * `startsAt` field as a real UTC ISO string — deliberately client-side
 * (Phase 10, "keine naive Datumslogik"): only the browser knows the
 * viewer's local timezone/DST offset, so converting local wall-clock time
 * to an unambiguous UTC instant (`Date.toISOString()`) must happen here,
 * not on the server (which may run in a different timezone, e.g. UTC in
 * the Docker container). The submitted `startsAt` is therefore always a
 * real UTC instant, never a naive/ambiguous string.
 */
export function MatchDateTimeInput({ defaultValueIso }: MatchDateTimeInputProps) {
  const [localValue, setLocalValue] = useState(defaultValueIso ? toLocalInputValue(defaultValueIso) : "");
  const iso = localValue ? new Date(localValue).toISOString() : "";

  return (
    <>
      <input
        type="datetime-local"
        required
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        aria-label="Datum und Uhrzeit"
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
      />
      <input type="hidden" name="startsAt" value={iso} />
    </>
  );
}
