import { IsIn, IsInt, IsUUID, Min, ValidateIf } from "class-validator";

/**
 * One seeded entrant of a knockout bracket, client-supplied in seed order
 * (index 0 = seed 1). `TEAM` and `GROUP_POSITION` are the only sources a
 * client can configure directly — `WINNER_OF_MATCH`/`LOSER_OF_MATCH` only
 * ever arise INSIDE the generated bracket itself (see `SlotSource`), never
 * as a top-level entrant.
 */
export class KnockoutEntrantDto {
  @IsIn(["TEAM", "GROUP_POSITION"])
  type!: "TEAM" | "GROUP_POSITION";

  @ValidateIf((o: KnockoutEntrantDto) => o.type === "TEAM")
  @IsUUID()
  participantId?: string;

  @ValidateIf((o: KnockoutEntrantDto) => o.type === "GROUP_POSITION")
  @IsUUID()
  groupId?: string;

  @ValidateIf((o: KnockoutEntrantDto) => o.type === "GROUP_POSITION")
  @IsInt()
  @Min(1)
  position?: number;
}
