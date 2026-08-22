import crypto from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { auth } from "@verevia/auth";
import { getTenantContext, getTenantPrisma, prisma, Prisma } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { MailService } from "../mail/mail.service";

const TOKEN_BYTES = 32;
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 Stunde
const RATE_LIMIT_MAX_PER_PERSON = 3;

export interface InvitationSummaryDto {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
}

export interface CreateInvitationResultDto extends InvitationSummaryDto {
  /**
   * The raw, one-time invitation token — included ONLY outside production
   * (`NODE_ENV !== "production"`). There is no real mail provider yet
   * (Phase 6, section 12); this is the only way dev/CI/VPS verification
   * and automated tests can exercise the accept flow without a real
   * inbox. The real delivery channel is always the (dev-only, logged)
   * MailService send — never rely on this field once a production mail
   * provider exists. The web UI never reads this field.
   */
  token?: string;
}

export interface PublicInvitationDto {
  tenantName: string;
  personFirstName: string;
  email: string;
  accountExists: boolean;
}

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly mail: MailService,
    private readonly authz: AuthorizationService,
    private readonly roleAssignments: PersonRoleAssignmentsService,
  ) {}

  private requireContext() {
    const context = getTenantContext();
    if (!context?.personId) {
      throw new UnauthorizedException("No active tenant context");
    }
    return context;
  }

  private async requireManageAccess(tenantId: string, callerPersonId: string): Promise<void> {
    const assignments = await this.roleAssignments.load(tenantId, callerPersonId);
    if (!this.authz.canManageInvitations(assignments)) {
      throw new ForbiddenException("Not permitted to manage invitations");
    }
  }

  private toSummary(invitation: {
    id: string;
    email: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
    acceptedAt: Date | null;
  }): InvitationSummaryDto {
    return {
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      acceptedAt: invitation.acceptedAt ? invitation.acceptedAt.toISOString() : null,
    };
  }

  async list(personId: string): Promise<InvitationSummaryDto[]> {
    const context = this.requireContext();
    await this.requireManageAccess(context.tenantId, context.personId!);
    const tenantId = context.tenantId;
    const db = getTenantPrisma(tenantId);
    const person = await db.person.findUnique({ where: { id: personId } });
    if (!person) {
      throw new NotFoundException("Person not found");
    }
    // AccountInvitation has no RLS (see schema.prisma comment) — the
    // explicit tenantId filter below is the application-layer guarantee
    // that replaces it for this tenant-scoped read.
    const invitations = await db.accountInvitation.findMany({
      where: { tenantId, personId },
      orderBy: { createdAt: "desc" },
    });
    return invitations.map((i) => this.toSummary(i));
  }

  async create(personId: string, email: string): Promise<CreateInvitationResultDto> {
    const context = this.requireContext();
    await this.requireManageAccess(context.tenantId, context.personId!);
    const tenantId = context.tenantId;
    const invitedByUserId = context.userId!;
    const db = getTenantPrisma(tenantId);
    const person = await db.person.findUnique({ where: { id: personId } });
    if (!person) {
      throw new NotFoundException("Person not found");
    }

    const existingMembership = await db.membership.findUnique({ where: { personId } });
    if (existingMembership) {
      throw new ConflictException("This person is already linked to an account");
    }

    // Simple, DB-based rate limit (Phase 6, section 11) — not a
    // distributed/production-grade limiter, but a real, enforced
    // safeguard against invitation spam for a single person. Explicit
    // tenantId filter: AccountInvitation has no RLS, see schema comment.
    const recentCount = await db.accountInvitation.count({
      where: {
        tenantId,
        personId,
        createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
      },
    });
    if (recentCount >= RATE_LIMIT_MAX_PER_PERSON) {
      throw new ConflictException("Too many invitations sent for this person recently");
    }

    // Resending revokes the previous PENDING invitation first — the
    // partial unique index (account_invitation_pending_person_key) is the
    // DB-level guarantee that at most one PENDING row exists per person,
    // this is the application-side half of that same rule.
    const existingPending = await db.accountInvitation.findFirst({
      where: { tenantId, personId, status: "PENDING" },
    });
    if (existingPending) {
      await db.accountInvitation.update({
        where: { id: existingPending.id },
        data: { status: "REVOKED" },
      });
    }

    const token = generateToken();
    const tokenHash = hashToken(token);

    let created;
    try {
      created = await db.accountInvitation.create({
        data: {
          tenantId,
          personId,
          email,
          tokenHash,
          expiresAt: new Date(Date.now() + EXPIRY_MS),
          invitedByUserId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A pending invitation for this person already exists");
      }
      throw error;
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const acceptUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/einladung/${token}`;
    await this.mail.send({
      to: email,
      subject: `Einladung zu ${tenant.name} auf Verevia`,
      text: [
        `Hallo,`,
        ``,
        `du wurdest eingeladen, dich für ${person.firstName} ${person.lastName} bei "${tenant.name}" auf Verevia anzumelden.`,
        ``,
        `Einladung annehmen: ${acceptUrl}`,
        ``,
        `Dieser Link ist 7 Tage gültig.`,
        ``,
        `Falls du diese E-Mail nicht erwartet hast, kannst du sie einfach ignorieren.`,
      ].join("\n"),
    });

    return {
      ...this.toSummary(created),
      ...(process.env.NODE_ENV !== "production" ? { token } : {}),
    };
  }

  async revoke(personId: string, invitationId: string): Promise<void> {
    const context = this.requireContext();
    await this.requireManageAccess(context.tenantId, context.personId!);
    const tenantId = context.tenantId;
    const db = getTenantPrisma(tenantId);
    // AccountInvitation has no RLS (see schema comment) — both tenantId
    // and personId are checked explicitly here as the application-layer
    // replacement, so a manipulated invitationId can never reach or
    // revoke another tenant's invitation.
    const invitation = await db.accountInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.tenantId !== tenantId || invitation.personId !== personId) {
      throw new NotFoundException("Invitation not found");
    }
    if (invitation.status !== "PENDING") {
      throw new ConflictException("Only a pending invitation can be revoked");
    }
    await db.accountInvitation.update({ where: { id: invitationId }, data: { status: "REVOKED" } });
  }

  /**
   * Public lookup (no session required) — returns only what an
   * unauthenticated visitor on /einladung/:token needs to render the
   * accept page. Any invalid/expired/revoked/unknown token yields the
   * same generic 404 (Phase 6, section 11: no detail in error messages
   * that could help enumerate tokens).
   */
  async lookupPublic(token: string): Promise<PublicInvitationDto> {
    const tokenHash = hashToken(token);
    const invitation = await prisma.accountInvitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
      throw new NotFoundException("Invitation not found or no longer valid");
    }
    // Person is RLS-protected and requires app.tenant_id to be set to be
    // visible at all — unlike AccountInvitation, it is NOT exempt. The
    // plain `prisma` client (no tenant context) would therefore always
    // see zero rows here. That's fine now: the invitation row above has
    // already told us which tenant this is, so from this point on the
    // normal tenant-scoped path applies.
    const db = getTenantPrisma(invitation.tenantId);
    const [tenant, person, existingUser] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: invitation.tenantId } }),
      db.person.findFirstOrThrow({ where: { id: invitation.personId } }),
      prisma.user.findUnique({ where: { email: invitation.email } }),
    ]);
    return {
      tenantName: tenant.name,
      personFirstName: person.firstName,
      email: invitation.email,
      accountExists: existingUser !== null,
    };
  }

  /**
   * Accept requires a real, already-established better-auth session — the
   * accepting person signs up or logs in via the normal better-auth
   * endpoints first (see apps/web/src/app/einladung/[token]/page.tsx);
   * this endpoint only performs the final "link this session's User to
   * this Person" step. Deliberately NOT behind TenantContextInterceptor:
   * the accepting user has no Membership in this tenant yet — that is
   * exactly what this call creates.
   */
  async accept(token: string, headers: Record<string, string>): Promise<{ tenantSlug: string }> {
    const session = await auth.api.getSession({ headers: new Headers(headers) });
    if (!session) {
      throw new UnauthorizedException("No active session");
    }

    const tokenHash = hashToken(token);
    const invitation = await prisma.accountInvitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
      throw new NotFoundException("Invitation not found or no longer valid");
    }

    if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException(
        "The signed-in account does not match the email this invitation was sent to",
      );
    }

    const existingMembership = await prisma.membership.findUnique({
      where: { personId: invitation.personId },
    });
    if (existingMembership) {
      throw new BadRequestException("This person is already linked to an account");
    }

    await prisma.membership.create({
      data: { userId: session.user.id, personId: invitation.personId, status: "ACTIVE" },
    });
    await prisma.accountInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: invitation.tenantId } });
    return { tenantSlug: tenant.slug };
  }
}
