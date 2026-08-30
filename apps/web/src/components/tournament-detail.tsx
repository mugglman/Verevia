import Link from "next/link";
import {
  addExternalParticipantAction,
  addInternalParticipantAction,
  addTournamentVenueAction,
  assignParticipantGroupAction,
  createTournamentGroupAction,
  createTournamentMatchAction,
  removeTournamentVenueAction,
  updateTournamentAction,
} from "@/app/actions";
import { DateTimeInput } from "./datetime-input";
import { MATCH_HOME_AWAY_LABELS, MATCH_STATUS_LABELS, type MatchOverviewHomeAway, type MatchOverviewStatus } from "./matches-overview";
import {
  TOURNAMENT_MODE_LABELS,
  TOURNAMENT_STATUS_LABELS,
  type TournamentOverviewMode,
  type TournamentOverviewStatus,
} from "./tournaments-overview";

export interface TournamentDetailTournament {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  status: TournamentOverviewStatus;
  mode: TournamentOverviewMode;
  canEdit: boolean;
}

export interface TournamentDetailParticipant {
  id: string;
  teamSeasonId: string | null;
  teamName: string | null;
  ageGroupName: string | null;
  externalName: string | null;
  groupId: string | null;
  groupName: string | null;
  status: "ACTIVE" | "WITHDRAWN";
  seed: number | null;
}

export interface TournamentDetailGroup {
  id: string;
  name: string;
  displayOrder: number;
}

export interface TournamentDetailVenue {
  venueId: string;
  venueName: string;
  displayOrder: number;
  label: string | null;
}

export interface TournamentDetailMatch {
  id: string;
  homeParticipantName: string | null;
  awayParticipantName: string | null;
  tournamentGroupName: string | null;
  venueName: string | null;
  startsAt: string;
  status: MatchOverviewStatus;
  homeAway: MatchOverviewHomeAway;
  homeScore: number | null;
  awayScore: number | null;
}

export interface TournamentDetailAvailableTeamSeason {
  id: string;
  teamName: string;
  ageGroupName: string;
}

export interface TournamentDetailAvailableVenue {
  id: string;
  name: string;
}

