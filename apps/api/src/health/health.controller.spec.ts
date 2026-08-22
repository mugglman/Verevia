import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  const originalVersion = process.env.APP_VERSION;
  afterEach(() => {
    if (originalVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = originalVersion;
  });

  it('returns { status: "ok" } with no version field when APP_VERSION is unset', async () => {
    delete process.env.APP_VERSION;
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = moduleRef.get(HealthController);
    expect(controller.check()).toEqual({ status: "ok" });
  });

  it("includes the deployed version when APP_VERSION is set", async () => {
    process.env.APP_VERSION = "abc1234";
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = moduleRef.get(HealthController);
    expect(controller.check()).toEqual({ status: "ok", version: "abc1234" });
  });
});
