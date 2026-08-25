import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Plain unit tests only — no real database needed. See
    // vitest.integration.config.mts for the *.integration.spec.ts suite
    // that does require one (run separately via `pnpm test:integration`).
    include: ["src/**/*.spec.ts"],
    exclude: ["src/**/*.integration.spec.ts"],
  },
});
