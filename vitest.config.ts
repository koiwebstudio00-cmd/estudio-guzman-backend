import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/{unit,api}/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 15_000,
    fileParallelism: false,
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**"]
    }
  }
});
