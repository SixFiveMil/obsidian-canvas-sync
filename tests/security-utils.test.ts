import { describe, expect, it } from "vitest";
import { getAllowedExtensionOrigin, isAllowedOrigin, sanitizeFileName, sanitizePath } from "../src/utils";

describe("sanitizeFileName", () => {
  it("replaces invalid filename characters and trims trailing dashes", () => {
    expect(sanitizeFileName('A:/B*"C"?')).toBe("A--B--C");
  });

  it("returns Untitled for empty output", () => {
    expect(sanitizeFileName("   ")).toBe("Untitled");
    expect(sanitizeFileName("")).toBe("Untitled");
  });

  it("truncates long names to maxLength and trims trailing punctuation", () => {
    const longTitle =
      "The final exam is a standardized final written by the American Chemical Society (ACS). This national organization has also created a guidebook to help students prepare for the exam. Two copies of this guidebook are on reserve in the library. Students will need to go to the main desk at the library and they can check them out for 4 hours at a time. This book is also available online at various locations. The guidebook is for BOTH semesters of general chemistry, but the book provides a division of content between the one semester and two semester exams. Click on the link below to see the library information about these books on reserve..";
    const sanitized = sanitizeFileName(longTitle, 100);
    expect(sanitized.length).toBeLessThanOrEqual(100);
    expect(sanitized).not.toMatch(/[.\-\s]+$/);
    expect(sanitized.startsWith("The final exam is a standardized final written by the American Chemical Society (ACS)")).toBe(true);
  });

  it("cleans trailing dots and spaces before extension", () => {
    expect(sanitizeFileName("Exam Guidebook..")).toBe("Exam Guidebook");
    expect(sanitizeFileName("Lecture Notes - - ")).toBe("Lecture Notes");
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
