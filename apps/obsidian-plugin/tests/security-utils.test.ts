import { describe, expect, it } from "vitest";

import { sanitizeFileName, validateEnvelopeShape } from "../src/security-utils";

describe("validateEnvelopeShape", () => {
  it("accepts a valid envelope", () => {
    const envelope = {
      source: "canvas-browser-extension",
      version: "1",
      payload: {
        courseId: "123",
        courseName: "Course",
        syncedAt: new Date().toISOString(),
        pages: [],
        assignments: [],
        announcements: [],
        discussions: [],
        calendarEvents: []
      }
    } as const;

    expect(() => validateEnvelopeShape(envelope as any)).not.toThrow();
  });

  it("rejects unexpected source", () => {
    expect(() =>
      validateEnvelopeShape({ source: "bad", version: "1", payload: { courseId: "1", courseName: "A" } } as any)
    ).toThrow(/Unexpected payload source/);
  });

  it("rejects unsupported version", () => {
    expect(() =>
      validateEnvelopeShape({
        source: "canvas-browser-extension",
        version: "2",
        payload: { courseId: "1", courseName: "A" }
      } as any)
    ).toThrow(/Unsupported payload version/);
  });
});

describe("sanitizeFileName", () => {
  it("replaces invalid filename characters", () => {
    expect(sanitizeFileName('A:/B*"C"?')).toBe("A--B--C--");
  });

  it("returns Untitled for empty output", () => {
    expect(sanitizeFileName("   ")).toBe("Untitled");
  });
});
