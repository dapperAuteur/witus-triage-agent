import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts", "agent/**/*.test.ts"],
    setupFiles: ["./__tests__/setup.ts"],
    // Live LLM calls in the classify test need headroom.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      // Match the tsconfig `@/*` path alias.
      "@": new URL("./", import.meta.url).pathname,
      // `server-only` throws outside an RSC bundle — stub it for Node tests.
      "server-only": new URL(
        "./__tests__/stubs/empty.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
