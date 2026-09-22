import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "../src");
const pluginMainPath = path.resolve(here, "../src/main.ts");
const apiClientPath = path.resolve(here, "../src/api/canvas-client.ts");
const modalPath = path.resolve(here, "../src/modals/course-select-modal.ts");

function readText(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function getAllTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function readAllSources(): string {
  return getAllTsFiles(srcDir).map((f) => readText(f)).join("\n");
}

describe("Obsidian guideline guardrails", () => {
  it("avoids unsafe HTML insertion APIs in plugin source", () => {
    const allSource = readAllSources();
    expect(allSource).not.toMatch(/\binnerHTML\b/);
    expect(allSource).not.toMatch(/\bouterHTML\b/);
    expect(allSource).not.toMatch(/\binsertAdjacentHTML\b/);
  });

  it("avoids Vault adapter API usage in plugin source", () => {
    const allSource = readAllSources();
    expect(allSource).not.toMatch(/vault\.adapter\./);
  });

  it("uses atomic background file writes", () => {
    const allSource = readAllSources();
    expect(allSource).toMatch(/vault\.process\(/);
    expect(allSource).not.toMatch(/vault\.modify\(/);
  });

  it("uses Obsidian native requestUrl for mobile and CORS compatibility", () => {
    const apiSource = readText(apiClientPath);
    expect(apiSource).toContain("requestUrl");
  });

  it("avoids static style assignments in plugin UI components", () => {
    const allSource = readAllSources();
    const modalSource = readText(modalPath);
    expect(allSource).not.toMatch(/\.style\.[a-zA-Z]+\s*=/);
    expect(modalSource).not.toMatch(/\.style\.[a-zA-Z]+\s*=/);
  });

  it("uses Setting headings instead of HTML heading elements in settings tab", () => {
    const allSource = readAllSources();
    expect(allSource).toMatch(/\.setName\("Canvas API integration"\)\.setHeading\(\)/);
    expect(allSource).toMatch(/\.setName\("Browser extension bridge \(optional\)"\)\.setHeading\(\)/);
    expect(allSource).toMatch(/\.setName\("Vault & organization"\)\.setHeading\(\)/);
    expect(allSource).toMatch(/\.setName\("Asset downloads & attachments"\)\.setHeading\(\)/);
  });

  it("guards Node.js http server import for mobile compatibility", () => {
    const allSource = readAllSources();
    expect(allSource).not.toMatch(/from\s+["'](node:)?http["']/);
    expect(allSource).toMatch(/Platform\.isDesktop/);
  });

  it("keeps setting labels in sentence case", () => {
    const allSource = readAllSources();
    expect(allSource).toContain('.setName("Canvas base URL")');
    expect(allSource).toContain('.setName("Canvas API token")');
    expect(allSource).toContain('.setName("Test connection")');
    expect(allSource).toContain('.setName("Root folder")');
    expect(allSource).toContain('.setName("Course folder template")');
    expect(allSource).toContain('.setName("Include inactive & past courses")');
    expect(allSource).toContain('.setName("Sync discussion replies")');
    expect(allSource).toContain('.setName("Sync student submissions & grades")');
    expect(allSource).toContain('.setName("Store raw payload")');
    expect(allSource).not.toContain('.setName("Canvas Base URL")');
    expect(allSource).not.toContain('.setName("Canvas API Token")');
    expect(allSource).not.toContain('.setName("Include Inactive & Past Courses")');
    expect(allSource).not.toContain('.setName("Test Connection")');
    expect(allSource).not.toContain('.setName("Root Folder")');
    expect(allSource).not.toContain('.setName("Course Folder Template")');
    expect(allSource).not.toContain('.setName("Store Raw Payload")');
  });

  it("avoids forbidden eslint-disable comments across all source files", () => {
    const allFiles = getAllTsFiles(srcDir);
    for (const file of allFiles) {
      const src = readText(file);
      expect(src).not.toMatch(/\/\*\s*eslint-disable/);
    }
  });

  it("avoids globalThis in plugin source files in favor of window/activeWindow", () => {
    const allFiles = getAllTsFiles(srcDir);
    for (const file of allFiles) {
      const src = readText(file);
      expect(src).not.toMatch(/\bglobalThis\b/);
    }
  });

  it("implements getSettingDefinitions for declarative settings search indexing", () => {
    const allSource = readAllSources();
    expect(allSource).toMatch(/getSettingDefinitions\(\)/);
    expect(allSource).toContain('key: "canvasBaseUrl"');
    expect(allSource).toContain('key: "canvasApiToken"');
    expect(allSource).toContain('key: "enableBridgeServer"');
    expect(allSource).toContain('key: "rootFolder"');
  });

  it("avoids console.log in plugin source files per Obsidian plugin guidelines", () => {
    const allFiles = getAllTsFiles(srcDir);
    for (const file of allFiles) {
      const src = readText(file);
      expect(src).not.toMatch(/console\.log\(/);
    }
  });

  it("avoids regex lookbehinds across all plugin source files for iOS/Safari WebKit compatibility", () => {
    const allFiles = getAllTsFiles(srcDir);
    for (const file of allFiles) {
      const src = readText(file);
      expect(src).not.toMatch(/\(\?<[=!]/);
    }
  });

  it("guards Desktop-only bridge features with Platform.isMobile", () => {
    const allSource = readAllSources();
    expect(allSource).toMatch(/Platform\.isMobile/);
    expect(allSource).toMatch(/!Platform\.isMobile/);
    expect(allSource).toContain("Direct REST API active");
  });

  it("includes responsive mobile modal CSS rules and 44px touch targets in styles.css", () => {
    const cssPath = path.resolve(here, "../styles.css");
    const css = readText(cssPath);
    expect(css).toContain(".is-mobile");
    expect(css).toContain("@media (max-width: 600px)");
    expect(css).toContain("min(45vh, 340px)");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain(".canvas-course-row");
    expect(css).toContain(".canvas-modal-footer");
    expect(css).toContain(".canvas-search-filter-setting");
  });
});
