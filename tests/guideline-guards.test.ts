import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginMainPath = path.resolve(here, "../src/main.ts");
const apiClientPath = path.resolve(here, "../src/canvas-api-client.ts");

const modalPath = path.resolve(here, "../src/course-select-modal.ts");

function readText(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

describe("Obsidian guideline guardrails", () => {
  it("avoids unsafe HTML insertion APIs in plugin source", () => {
    const source = readText(pluginMainPath);
    expect(source).not.toMatch(/\binnerHTML\b/);
    expect(source).not.toMatch(/\bouterHTML\b/);
    expect(source).not.toMatch(/\binsertAdjacentHTML\b/);
  });

  it("avoids Vault adapter API usage in plugin source", () => {
    const source = readText(pluginMainPath);
    expect(source).not.toMatch(/vault\.adapter\./);
  });

  it("uses atomic background file writes", () => {
    const source = readText(pluginMainPath);
    expect(source).toMatch(/vault\.process\(/);
    expect(source).not.toMatch(/vault\.modify\(/);
  });

  it("uses Obsidian native requestUrl for mobile and CORS compatibility", () => {
    const apiSource = readText(apiClientPath);
    expect(apiSource).toContain('requestUrl');
  });

  it("avoids static style assignments in plugin UI components", () => {
    const mainSource = readText(pluginMainPath);
    const modalSource = readText(modalPath);
    expect(mainSource).not.toMatch(/\.style\.[a-zA-Z]+\s*=/);
    expect(modalSource).not.toMatch(/\.style\.[a-zA-Z]+\s*=/);
  });

  it("uses Setting headings instead of HTML heading elements in settings tab", () => {
    const source = readText(pluginMainPath);
    expect(source).toMatch(/\.setName\("Canvas API integration"\)\.setHeading\(\)/);
    expect(source).toMatch(/\.setName\("Browser extension bridge \(optional\)"\)\.setHeading\(\)/);
    expect(source).toMatch(/\.setName\("Vault & organization"\)\.setHeading\(\)/);
    expect(source).toMatch(/\.setName\("Asset downloads & attachments"\)\.setHeading\(\)/);
  });

  it("guards Node.js http server import for mobile compatibility", () => {
    const source = readText(pluginMainPath);
    expect(source).not.toMatch(/from\s+["'](node:)?http["']/);
    expect(source).toMatch(/Platform\.isDesktop/);
  });

  it("keeps setting labels in sentence case", () => {
    const source = readText(pluginMainPath);
    expect(source).toContain('.setName("Canvas base URL")');
    expect(source).toContain('.setName("Canvas API token")');
    expect(source).toContain('.setName("Test connection")');
    expect(source).toContain('.setName("Root folder")');
    expect(source).toContain('.setName("Course folder template")');
    expect(source).toContain('.setName("Include inactive & past courses")');
    expect(source).toContain('.setName("Sync discussion replies")');
    expect(source).toContain('.setName("Sync student submissions & grades")');
    expect(source).toContain('.setName("Store raw payload")');
    expect(source).not.toContain('.setName("Canvas Base URL")');
    expect(source).not.toContain('.setName("Canvas API Token")');
    expect(source).not.toContain('.setName("Include Inactive & Past Courses")');
    expect(source).not.toContain('.setName("Test Connection")');
    expect(source).not.toContain('.setName("Root Folder")');
    expect(source).not.toContain('.setName("Course Folder Template")');
    expect(source).not.toContain('.setName("Store Raw Payload")');
  });

  it("avoids forbidden eslint-disable comments across all source files", () => {
    const pluginDir = path.resolve(here, "../src");
    for (const file of ["main.ts", "course-select-modal.ts", "canvas-api-client.ts", "link-utils.ts", "table-utils.ts", "template-utils.ts", "types.ts"]) {
      const src = readText(path.resolve(pluginDir, file));
      expect(src).not.toMatch(/\/\*\s*eslint-disable/);
    }
  });

  it("implements getSettingDefinitions for declarative settings search indexing", () => {
    const source = readText(pluginMainPath);
    expect(source).toMatch(/getSettingDefinitions\(\)/);
    expect(source).toContain('key: "canvasBaseUrl"');
    expect(source).toContain('key: "canvasApiToken"');
    expect(source).toContain('key: "enableBridgeServer"');
    expect(source).toContain('key: "rootFolder"');
  });
});

