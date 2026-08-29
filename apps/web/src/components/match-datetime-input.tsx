import { DateTimeInput } from "./datetime-input";

export interface MatchDateTimeInputProps {
  /** ISO UTC instant to prefill (edit form) — converted to the browser's local wall-clock for display. */
  defaultValueIso?: string;
}

/** Thin wrapper over the generic DateTimeInput (see ./datetime-input) fixed to the `startsAt` field name. */
export function MatchDateTimeInput({ defaultValueIso }: MatchDateTimeInputProps) {
  return (
    <DateTimeInput name="startsAt" label="Datum und Uhrzeit" defaultValueIso={defaultValueIso} required />
  );
}
