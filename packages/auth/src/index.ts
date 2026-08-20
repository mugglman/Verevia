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
