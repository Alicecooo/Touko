import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
import { hostTimeout } from "./tests/support/environment/platform-timeout.ts";

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "electron/**/*.test.mjs",
      "src/**/*.test.{ts,tsx}",
      "shared/**/*.test.ts",
      "tests/**/*.test.{ts,tsx,mjs,cjs}",
    ],
    setupFiles: ["tests/support/environment/test-setup.ts"],
    fileParallelism: false,
    testTimeout: hostTimeout(20_000),
    hookTimeout: hostTimeout(30_000),
  },
}));
