import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ["test/**/*.integration-spec.ts"],
    root: "./",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