export interface TournamentDetailProps {
  tournament: TournamentDetailTournament;
  participants: TournamentDetailParticipant[];
  groups: TournamentDetailGroup[];
  venues: TournamentDetailVenue[];
  matches: TournamentDetailMatch[];
  availableTeamSeasons: TournamentDetailAvailableTeamSeason[];
  availableVenues: TournamentDetailAvailableVenue[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} · ${time}`;
}

function participantLabel(participant: { teamName: string | null; ageGroupName: string | null; externalName: string | null }): string {
  if (participant.teamName) {
    return participant.ageGroupName ? `${participant.teamName} (${participant.ageGroupName})` : participant.teamName;
  }
  return participant.externalName ?? "";
}

/** Pure presentational component — see apps/web/src/app/fussball/turniere/[id]/page.tsx. */
export function TournamentDetail({
  tournament,
  participants,
  groups,
  venues,
  matches,
  availableTeamSeasons,
  availableVenues,
}: TournamentDetailProps) {
  const activeParticipants = participants.filter((p) => p.status === "ACTIVE");

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <Link href="/fussball" className="hover:text-[var(--color-primary)]">
          Fußball
        </Link>
        <span className="mx-1">/</span>
        <Link href="/fussball/turniere" className="hover:text-[var(--color-primary)]">
          Turniere
        </Link>
        <span className="mx-1">/</span>
        <span>{tournament.name}</span>
      </nav>

      {/* Übersicht */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-[var(--color-dark)]">{tournament.name}</h1>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
            {TOURNAMENT_STATUS_LABELS[tournament.status]}
          </span>
        </div>
        <p className="text-sm text-neutral-500">
          {formatDate(tournament.startsAt)}
          {tournament.endsAt ? ` – ${formatDate(tournament.endsAt)}` : ""}
          {tournament.mode ? ` · ${TOURNAMENT_MODE_LABELS[tournament.mode]}` : ""}
        </p>
        {tournament.description && <p className="text-sm text-neutral-600">{tournament.description}</p>}

        {tournament.canEdit && (
          <form
            action={updateTournamentAction.bind(null, tournament.id)}
            className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="name" className="text-sm text-neutral-600">
                Name
              </label>
              <input
                id="name"
                name="name"
                defaultValue={tournament.name}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="description" className="text-sm text-neutral-600">
                Beschreibung
              </label>
              <textarea
                id="description"
                name="description"
                rows={2}
                defaultValue={tournament.description ?? ""}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <DateTimeInput name="startsAt" label="Beginn" defaultValueIso={tournament.startsAt} required />
            <DateTimeInput name="endsAt" label="Ende (optional)" defaultValueIso={tournament.endsAt ?? undefined} />
            <div className="flex flex-col gap-1">
              <label htmlFor="status" className="text-sm text-neutral-600">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={tournament.status}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                {Object.entries(TOURNAMENT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="mode" className="text-sm text-neutral-600">
                Modus
              </label>
              <select
                id="mode"
                name="mode"
                defaultValue={tournament.mode ?? ""}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="">Noch nicht festgelegt</option>
                {Object.entries(TOURNAMENT_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Speichern
            </button>
          </form>
        )}
      </section>

      {/* Teilnehmer */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Teilnehmer</h2>
        {participants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Teilnehmer hinzugefügt.
          </p>
        ) : (
          <ul className="space-y-2">
            {participants.map((participant) => (
              <li key={participant.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-[var(--color-dark)]">{participantLabel(participant)}</span>
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                      {participant.teamName ? "Verevia-Mannschaft" : "Externe Mannschaft"}
                    </span>
                    {participant.status === "WITHDRAWN" && (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        Zurückgezogen
                      </span>
                    )}
                  </div>
                  {tournament.canEdit && groups.length > 0 ? (
                    <form
                      action={assignParticipantGroupAction.bind(null, tournament.id, participant.id)}
                      className="flex items-center gap-2"
                    >
                      <select
                        name="groupId"
                        defaultValue={participant.groupId ?? ""}
                        aria-label={`Gruppe für ${participantLabel(participant)}`}
                        className="rounded-lg border border-neutral-300 px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
                      >
                        <option value="">Keine Gruppe</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                      >
                        Zuweisen
                      </button>
                    </form>
                  ) : (
                    participant.groupName && <span className="text-sm text-neutral-500">{participant.groupName}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {tournament.canEdit && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form
              action={addInternalParticipantAction.bind(null, tournament.id)}
              className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <label htmlFor="teamSeasonId" className="text-sm text-neutral-600">
                Verevia-Mannschaft hinzufügen
              </label>
              {availableTeamSeasons.length === 0 ? (
                <p className="text-sm text-neutral-500">Keine weiteren Mannschaften verfügbar.</p>
              ) : (
                <>
                  <select
                    id="teamSeasonId"
                    name="teamSeasonId"
                    required
                    className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    {availableTeamSeasons.map((ts) => (
                      <option key={ts.id} value={ts.id}>
                        {ts.teamName} ({ts.ageGroupName})
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    Hinzufügen
                  </button>
                </>
              )}
            </form>

            <form
              action={addExternalParticipantAction.bind(null, tournament.id)}
              className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <label htmlFor="externalName" className="text-sm text-neutral-600">
                Externe Mannschaft hinzufügen
              </label>
              <input
                id="externalName"
                name="externalName"
                required
                placeholder="z. B. SV Beispielhausen"
                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Hinzufügen
              </button>
            </form>
          </div>
        )}
      </section>

      {/* Gruppen */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Gruppen</h2>
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Gruppen angelegt.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <li key={group.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                <span className="font-medium text-[var(--color-dark)]">{group.name}</span>
                <ul className="mt-1 space-y-0.5 text-sm text-neutral-500">
                  {activeParticipants
                    .filter((p) => p.groupId === group.id)
                    .map((p) => (
                      <li key={p.id}>{participantLabel(p)}</li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {tournament.canEdit && (
          <form
            action={createTournamentGroupAction.bind(null, tournament.id)}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <input
              name="name"
              placeholder="z. B. Gruppe A"
              required
              aria-label="Name der neuen Gruppe"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Gruppe anlegen
            </button>
          </form>
        )}
      </section>

      {/* Spielstätten */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Spielstätten</h2>
        {venues.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Spielstätten zugeordnet.
          </p>
        ) : (
          <ul className="space-y-2">
            {venues.map((venue) => (
              <li
                key={venue.venueId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white p-3"
              >
                <span className="text-[var(--color-dark)]">
                  {venue.label ? `${venue.label} (${venue.venueName})` : venue.venueName}
                </span>
                {tournament.canEdit && (
                  <form action={removeTournamentVenueAction.bind(null, tournament.id, venue.venueId)}>
                    <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
                      Entfernen
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {tournament.canEdit && availableVenues.length > 0 && (
          <form
            action={addTournamentVenueAction.bind(null, tournament.id)}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <select
              name="venueId"
              required
              aria-label="Spielstätte auswählen"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              {availableVenues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
            <input
              name="label"
              placeholder="Bezeichnung (optional, z. B. Hauptplatz)"
              aria-label="Bezeichnung der Spielstätte im Turnier"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Zuordnen
            </button>
          </form>
        )}
        <p>
          <Link href="/spielstaetten" className="text-xs text-neutral-500 hover:text-[var(--color-primary)] hover:underline">
            Spielstätten verwalten
          </Link>
        </p>
      </section>

      {/* Spiele */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Spiele</h2>
        {tournament.canEdit && matches.length === 0 && (
          <Link
            href={`/fussball/turniere/${tournament.id}/spielplan`}
            className="inline-block rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Spielplan erstellen
          </Link>
        )}
        {matches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Spiele angelegt.
          </p>
        ) : (
          <ul className="space-y-2">
            {matches.map((match) => (
              <li key={match.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                <p className="text-sm text-neutral-500">{formatDateTime(match.startsAt)}</p>
                <p className="font-medium text-[var(--color-dark)]">
                  {match.homeParticipantName} – {match.awayParticipantName}
                  {match.status === "COMPLETED" && match.homeScore != null && match.awayScore != null
                    ? ` ${match.homeScore}:${match.awayScore}`
                    : ""}
                </p>
                <p className="text-sm text-neutral-500">
                  {match.tournamentGroupName ?? "Ohne Gruppe"}
                  {match.venueName ? ` · ${match.venueName}` : ""}
                  {match.status !== "SCHEDULED" ? ` · ${MATCH_STATUS_LABELS[match.status]}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}

        {tournament.canEdit && activeParticipants.length >= 2 && (
          <form
            action={createTournamentMatchAction.bind(null, tournament.id)}
            className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="homeParticipantId" className="text-sm text-neutral-600">
                Heimmannschaft
              </label>
              <select
                id="homeParticipantId"
                name="homeParticipantId"
                required
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                {activeParticipants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {participantLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="awayParticipantId" className="text-sm text-neutral-600">
                Auswärtsmannschaft
              </label>
              <select
                id="awayParticipantId"
                name="awayParticipantId"
                required
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                {activeParticipants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {participantLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <DateTimeInput name="startsAt" label="Datum und Uhrzeit" required />
            <div className="flex flex-col gap-1">
              <label htmlFor="homeAway" className="text-sm text-neutral-600">
                Heim/Auswärts
              </label>
              <select
                id="homeAway"
                name="homeAway"
                required
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                {Object.entries(MATCH_HOME_AWAY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {groups.length > 0 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="tournamentGroupId" className="text-sm text-neutral-600">
                  Gruppe
                </label>
                <select
                  id="tournamentGroupId"
                  name="tournamentGroupId"
                  defaultValue=""
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="">Ohne Gruppe (z. B. K.-o.-Spiel)</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {venues.length > 0 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="venueId" className="text-sm text-neutral-600">
                  Spielstätte
                </label>
                <select
                  id="venueId"
                  name="venueId"
                  defaultValue=""
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="">Keine Angabe</option>
                  {venues.map((venue) => (
                    <option key={venue.venueId} value={venue.venueId}>
                      {venue.label ? `${venue.label} (${venue.venueName})` : venue.venueName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Spiel anlegen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
