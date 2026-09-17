import { describe, expect, it } from "vitest";
import { sanitizeFileName, sanitizePath } from "../src/security-utils";

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
