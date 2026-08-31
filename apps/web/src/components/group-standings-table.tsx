export interface GroupStandingsTableRow {
  participantId: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  tiedRankGroupSize: number;
}

export interface GroupStandingsTableProps {
  standings: GroupStandingsTableRow[];
  /** Resolves a participant id to its display label — kept a lookup function rather than a full participant list so this component stays decoupled from the caller's own participant DTO shape (authenticated vs. public). */
  participantLabel: (participantId: string) => string;
}

/**
 * Shared, presentation-only group standings table — used by both the
 * authenticated tournament detail page and the public (Phase 17)
 * tournament page, so the rendering (columns, Zwischenstand/Endstand,
 * fachlicher-Gleichstand-Markierung) exists in exactly one place. Purely
 * presentational: takes already-computed rows (see `computeGroupStandings`
 * on the API side, ADR 0012) and renders them — no standings logic here.
 */
export function GroupStandingsTable({ standings, participantLabel }: GroupStandingsTableProps) {
  const hasTie = standings.some((row) => row.tiedRankGroupSize > 1);
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-1.5 pr-2 font-medium">Pos</th>
            <th className="px-2 py-1.5 font-medium">Team</th>
            <th className="px-2 py-1.5 text-right font-medium">Sp</th>
            <th className="px-2 py-1.5 text-right font-medium">S</th>
            <th className="px-2 py-1.5 text-right font-medium">U</th>
            <th className="px-2 py-1.5 text-right font-medium">N</th>
            <th className="px-2 py-1.5 text-right font-medium">Tore</th>
            <th className="px-2 py-1.5 text-right font-medium">Diff</th>
            <th className="py-1.5 pl-2 text-right font-medium">Pkt</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.participantId} className="border-b border-neutral-100 last:border-0">
              <td className="py-1.5 pr-2 text-neutral-500">
                {row.rank}
                {row.tiedRankGroupSize > 1 ? "*" : ""}
              </td>
              <td className="px-2 py-1.5 font-medium text-[var(--color-dark)]">{participantLabel(row.participantId)}</td>
              <td className="px-2 py-1.5 text-right">{row.played}</td>
              <td className="px-2 py-1.5 text-right">{row.wins}</td>
              <td className="px-2 py-1.5 text-right">{row.draws}</td>
              <td className="px-2 py-1.5 text-right">{row.losses}</td>
              <td className="px-2 py-1.5 text-right">
                {row.goalsFor}:{row.goalsAgainst}
              </td>
              <td className="px-2 py-1.5 text-right">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
              <td className="py-1.5 pl-2 text-right font-semibold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasTie && <p className="mt-1 text-xs text-neutral-500">* Platzierung sportlich nicht eindeutig (Punktgleichstand)</p>}
    </div>
  );
}
