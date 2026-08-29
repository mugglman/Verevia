"use client";

import { useState } from "react";

export interface DateTimeInputProps {
  name: string;
  label: string;
  /** ISO UTC instant to prefill (edit form) — converted to the browser's local wall-clock for display. */
  defaultValueIso?: string;
  required?: boolean;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Renders a native `datetime-local` input and mirrors it into a hidden
 * field (named `name`) as a real UTC ISO string — deliberately client-side
 * (Phase 10, "keine naive Datumslogik"): only the browser knows the
 * viewer's local timezone/DST offset, so converting local wall-clock time
 * to an unambiguous UTC instant (`Date.toISOString()`) must happen here,
 * not on the server (which may run in a different timezone, e.g. UTC in
 * the Docker container). Generalized in Phase 11 from the Phase 10
 * MatchDateTimeInput (which now wraps this) so tournament forms can reuse
 * it for both `startsAt` and `endsAt` without duplicating the conversion.
 */
export function DateTimeInput({ name, label, defaultValueIso, required }: DateTimeInputProps) {
  const [localValue, setLocalValue] = useState(defaultValueIso ? toLocalInputValue(defaultValueIso) : "");
  const iso = localValue ? new Date(localValue).toISOString() : "";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-neutral-600">{label}</span>
      <input
        type="datetime-local"
        required={required}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        aria-label={label}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
      />
      <input type="hidden" name={name} value={iso} />
    </div>
  );
}
