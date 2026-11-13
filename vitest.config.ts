import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.{ts,tsx,mjs,cjs}"],
    passWithNoTests: true,
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
}));
