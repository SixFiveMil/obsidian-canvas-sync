import { describe, expect, it } from "vitest";
import {
  appendPersonalNotesSection,
  createCourseManifest,
  extractPersonalNotes,
  mergePreservedContent,
  PERSONAL_NOTES_END_TAG,
  PERSONAL_NOTES_HEADER,
  PERSONAL_NOTES_START_TAG
} from "../src/note-utils";

describe("note-utils", () => {
  describe("extractPersonalNotes", () => {
    it("returns null for empty or non-string inputs", () => {
      expect(extractPersonalNotes("")).toBeNull();
      expect(extractPersonalNotes(null as unknown as string)).toBeNull();
    });

    it("extracts notes between comment markers", () => {
      const content = [
        "# Chapter 1: Kinetics",
        "",
        "Course notes from Canvas.",
        "",
        "---",
        "",
        PERSONAL_NOTES_HEADER,
        "",
        PERSONAL_NOTES_START_TAG,
        "- Remember to review reaction rates before Friday.",
        "- Formula: k = Ae^(-Ea/RT)",
        PERSONAL_NOTES_END_TAG,
        ""
      ].join("\n");

      const notes = extractPersonalNotes(content);
      expect(notes).toBe(
        "- Remember to review reaction rates before Friday.\n- Formula: k = Ae^(-Ea/RT)"
      );
    });

    it("extracts notes under header when comment markers are absent", () => {
      const content = [
        "# Week 3 Assignment",
        "",
        "Canvas assignment details...",
        "",
        "## Personal Notes",
        "Student personal annotations here."
      ].join("\n");

      const notes = extractPersonalNotes(content);
      expect(notes).toBe("Student personal annotations here.");
    });

    it("returns null when personal notes section is empty", () => {
      const content = [
        "# Lecture 1",
        "",
        "---",
        "",
        PERSONAL_NOTES_HEADER,
        "",
        PERSONAL_NOTES_START_TAG,
        "",
        PERSONAL_NOTES_END_TAG
      ].join("\n");

      expect(extractPersonalNotes(content)).toBeNull();
    });
  });

  describe("mergePreservedContent", () => {
    it("appends blank notes section for fresh note", () => {
      const rendered = "# Syllabus\n\nCourse info.";
      const merged = mergePreservedContent(rendered, null);

      expect(merged).toContain("# Syllabus\n\nCourse info.");
      expect(merged).toContain(PERSONAL_NOTES_HEADER);
      expect(merged).toContain(PERSONAL_NOTES_START_TAG);
      expect(merged).toContain(PERSONAL_NOTES_END_TAG);
    });

    it("preserves student notes across note updates", () => {
      const existing = [
        "# Assignment 1 - Old instructions",
        "",
        "---",
        "",
        PERSONAL_NOTES_HEADER,
        "",
        PERSONAL_NOTES_START_TAG,
        "- Need to cite section 4 of textbook.",
        PERSONAL_NOTES_END_TAG
      ].join("\n");

      const newCanvasContent = "# Assignment 1 - Updated instructions\n\nPoints: 100";
      const merged = mergePreservedContent(newCanvasContent, existing);

      expect(merged).toContain("# Assignment 1 - Updated instructions");
      expect(merged).not.toContain("Old instructions");
      expect(merged).toContain("- Need to cite section 4 of textbook.");
    });
  });

  describe("createCourseManifest", () => {
    it("creates a manifest recording sync state and sorted files", () => {
      const payload = {
        courseId: "2026",
        courseName: "General Chemistry I",
        courseCode: "CHEM-211",
        fetchedAt: "2026-09-18T10:00:00Z",
        modules: [],
        pages: [],
        assignments: [],
        discussions: [],
        events: []
      };

      const manifest = createCourseManifest(
        payload,
        ["Canvas/CHEM-211/Home.md", "Canvas/CHEM-211/Tasks.md"],
        "api"
      );

      expect(manifest.courseId).toBe("2026");
      expect(manifest.courseName).toBe("General Chemistry I");
      expect(manifest.syncSource).toBe("api");
      expect(manifest.totalFiles).toBe(2);
      expect(manifest.files).toEqual(["Canvas/CHEM-211/Home.md", "Canvas/CHEM-211/Tasks.md"]);
      expect(manifest.lastSyncedAt).toBeDefined();
    });
  });
});
