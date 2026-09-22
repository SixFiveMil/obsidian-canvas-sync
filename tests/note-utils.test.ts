import { describe, expect, it } from "vitest";
import {
  appendPersonalNotesSection,
  createCourseManifest,
  extractPersonalNotes,
  mergePreservedContent,
  PERSONAL_NOTES_END_TAG,
  PERSONAL_NOTES_HEADER,
  PERSONAL_NOTES_START_TAG
} from "../src/utils";

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
    it("extracts personal notes from notes starting with YAML frontmatter", () => {
      const content = [
        "---",
        "canvas_id: 123",
        "canvas_type: assignment",
        'title: "Kerckhoffs\' Principle"',
        "due: 2026-09-30T23:59:00Z",
        'tags: ["canvas/assignment"]',
        "---",
        "",
        "# Assignment 1: Kerckhoffs' Principle",
        "",
        "Instructions here...",
        "",
        "---",
        "",
        PERSONAL_NOTES_HEADER,
        "",
        "- My note on cipher security",
        "- Review chapter 4"
      ].join("\n");

      const notes = extractPersonalNotes(content);
      expect(notes).toBe("- My note on cipher security\n- Review chapter 4");
    });

    it("returns null when note with YAML frontmatter has no personal notes", () => {
      const content = [
        "---",
        "canvas_id: 123",
        "canvas_type: assignment",
        'title: "Kerckhoffs\' Principle"',
        "---",
        "",
        "# Assignment 1",
        "",
        "Instructions without personal notes."
      ].join("\n");

      expect(extractPersonalNotes(content)).toBeNull();
    });
  });

  describe("mergePreservedContent", () => {
    it("appends clean personal notes section for fresh note without visible comment tags", () => {
      const rendered = "# Syllabus\n\nCourse info.";
      const merged = mergePreservedContent(rendered, null);

      expect(merged).toContain("# Syllabus\n\nCourse info.");
      expect(merged).toContain(PERSONAL_NOTES_HEADER);
      expect(merged).not.toContain("canvas-sync:user-notes");
    });

    it("preserves student notes across note updates and cleans legacy tags", () => {
      const existing = [
        "# Assignment 1 - Old instructions",
        "",
        "---",
        "",
        PERSONAL_NOTES_HEADER,
        "",
        "<!-- %% canvas-sync:user-notes-start %% -->",
        "- Need to cite section 4 of textbook.",
        "<!-- %% canvas-sync:user-notes-end %% -->"
      ].join("\n");

      const newCanvasContent = "# Assignment 1 - Updated instructions\n\nPoints: 100";
      const merged = mergePreservedContent(newCanvasContent, existing);

      expect(merged).toContain("# Assignment 1 - Updated instructions");
      expect(merged).not.toContain("Old instructions");
      expect(merged).toContain("- Need to cite section 4 of textbook.");
      expect(merged).not.toContain("canvas-sync:user-notes");
    });

    it("preserves YAML frontmatter at top while merging personal notes at bottom", () => {
      const existing = [
        "---",
        "canvas_id: 501",
        "status: unsubmitted",
        "---",
        "",
        "# Assignment 5 - Old body",
        "",
        "---",
        "",
        PERSONAL_NOTES_HEADER,
        "",
        "- Consult professor during office hours on Thursday."
      ].join("\n");

      const updatedWithNewFrontmatter = [
        "---",
        "canvas_id: 501",
        "status: graded",
        "score: 95",
        "---",
        "",
        "# Assignment 5 - New body",
        "",
        "Updated instructions."
      ].join("\n");

      const merged = mergePreservedContent(updatedWithNewFrontmatter, existing);

      expect(merged.startsWith("---\ncanvas_id: 501\nstatus: graded\nscore: 95\n---")).toBe(true);
      expect(merged).toContain("# Assignment 5 - New body");
      expect(merged).not.toContain("Old body");
      expect(merged).toContain(PERSONAL_NOTES_HEADER);
      expect(merged).toContain("- Consult professor during office hours on Thursday.");
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
