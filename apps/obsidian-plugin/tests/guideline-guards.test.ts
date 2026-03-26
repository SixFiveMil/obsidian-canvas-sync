import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginMainPath = path.resolve(here, "../src/main.ts");
const extensionBackgroundPath = path.resolve(here, "../../browser-extension/src/background.ts");

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

  it("keeps setting labels in sentence case", () => {
    const source = readText(pluginMainPath);
    expect(source).toContain('.setName("Listen port")');
    expect(source).toContain('.setName("Root folder")');
    expect(source).toContain('.setName("Store raw payload")');
    expect(source).not.toContain('.setName("Listen Port")');
    expect(source).not.toContain('.setName("Root Folder")');
    expect(source).not.toContain('.setName("Store Raw Payload")');
  });
});

describe("Bridge request hardening", () => {
  it("restricts plugin acceptance to extension origins", () => {
    const source = readText(pluginMainPath);
    expect(source).toContain('origin.startsWith("chrome-extension://")');
    expect(source).toContain('origin.startsWith("moz-extension://")');
  });

  it("requires and sends a trusted client header", () => {
    const pluginSource = readText(pluginMainPath);
    const extensionSource = readText(extensionBackgroundPath);

    expect(pluginSource).toContain('TRUSTED_CLIENT_HEADER = "x-canvas-sync-client"');
    expect(pluginSource).toContain('TRUSTED_CLIENT_VALUE = "canvas-browser-extension"');
    expect(extensionSource).toContain('"X-Canvas-Sync-Client": "canvas-browser-extension"');
  });

  it("does not use wildcard CORS for bridge responses", () => {
    const source = readText(pluginMainPath);
    expect(source).not.toContain('"Access-Control-Allow-Origin": "*"');
  });
});
