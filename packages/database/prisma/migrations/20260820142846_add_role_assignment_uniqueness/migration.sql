-- Phase 5: verhindert identische, doppelte RoleAssignments (gleiche
-- Person, Rolle, Scope und ggf. Department/Team) auf Datenbankebene, nicht
-- nur applikationsseitig — siehe schema.prisma-Kommentar an RoleAssignment.
--
-- Funktionaler Unique-Index mit COALESCE(..., ''), nicht `@@unique`: SQL
-- behandelt NULL <> NULL, sodass ein normaler Unique-Index auf
-- (personId, role, scopeType, departmentId, teamId) zwei TENANT-Scope-
-- Zeilen derselben Person/Rolle (beide mit departmentId=teamId=NULL) NICHT
-- als Duplikat erkennen würde. COALESCE(..., '') normalisiert NULL auf
-- einen konkreten, vergleichbaren Wert, ohne die Unterscheidung zwischen
-- unterschiedlichen Departments/Teams zu verlieren (echte IDs sind niemals
-- der leere String).
--
-- RoleAssignment hat kein `status`-Feld (anders als `TeamMember`) — DELETE
-- entfernt die Zeile tatsächlich (siehe Phase-5-Auftrag, Abschnitt 10),
-- daher genügt ein einfacher (nicht partieller) Unique-Index.

CREATE UNIQUE INDEX "role_assignment_person_role_scope_key"
  ON "role_assignment" ("personId", "role", "scopeType", COALESCE("departmentId", ''), COALESCE("teamId", ''));
