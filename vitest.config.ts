import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(here, "tests/__mocks__/obsidian.ts")
    }
  },
  test: {
    include: [
      "tests/**/*.test.ts"
    ],
    environment: "node"
  }
});
