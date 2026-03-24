import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/browser-extension/tests/**/*.test.ts",
      "apps/obsidian-plugin/tests/**/*.test.ts"
    ],
    environment: "node"
  }
});
