import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@verevia/database";

/**
 * better-auth configuration (structure only, Phase 1 skeleton).
 *
 * NOT yet mounted into apps/api. Wiring it in requires, per the verified
 * spike (docs/ARCHITEKTUR_FINALISIERUNG.md, section 1):
 *   1. NestFactory.create(AppModule, { bodyParser: false })
 *   2. app.getHttpAdapter().getInstance().all("/api/auth/{*splat}", toNodeHandler(auth))
 *      BEFORE re-enabling body parsing for the rest of the app
 *   3. Express 5's `{*splat}` wildcard syntax (not the Express 4 `*`)
 *
 * That wiring, plus real trustedOrigins/secret handling for prod, lands in
 * a dedicated work package — see docs/architecture/adr/0002-authentication-strategy.md.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.APP_URL ?? "http://localhost:3000"],
  // Phase 7: apps/web (app.verevia.app) and apps/api (api.verevia.app)
  // are genuinely different origins once deployed — the client-side
  // authClient calls api.verevia.app from app.verevia.app via a
  // cross-origin fetch(credentials:"include"), which browsers do NOT
  // attach SameSite=Lax cookies to (Lax only covers top-level
  // navigations). Undetectable in local dev, where both run on
  // `localhost` (different ports, same hostname = same-site regardless
  // of SameSite). Scoping the cookie's Domain to the shared parent
  // domain makes both subdomains "same-site" again, so Lax keeps
  // working rather than needing to loosen to SameSite=None. Opt-in via
  // COOKIE_DOMAIN (unset locally/CI — only set for real subdomain
  // deployments, see infrastructure/docker/.env.dev.example).
  advanced: process.env.COOKIE_DOMAIN
    ? { crossSubDomainCookies: { enabled: true, domain: process.env.COOKIE_DOMAIN } }
    : undefined,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    // Verevia domain field on top of better-auth's own User columns.
    // Kept in sync with the `UserStatus` enum in packages/database/prisma/schema.prisma.
    additionalFields: {
      status: {
        type: "string",
        defaultValue: "ACTIVE",
        input: false,
      },
    },
  },
});
