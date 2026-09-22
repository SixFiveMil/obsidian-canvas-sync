import { describe, expect, it } from "vitest";
import { App } from "obsidian";
import CanvasSyncBridgePlugin, { DEFAULT_SETTINGS } from "../src/main";
import type { CanvasCoursePayload, CanvasDiscussionPayload } from "../src/types";

describe("Canvas Announcements Ingestion & Rendering", () => {
  const sampleAnnouncements: CanvasDiscussionPayload[] = [
    {
      id: "901",
      title: "Welcome to CSOL-510 & Course Expectations",
      author: "Professor Lynn Hoffman",
      postedAt: "2026-09-01T14:30:00.000Z",
      messageHtml: "<p>Welcome to <strong>Applied Cryptography</strong>! Please review the syllabus and join our weekly Zoom.</p>",
      htmlUrl: "https://canvas.example.edu/courses/510/announcements/901",
      attachments: [
        {
          id: "1001",
          displayName: "CSOL510-Syllabus-Addendum.pdf",
          url: "https://canvas.example.edu/files/1001/download",
          savedRelativePath: "Files/CSOL510-Syllabus-Addendum.pdf"
        }
      ],
      entries: [
        {
          id: "801",
          userName: "Alice Smith",
          messageHtml: "<p>Thank you Professor! Excited for this class.</p>",
          createdAt: "2026-09-01T15:00:00.000Z",
          replies: [
            {
              id: "802",
              userName: "Bob Jones",
              messageHtml: "<p>Same here, looking forward to it!</p>",
              createdAt: "2026-09-01T15:30:00.000Z"
            }
          ]
        }
      ]
    },
    {
      id: "902",
      title: "Midterm Exam Review Guide Posted",
      author: "Professor Lynn Hoffman",
      postedAt: "2026-09-15T09:00:00.000Z",
      messageHtml: "<p>The study guide for the midterm exam is now available in the Modules section.</p>",
      htmlUrl: "https://canvas.example.edu/courses/510/announcements/902",
      entries: []
    },
    {
      id: "903",
      title: "Guest Speaker Announcement: Zero Knowledge Proofs",
      author: "Teaching Assistant Alex",
      postedAt: "2026-09-20T11:15:00.000Z",
      messageHtml: "<p>We will have a guest lecture this Thursday on ZK-SNARKs and modern cryptographic verification.</p>",
      htmlUrl: "https://canvas.example.edu/courses/510/announcements/903",
      entries: []
    },
    {
      id: "904",
      title: "Older Fallback Announcement",
      postedAt: "2026-08-25T10:00:00.000Z",
      messageHtml: "<p>Early preparation reminder.</p>"
    }
  ];

  const samplePayload: CanvasCoursePayload = {
    courseId: "510",
    courseName: "CSOL-510 Applied Cryptography",
    courseCode: "CSOL-510-02",
    fetchedAt: "2026-09-22T05:00:00.000Z",
    grades: {
      currentScore: 96.5,
      currentGrade: "A",
      finalScore: 94.0,
      finalGrade: "A"
    },
    modules: [],
    pages: [],
    assignments: [],
    discussions: [],
    announcements: sampleAnnouncements,
    events: []
  };

  it("renders announcement document with full frontmatter, author badge, attachments, and reply tree", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);

    const fileMap = new Map<string, { relativePath: string; displayName: string }>([
      ["1001", { relativePath: "Files/CSOL510-Syllabus-Addendum.pdf", displayName: "CSOL510-Syllabus-Addendum.pdf" }]
    ]);

    const doc = (plugin as any).renderAnnouncementDoc(
      sampleAnnouncements[0],
      samplePayload.fetchedAt,
      samplePayload,
      fileMap
    );

    // Frontmatter validation
    expect(doc.startsWith("---\n")).toBe(true);
    expect(doc).toContain("canvas_id: 901");
    expect(doc).toContain("canvas_type: announcement");
    expect(doc).toContain('title: "Welcome to CSOL-510 & Course Expectations"');
    expect(doc).toContain("author: Professor Lynn Hoffman");
    expect(doc).toContain("posted_at: 2026-09-01T14:30:00.000Z");
    expect(doc).toContain("course_id: 510");
    expect(doc).toContain('source: "https://canvas.example.edu/courses/510/announcements/901"');
    expect(doc).toContain('tags: ["canvas/announcement", "canvas/course/510"]');

    // Title & Author callout
    expect(doc).toContain("# Welcome to CSOL-510 & Course Expectations");
    expect(doc).toContain("> [!INFO] **Posted by**: Professor Lynn Hoffman");

    // Markdown conversion
    expect(doc).toContain("**Applied Cryptography**");

    // Attachments section
    expect(doc).toContain("### Attachments");
    expect(doc).toContain("[[Files/CSOL510-Syllabus-Addendum.pdf|CSOL510-Syllabus-Addendum.pdf]]");

    // Threaded reply tree
    expect(doc).toContain("## Discussion Replies (2)");
    expect(doc).toContain("Alice Smith");
    expect(doc).toContain("Bob Jones");
  });

  it("renders announcements hub note with callout, summary table, and dataview query", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);

    const announcementMap = new Map<string, { relativePath: string; title: string }>([
      ["901", { relativePath: "Announcements/2026-09-01 - Welcome to CSOL-510.md", title: sampleAnnouncements[0].title }],
      ["902", { relativePath: "Announcements/2026-09-15 - Midterm Exam Review.md", title: sampleAnnouncements[1].title }],
      ["903", { relativePath: "Announcements/2026-09-20 - Guest Speaker.md", title: sampleAnnouncements[2].title }],
      ["904", { relativePath: "Announcements/2026-08-25 - Older Fallback.md", title: sampleAnnouncements[3].title }]
    ]);

    const hubDoc = (plugin as any).renderAnnouncementsHub(
      sampleAnnouncements,
      samplePayload.fetchedAt,
      samplePayload,
      announcementMap
    );

    // Frontmatter validation
    expect(hubDoc.startsWith("---\n")).toBe(true);
    expect(hubDoc).toContain("canvas_type: announcements");
    expect(hubDoc).toContain("course_id: 510");
    expect(hubDoc).toContain('tags: ["canvas/course", "canvas/announcements", "canvas/course/510"]');

    // Callout
    expect(hubDoc).toContain("> [!IMPORTANT] **Recent Announcements**");
    // Latest 3 should be in recent callout (903, 902, 901)
    expect(hubDoc).toContain("Guest Speaker Announcement: Zero Knowledge Proofs");
    expect(hubDoc).toContain("Midterm Exam Review Guide Posted");
    expect(hubDoc).toContain("Welcome to CSOL-510 & Course Expectations");

    // Table
    expect(hubDoc).toContain("## All Announcements");
    expect(hubDoc).toContain("| Date | Title | Author | Replies | Link |");
    expect(hubDoc).toContain("2026-09-20");
    expect(hubDoc).toContain("Teaching Assistant Alex");
    expect(hubDoc).toContain("Professor Lynn Hoffman");

    // Dataview
    expect(hubDoc).toContain("## Dataview Query");
    expect(hubDoc).toContain("```dataview");
    expect(hubDoc).toContain("FROM #canvas/announcement");
    expect(hubDoc).toContain("WHERE course_id = 510");
  });

  it("renders empty announcements hub gracefully when no announcements exist", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);

    const hubDoc = (plugin as any).renderAnnouncementsHub(
      [],
      samplePayload.fetchedAt,
      samplePayload
    );

    expect(hubDoc).toContain("# Announcements - CSOL-510 Applied Cryptography");
    expect(hubDoc).toContain("No announcements were found for this course.");
    expect(hubDoc).not.toContain("## All Announcements");
  });

  it("injects recent announcements callout into Course.md and includes Announcements in Quick Links", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);

    const announcementMap = new Map<string, { relativePath: string; title: string }>([
      ["901", { relativePath: "Announcements/2026-09-01 - Welcome.md", title: sampleAnnouncements[0].title }],
      ["902", { relativePath: "Announcements/2026-09-15 - Midterm.md", title: sampleAnnouncements[1].title }],
      ["903", { relativePath: "Announcements/2026-09-20 - Speaker.md", title: sampleAnnouncements[2].title }]
    ]);

    const courseDoc = (plugin as any).renderCourseIndex(samplePayload, announcementMap);

    expect(courseDoc).toContain("> [!IMPORTANT] **Recent Announcements**");
    expect(courseDoc).toContain("Guest Speaker Announcement: Zero Knowledge Proofs");
    expect(courseDoc).toContain("- Announcements summary is in ./Announcements.md");
    expect(courseDoc).toContain("[[Announcements.md|Announcements]]");
  });

  it("defensively handles legacy payloads without announcements property", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);

    const legacyPayload: CanvasCoursePayload = {
      courseId: "101",
      courseName: "Legacy Course",
      fetchedAt: "2026-09-22T05:00:00.000Z",
      modules: [],
      pages: [],
      assignments: [],
      discussions: [],
      events: []
    };

    // Neither renderCourseIndex nor renderAnnouncementsHub should throw on undefined announcements
    expect(() => {
      const courseDoc = (plugin as any).renderCourseIndex(legacyPayload);
      expect(courseDoc).toContain("# Legacy Course");
    }).not.toThrow();

    expect(() => {
      const hubDoc = (plugin as any).renderAnnouncementsHub(
        legacyPayload.announcements || [],
        legacyPayload.fetchedAt,
        legacyPayload
      );
      expect(hubDoc).toContain("No announcements were found for this course.");
    }).not.toThrow();
  });

  it("verifies DEFAULT_SETTINGS has syncAnnouncements set to true", () => {
    expect(DEFAULT_SETTINGS.syncAnnouncements).toBe(true);
  });
});
