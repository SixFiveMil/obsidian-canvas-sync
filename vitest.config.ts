import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(here, "apps/obsidian-plugin/tests/__mocks__/obsidian.ts")
    }
  },
  test: {
    include: [
      "apps/browser-extension/tests/**/*.test.ts",
      "apps/obsidian-plugin/tests/**/*.test.ts"
    ],
    environment: "node"
  }
});
