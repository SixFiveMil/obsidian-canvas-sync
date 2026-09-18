import { describe, expect, it } from "vitest";
import { getAllowedExtensionOrigin, isAllowedOrigin, sanitizeFileName, sanitizePath } from "../src/security-utils";

describe("sanitizeFileName", () => {
  it("replaces invalid filename characters", () => {
    expect(sanitizeFileName('A:/B*"C"?')).toBe("A--B--C--");
  });

  it("returns Untitled for empty output", () => {
    expect(sanitizeFileName("   ")).toBe("Untitled");
  });
});

describe("sanitizePath", () => {
  it("sanitizes path segments and normalizes separators", () => {
    expect(sanitizePath("Folder/Sub:Folder/File*Name.md")).toBe("Folder/Sub-Folder/File-Name.md");
  });

  it("strips directory traversal segments", () => {
    expect(sanitizePath("../Secret/../../Notes/Doc.md")).toBe("Secret/Notes/Doc.md");
  });
});

describe("isAllowedOrigin and getAllowedExtensionOrigin", () => {
  it("allows undefined/null origin for local background service workers", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin(null)).toBe(true);
  });

  it("allows chrome-extension and moz-extension origins", () => {
    expect(isAllowedOrigin("chrome-extension://abcdefghijklmnopqrstuvwxyz")).toBe(true);
    expect(isAllowedOrigin("moz-extension://1234-5678-90ab")).toBe(true);
    expect(getAllowedExtensionOrigin("chrome-extension://abcdefghijklmnopqrstuvwxyz")).toBe("chrome-extension://abcdefghijklmnopqrstuvwxyz");
    expect(getAllowedExtensionOrigin("moz-extension://1234-5678-90ab")).toBe("moz-extension://1234-5678-90ab");
  });

  it("blocks untrusted web origins", () => {
    expect(isAllowedOrigin("https://evil.com")).toBe(false);
    expect(isAllowedOrigin("http://attacker.com")).toBe(false);
    expect(getAllowedExtensionOrigin("https://evil.com")).toBeNull();
  });
});
