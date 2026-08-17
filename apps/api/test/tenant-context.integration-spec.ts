import "reflect-metadata";
import { Controller, Get, INestApplication, Module, UseInterceptors } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@verevia/auth";
import { createAdminPrismaForTests } from "@verevia/database";
import { TenantContextInterceptor } from "../src/tenant/tenant-context.interceptor";

/**
 * End-to-end verification of TenantContextInterceptor against a real
 * PostgreSQL instance and a real better-auth session (via an actual
 * HTTP signup, not a mocked one) — see docs/PHASE_2_CORE_REPORT.md,
 * "RLS-Testfälle". Requires DATABASE_URL (verevia_app role) and
 * ADMIN_DATABASE_URL (superuser, fixture setup only); not part of the
 * default `pnpm test`/CI run, same reasoning as the RLS integration tests
 * in packages/database.
 */

@Controller()
class ProtectedTestController {
  @Get("/tenant-protected")
  @UseInterceptors(TenantContextInterceptor)
  handle() {
    return { ok: true };
  }
}

@Module({ controllers: [ProtectedTestController] })
class TestAppModule {}

describe("TenantContextInterceptor (e2e)", () => {
  let app: INestApplication;
  // Nest's getHttpServer() is typed `any`; give supertest what it expects.
  let server: import("http").Server;
  const adminPrisma = createAdminPrismaForTests();

  let tenantId: string;
  let otherTenantId: string;
  let sessionCookie: string;
  const email = `interceptor-test-${Date.now()}@example.invalid`;
  const password = "Sup3rSicher!Test";

  beforeAll(async () => {
    app = await NestFactory.create(TestAppModule, { bodyParser: false });
    const expressInstance = app.getHttpAdapter().getInstance();
    expressInstance.all("/api/auth/{*splat}", toNodeHandler(auth));
    const express = await import("express");
    app.use(express.default.json());
    await app.init();
    server = app.getHttpServer();

    const signupResponse = await request(server)
      .post("/api/auth/sign-up/email")
      .send({ email, password, name: "Interceptor Test" });
    const setCookie = signupResponse.headers["set-cookie"];
    sessionCookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);

    const dbUser = await adminPrisma.user.findUniqueOrThrow({ where: { email } });

    const tenant = await adminPrisma.tenant.create({
      data: { name: "Interceptor Test Tenant", slug: `interceptor-test-${Date.now()}` },
    });
    tenantId = tenant.id;
    const person = await adminPrisma.person.create({
      data: { tenantId, firstName: "Interceptor", lastName: "Test" },
    });
    await adminPrisma.membership.create({
      data: { userId: dbUser.id, personId: person.id, status: "ACTIVE" },
    });

    const otherTenant = await adminPrisma.tenant.create({
      data: { name: "Other Tenant", slug: `interceptor-other-${Date.now()}` },
    });
    otherTenantId = otherTenant.id;
  });

  afterAll(async () => {
    await adminPrisma.membership.deleteMany({});
    await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    const user = await adminPrisma.user.findUnique({ where: { email } });
    if (user) {
      await adminPrisma.session.deleteMany({ where: { userId: user.id } });
      await adminPrisma.account.deleteMany({ where: { userId: user.id } });
      await adminPrisma.user.delete({ where: { id: user.id } });
    }
    await adminPrisma.$disconnect();
    await app.close();
  });

  it("rejects requests with no X-Tenant-Id header", async () => {
    const response = await request(server)
      .get("/tenant-protected")
      .set("Cookie", sessionCookie);
    expect(response.status).toBe(403);
  });

  it("rejects requests with no session cookie", async () => {
    const response = await request(server)
      .get("/tenant-protected")
      .set("X-Tenant-Id", tenantId);
    expect(response.status).toBe(401);
  });

  it("rejects a valid session for a tenant the user has no membership in", async () => {
    const response = await request(server)
      .get("/tenant-protected")
      .set("Cookie", sessionCookie)
      .set("X-Tenant-Id", otherTenantId);
    expect(response.status).toBe(403);
  });

  it("allows the request through with a valid session AND active membership", async () => {
    const response = await request(server)
      .get("/tenant-protected")
      .set("Cookie", sessionCookie)
      .set("X-Tenant-Id", tenantId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
