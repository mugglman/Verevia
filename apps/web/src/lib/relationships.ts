export type RelationshipTypeName = "PARENT" | "LEGAL_GUARDIAN" | "EMERGENCY_CONTACT";

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipTypeName, string> = {
  PARENT: "Elternteil",
  LEGAL_GUARDIAN: "Erziehungsberechtigter",
  EMERGENCY_CONTACT: "Notfallkontakt",
};

export const ALL_RELATIONSHIP_TYPES = Object.keys(
  RELATIONSHIP_TYPE_LABELS,
) as RelationshipTypeName[];

export const INVITATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Einladung gesendet — wartet auf Annahme",
  ACCEPTED: "Angenommen",
  EXPIRED: "Abgelaufen",
  REVOKED: "Widerrufen",
};
