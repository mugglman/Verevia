import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/**
 * GET /health/ready against a real, reachable PostgreSQL instance. See
 * apps/api/test/vitest-integration.config.mts — not part of the default
 * `pnpm test` run, same reasoning as the other *.integration-spec.ts files.
 */
describe("GET /health/ready (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with { status: "ok", database: "ok" } when the database is reachable', async () => {
    const response = await request(app.getHttpServer()).get("/health/ready");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "ok" });
  });
});
