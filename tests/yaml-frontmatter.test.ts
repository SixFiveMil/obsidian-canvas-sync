import { describe, expect, it } from "vitest";
import { App } from "obsidian";
import CanvasSyncBridgePlugin, {
  DEFAULT_SETTINGS,
  formatYamlValue,
  generateYamlFrontmatter
} from "../src/main";
import type {
  CanvasAssignmentPayload,
  CanvasCoursePayload,
  CanvasDiscussionPayload,
  CanvasEventPayload,
  CanvasFileAssetPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasPagePayload
} from "../src/types";

describe("YAML Frontmatter Metadata Engine", () => {
  describe("formatYamlValue", () => {
    it("formats null and undefined as 'null'", () => {
      expect(formatYamlValue(null)).toBe("null");
      expect(formatYamlValue(undefined)).toBe("null");
    });

    it("formats booleans as 'true' or 'false'", () => {
      expect(formatYamlValue(true)).toBe("true");
      expect(formatYamlValue(false)).toBe("false");
    });

    it("formats numbers cleanly including floats and zero", () => {
      expect(formatYamlValue(0)).toBe("0");
      expect(formatYamlValue(10)).toBe("10");
      expect(formatYamlValue(95.5)).toBe("95.5");
      expect(formatYamlValue(-42)).toBe("-42");
    });

    it("preserves unquoted ISO date strings", () => {
      expect(formatYamlValue("2026-09-30")).toBe("2026-09-30");
      expect(formatYamlValue("2026-09-30T23:59:00Z")).toBe("2026-09-30T23:59:00Z");
      expect(formatYamlValue("2026-09-22T04:50:00.000Z")).toBe("2026-09-22T04:50:00.000Z");
    });

    it("quotes strings containing colons, quotes, brackets, pipes, or wikilinks", () => {
      expect(formatYamlValue("Chapter 1: Introduction")).toBe('"Chapter 1: Introduction"');
      expect(formatYamlValue('He said "Hello"')).toBe('"He said \\"Hello\\""');
      expect(formatYamlValue("[[Modules/01 - Welcome/00 - Module Overview.md|01 - Welcome]]")).toBe(
        '"[[Modules/01 - Welcome/00 - Module Overview.md|01 - Welcome]]"'
      );
      expect(formatYamlValue("https://canvas.instructure.com/courses/510")).toBe(
        '"https://canvas.instructure.com/courses/510"'
      );
    });

    it("quotes strings that look like booleans or numbers to preserve string type", () => {
      expect(formatYamlValue("true")).toBe('"true"');
      expect(formatYamlValue("false")).toBe('"false"');
      expect(formatYamlValue("12345")).toBe('"12345"');
      expect(formatYamlValue("null")).toBe('"null"');
    });

    it("formats array values as inline YAML list", () => {
      expect(formatYamlValue(["canvas/assignment", "canvas/course/510"])).toBe(
        '["canvas/assignment", "canvas/course/510"]'
      );
      expect(
        formatYamlValue(["[[Modules/01 - Intro/00 - Overview.md|01 - Intro]]"])
      ).toBe('["[[Modules/01 - Intro/00 - Overview.md|01 - Intro]]"]');
    });
  });

  describe("generateYamlFrontmatter", () => {
    it("generates valid YAML frontmatter bounded by ---", () => {
      const props = {
        canvas_id: 101,
        canvas_type: "assignment",
        title: "Assignment 1: Kerckhoffs' Principle",
        course: "CSOL-510 - Applied Cryptography",
        course_id: 510,
        due: "2026-09-30T23:59:00Z",
        due_date: "2026-09-30",
        points_possible: 100,
        points: 100,
        status: "submitted",
        score: 95.5,
        grade: "A",
        submitted_at: "2026-09-28T14:22:00Z",
        modules: ["[[Modules/01 - Welcome/00 - Module Overview.md|01 - Welcome]]"],
        source: "https://canvas.school.edu/courses/510/assignments/101",
        last_synced: "2026-09-22T04:50:00.000Z",
        tags: ["canvas/assignment", "canvas/course/510"]
      };

      const fm = generateYamlFrontmatter(props);
      expect(fm.startsWith("---\n")).toBe(true);
      expect(fm.endsWith("\n---")).toBe(true);
      expect(fm).toContain("canvas_id: 101");
      expect(fm).toContain("canvas_type: assignment");
      expect(fm).toContain('title: "Assignment 1: Kerckhoffs\' Principle"');
      expect(fm).toContain("course_id: 510");
      expect(fm).toContain("due: 2026-09-30T23:59:00Z");
      expect(fm).toContain("due_date: 2026-09-30");
      expect(fm).toContain("points_possible: 100");
      expect(fm).toContain("points: 100");
      expect(fm).toContain("status: submitted");
      expect(fm).toContain("score: 95.5");
      expect(fm).toContain("grade: A");
      expect(fm).toContain("submitted_at: 2026-09-28T14:22:00Z");
      expect(fm).toContain(
        'modules: ["[[Modules/01 - Welcome/00 - Module Overview.md|01 - Welcome]]"]'
      );
      expect(fm).toContain('source: "https://canvas.school.edu/courses/510/assignments/101"');
      expect(fm).toContain("last_synced: 2026-09-22T04:50:00.000Z");
      expect(fm).toContain('tags: ["canvas/assignment", "canvas/course/510"]');
    });

    it("drops null and undefined values cleanly", () => {
      const props = {
        canvas_id: 202,
        canvas_type: "assignment",
        title: "Assignment 2",
        score: null,
        grade: undefined,
        submitted_at: null
      };

      const fm = generateYamlFrontmatter(props);
      expect(fm).toContain("canvas_id: 202");
      expect(fm).toContain("title: Assignment 2");
      expect(fm).not.toContain("score");
      expect(fm).not.toContain("grade");
      expect(fm).not.toContain("submitted_at");
    });

    it("returns empty string when props is empty or all values null/undefined", () => {
      expect(generateYamlFrontmatter({})).toBe("");
      expect(generateYamlFrontmatter({ a: null, b: undefined })).toBe("");
    });
  });

  describe("Plugin Note Renderers with Frontmatter", () => {
    const samplePayload: CanvasCoursePayload = {
      courseId: "510",
      courseName: "CSOL-510 Applied Cryptography",
      courseCode: "CSOL-510-02",
      fetchedAt: "2026-09-22T04:50:00.000Z",
      grades: {
        currentScore: 94.2,
        currentGrade: "A",
        finalScore: 91.8,
        finalGrade: "A-"
      },
      courseHomePageHtml: "<p>Welcome to Applied Cryptography!</p>",
      syllabusHtml: "<p>Course Syllabus and policies.</p>",
      modules: [
        {
          id: "1001",
          name: "Module 1: Introduction",
          position: 1,
          items: [
            {
              id: "101",
              position: 1,
              title: "Kerckhoffs' Principle",
              type: "WikiPage",
              pageSlug: "kerckhoffs-principle"
            },
            {
              id: "102",
              position: 2,
              title: "Assignment 1.1",
              type: "Assignment",
              assignmentId: "201"
            },
            {
              id: "103",
              position: 3,
              title: "Discussion 1.1",
              type: "DiscussionTopic",
              discussionId: "301"
            },
            {
              id: "104",
              position: 4,
              title: "Lecture Notes PDF",
              type: "File",
              fileId: "401"
            },
            {
              id: "105",
              position: 5,
              title: "Course Website Link",
              type: "ExternalUrl",
              externalUrl: "https://example.com/crypto"
            },
            {
              id: "106",
              position: 6,
              title: "Readings Section",
              type: "ContextModuleSubHeader"
            }
          ]
        }
      ],
      pages: [
        {
          title: "Kerckhoffs' Principle",
          html: "<p>A cryptosystem should be secure even if everything is known except the key.</p>",
          url: "https://canvas.school.edu/courses/510/pages/kerckhoffs-principle",
          slug: "kerckhoffs-principle",
          updatedAt: "2026-09-20T12:00:00Z",
          moduleNames: ["Module 1: Introduction"]
        }
      ],
      assignments: [
        {
          id: "201",
          name: "Assignment 1.1: Kerckhoffs' Principle",
          dueAt: "2026-09-30T23:59:00Z",
          pointsPossible: 100,
          htmlUrl: "https://canvas.school.edu/courses/510/assignments/201",
          descriptionHtml: "<p>Write a paper on Kerckhoffs' principle.</p>",
          moduleNames: ["Module 1: Introduction"],
          submission: {
            id: "sub-1",
            submittedAt: "2026-09-28T10:00:00Z",
            workflowState: "graded",
            score: 98,
            grade: "A+",
            late: false,
            missing: false,
            excused: false
          }
        }
      ],
      discussions: [
        {
          id: "301",
          title: "Discussion 1.1: Security Tradeoffs",
          htmlUrl: "https://canvas.school.edu/courses/510/discussion_topics/301",
          messageHtml: "<p>Discuss security vs usability.</p>",
          postedAt: "2026-09-19T08:00:00Z",
          updatedAt: "2026-09-20T09:00:00Z",
          moduleNames: ["Module 1: Introduction"],
          entries: []
        }
      ],
      events: [
        {
          id: "ev-1",
          title: "Crypto Workshop Live",
          startAt: "2026-09-25T18:00:00Z",
          endAt: "2026-09-25T20:00:00Z",
          eventType: "event",
          description: "Live cryptographic tools workshop on Zoom."
        }
      ],
      files: [
        {
          id: "401",
          displayName: "Lecture1-Slides.pdf",
          url: "https://canvas.school.edu/files/401/download",
          size: 2 * 1024 * 1024,
          downloaded: true,
          savedRelativePath: "Files/Lecture1-Slides.pdf"
        }
      ]
    };

    it("generates frontmatter for Assignment notes with all metadata", () => {
      const app = new App();
      const plugin = new CanvasSyncBridgePlugin(app, {} as any);

      const item: CanvasModuleItemPayload = {
        id: "102",
        position: 2,
        title: "Assignment 1.1",
        type: "Assignment",
        assignmentId: "201"
      };

      const doc = (plugin as any).renderModuleAssignmentDoc(
        item,
        samplePayload.assignments[0],
        undefined,
        undefined,
        samplePayload.fetchedAt,
        samplePayload
      );

      expect(doc.startsWith("---\n")).toBe(true);
      expect(doc).toContain("canvas_id: 201");
      expect(doc).toContain("canvas_type: assignment");
      expect(doc).toContain('title: "Assignment 1.1: Kerckhoffs\' Principle"');
      expect(doc).toContain("course_id: 510");
      expect(doc).toContain("due: 2026-09-30T23:59:00Z");
      expect(doc).toContain("due_date: 2026-09-30");
      expect(doc).toContain("points_possible: 100");
      expect(doc).toContain("status: graded");
      expect(doc).toContain("score: 98");
      expect(doc).toContain('grade: "A+"');
      expect(doc).toContain("submitted_at: 2026-09-28T10:00:00Z");
      expect(doc).toContain('tags: ["canvas/assignment", "canvas/course/510"]');
      expect(doc).toContain("# Assignment 1.1: Kerckhoffs' Principle");
      expect(doc).toContain("## Instructions & Description");
    });

    it("generates frontmatter for Discussion notes with reply count and dates", () => {
      const app = new App();
      const plugin = new CanvasSyncBridgePlugin(app, {} as any);

      const item: CanvasModuleItemPayload = {
        id: "103",
        position: 3,
        title: "Discussion 1.1",
        type: "DiscussionTopic",
        discussionId: "301"
      };

      const doc = (plugin as any).renderModuleDiscussionDoc(
        item,
        samplePayload.discussions[0],
        undefined,
        undefined,
        samplePayload.fetchedAt,
        samplePayload
      );

      expect(doc.startsWith("---\n")).toBe(true);
      expect(doc).toContain("canvas_id: 301");
      expect(doc).toContain("canvas_type: discussion");
      expect(doc).toContain('title: "Discussion 1.1: Security Tradeoffs"');
      expect(doc).toContain("course_id: 510");
      expect(doc).toContain("posted_at: 2026-09-19T08:00:00Z");
      expect(doc).toContain("reply_count: 0");
      expect(doc).toContain('tags: ["canvas/discussion", "canvas/course/510"]');
      expect(doc).toContain("# Discussion 1.1: Security Tradeoffs");
    });

    it("generates frontmatter for Page notes with slug and updated date", () => {
      const app = new App();
      const plugin = new CanvasSyncBridgePlugin(app, {} as any);

      const item: CanvasModuleItemPayload = {
        id: "101",
        position: 1,
        title: "Kerckhoffs' Principle",
        type: "WikiPage",
        pageSlug: "kerckhoffs-principle"
      };

      const doc = (plugin as any).renderModulePageDoc(
        item,
        samplePayload.pages[0],
        undefined,
        samplePayload.fetchedAt,
        samplePayload
      );

      expect(doc.startsWith("---\n")).toBe(true);
      expect(doc).toContain("canvas_id: 101");
      expect(doc).toContain("canvas_type: page");
      expect(doc).toContain('title: "Kerckhoffs\' Principle"');
      expect(doc).toContain("slug: kerckhoffs-principle");
      expect(doc).toContain("canvas_updated: 2026-09-20T12:00:00Z");
      expect(doc).toContain('tags: ["canvas/page", "canvas/course/510"]');
    });

    it("generates frontmatter for File notes with file size in MB", () => {
      const app = new App();
      const plugin = new CanvasSyncBridgePlugin(app, {} as any);

      const item: CanvasModuleItemPayload = {
        id: "104",
        position: 4,
        title: "Lecture Notes PDF",
        type: "File",
        fileId: "401"
      };

      const doc = (plugin as any).renderModuleFileDoc(
        item,
        samplePayload.files![0],
        samplePayload.fetchedAt,
        samplePayload
      );

      expect(doc.startsWith("---\n")).toBe(true);
      expect(doc).toContain("canvas_id: 401");
      expect(doc).toContain("canvas_type: file");
      expect(doc).toContain("file_size_mb: 2");
      expect(doc).toContain('tags: ["canvas/file", "canvas/course/510"]');
    });

    it("generates frontmatter for Link and Section Header notes", () => {
      const app = new App();
      const plugin = new CanvasSyncBridgePlugin(app, {} as any);

      const linkItem: CanvasModuleItemPayload = {
        id: "105",
        position: 5,
        title: "Course Website Link",
        type: "ExternalUrl",
        externalUrl: "https://example.com/crypto"
      };

      const linkDoc = (plugin as any).renderModuleLinkDoc(linkItem, samplePayload.fetchedAt, samplePayload);
      expect(linkDoc.startsWith("---\n")).toBe(true);
      expect(linkDoc).toContain("canvas_type: link");
      expect(linkDoc).toContain('url: "https://example.com/crypto"');
      expect(linkDoc).toContain('tags: ["canvas/link", "canvas/course/510"]');

      const sectionItem: CanvasModuleItemPayload = {
        id: "106",
        position: 6,
        title: "Readings Section",
        type: "ContextModuleSubHeader"
      };

      const sectionDoc = (plugin as any).renderSubHeaderDoc(sectionItem, samplePayload.fetchedAt, samplePayload);
      expect(sectionDoc.startsWith("---\n")).toBe(true);
      expect(sectionDoc).toContain("canvas_type: section_header");
      expect(sectionDoc).toContain('tags: ["canvas/section_header", "canvas/course/510"]');
    });

    it("generates frontmatter for Course Hub notes (Course, Tasks, Grades, Discussions, Calendar, Home, Syllabus)", () => {
      const app = new App();
      const plugin = new CanvasSyncBridgePlugin(app, {} as any);

      const courseDoc = (plugin as any).renderCourseIndex(samplePayload);
      expect(courseDoc.startsWith("---\n")).toBe(true);
      expect(courseDoc).toContain("canvas_type: course");
      expect(courseDoc).toContain("course_id: 510");
      expect(courseDoc).toContain("current_score: 94.2");
      expect(courseDoc).toContain('current_grade: A');
      expect(courseDoc).toContain("final_score: 91.8");
      expect(courseDoc).toContain('final_grade: "A-"');

      const tasksDoc = (plugin as any).renderAssignments(samplePayload);
      expect(tasksDoc.startsWith("---\n")).toBe(true);
      expect(tasksDoc).toContain("canvas_type: tasks");
      expect(tasksDoc).toContain("course_id: 510");

      const gradesDoc = (plugin as any).renderGradesPage(samplePayload);
      expect(gradesDoc.startsWith("---\n")).toBe(true);
      expect(gradesDoc).toContain("canvas_type: grades");
      expect(gradesDoc).toContain("current_score: 94.2");

      const discussionsDoc = (plugin as any).renderDiscussions(samplePayload);
      expect(discussionsDoc.startsWith("---\n")).toBe(true);
      expect(discussionsDoc).toContain("canvas_type: discussions");

      const eventsDoc = (plugin as any).renderEvents(samplePayload);
      expect(eventsDoc.startsWith("---\n")).toBe(true);
      expect(eventsDoc).toContain("canvas_type: calendar");
    });

    it("disables frontmatter when enableYamlFrontmatter setting is false", () => {
      const app = new App();
      const plugin = new CanvasSyncBridgePlugin(app, {} as any);
      (plugin as any).settings = { ...DEFAULT_SETTINGS, enableYamlFrontmatter: false };

      const item: CanvasModuleItemPayload = {
        id: "102",
        position: 2,
        title: "Assignment 1.1",
        type: "Assignment",
        assignmentId: "201"
      };

      const doc = (plugin as any).renderModuleAssignmentDoc(
        item,
        samplePayload.assignments[0],
        undefined,
        undefined,
        samplePayload.fetchedAt,
        samplePayload
      );

      expect(doc.startsWith("---\n")).toBe(false);
      expect(doc.startsWith("# ")).toBe(true);
    });
  });
});
