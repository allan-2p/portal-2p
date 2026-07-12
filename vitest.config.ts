import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: "default",
    // RLS tests must not run in parallel — they mutate shared auth state.
    fileParallelism: false,
    setupFiles: ["tests/rls/setup.ts"],
  },
});
