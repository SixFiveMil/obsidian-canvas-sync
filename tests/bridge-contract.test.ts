import { describe, expect, it } from "vitest";
import type { CanvasSyncEnvelope } from "../src/types";

describe("CanvasSyncEnvelope bridge protocol v1 compatibility", () => {
  it("validates well-formed v1 envelope structure", () => {
    const sampleEnvelope: CanvasSyncEnvelope = {
      source: "canvas-browser-extension",
      version: "1",
      payload: {
        courseId: "9876",
        courseName: "Biology 101",
        courseCode: "BIO101",
        fetchedAt: new Date().toISOString(),
        modules: [
          {
            id: "1",
            name: "Week 1: Cell Structure",
            position: 1,
            items: [
              {
                id: "10",
                title: "Readings",
                type: "WikiPage",
                position: 1,
                pageSlug: "cell-structure"
              }
            ]
          }
        ],
        pages: [],
        assignments: [
          {
            id: "50",
            name: "Lab Report 1",
            pointsPossible: 25,
            dueAt: "2026-10-15T23:59:00Z"
          }
        ],
        discussions: [],
        events: []
      }
    };

    expect(sampleEnvelope.version).toBe("1");
    expect(sampleEnvelope.source).toBe("canvas-browser-extension");
    expect(sampleEnvelope.payload.courseId).toBe("9876");
    expect(sampleEnvelope.payload.modules).toHaveLength(1);
    expect(sampleEnvelope.payload.assignments).toHaveLength(1);
  });
});
