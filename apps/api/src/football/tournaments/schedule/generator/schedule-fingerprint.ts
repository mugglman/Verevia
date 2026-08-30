import { createHash } from "node:crypto";
import { GENERATOR_VERSION } from "./limits";
import { ScheduledMatch, ScheduleSettings } from "./types";

export interface FingerprintTournamentInput {
  id: string;
  startsAt: string;
  endsAt: string | null;
  mode: string | null;
}

export interface FingerprintParticipantInput {
  id: string;
  groupId: string | null;
}

export interface FingerprintGroupInput {
  id: string;
  name: string;
  displayOrder: number;
}

export interface FingerprintInput {
  tournament: FingerprintTournamentInput;
  participants: readonly FingerprintParticipantInput[];
  groups: readonly FingerprintGroupInput[];
  venueIds: readonly string[];
  settings: Pick<ScheduleSettings, "matchDurationMinutes" | "changeoverMinutes" | "minimumRestMinutes"> & {
    schedulingStartsAt: string;
  };
  matches: readonly ScheduledMatch[];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(record[key]);
    }
    return result;
  }
  return value;
}

/**
 * Stable SHA-256 fingerprint over every input that determines a generated
 * schedule (work order section 23) — tournament timing/mode, active
 * participants + their group assignment, groups, selected venues,
 * settings, the generator version, and the generated matches themselves.
 * Canonical (key-sorted) JSON, and every array is sorted here so that
 * incidental DB query ordering never changes the fingerprint. NOT a
 * security/authentication token — purely a stale-preview / tampered-
 * request detector (section 23: "Nicht als Authentifizierung behandeln").
 */
export function computeScheduleFingerprint(input: FingerprintInput): string {
  const sortedParticipants = [...input.participants]
    .map((p) => ({ id: p.id, groupId: p.groupId }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const sortedGroups = [...input.groups]
    .map((g) => ({ id: g.id, name: g.name, displayOrder: g.displayOrder }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const sortedVenueIds = [...input.venueIds].sort((a, b) => a.localeCompare(b));

  const sortedMatches = [...input.matches]
    .map((m) => ({
      groupId: m.groupId,
      round: m.round,
      homeParticipantId: m.homeParticipantId,
      awayParticipantId: m.awayParticipantId,
      venueId: m.venueId,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
    }))
    .sort((a, b) =>
      a.groupId === b.groupId
        ? a.round === b.round
          ? a.homeParticipantId.localeCompare(b.homeParticipantId)
          : a.round - b.round
        : a.groupId.localeCompare(b.groupId),
    );

  const canonical = canonicalize({
    generatorVersion: GENERATOR_VERSION,
    tournament: input.tournament,
    participants: sortedParticipants,
    groups: sortedGroups,
    venueIds: sortedVenueIds,
    settings: input.settings,
    matches: sortedMatches,
  });

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
