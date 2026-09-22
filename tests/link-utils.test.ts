import { describe, expect, it } from "vitest";
import {
  createConfiguredTurndown,
  extractCanvasAssignmentId,
  extractCanvasDiscussionId,
  extractCanvasFileId,
  extractCanvasModuleId,
  extractCanvasPageSlug,
  extractCanvasSpecialRoute,
  extractFileExtension,
  parseAllowedExtensions,
  shouldDownloadAsset,
  type LinkRewriteContext
} from "../src/utils";

describe("link-utils", () => {
  describe("extractFileExtension", () => {
    it("extracts extension from simple filenames", () => {
      expect(extractFileExtension("syllabus.pdf")).toBe("pdf");
      expect(extractFileExtension("Lecture_01.PPTX")).toBe("pptx");
      expect(extractFileExtension("archive.tar.gz")).toBe("gz");
    });

    it("handles query params and hash in URLs", () => {
      expect(extractFileExtension("https://canvas.edu/file.pdf?download=1#section")).toBe("pdf");
    });

    it("returns empty string for files without extension", () => {
      expect(extractFileExtension("Makefile")).toBe("");
      expect(extractFileExtension("")).toBe("");
    });
  });

  describe("parseAllowedExtensions & shouldDownloadAsset", () => {
    it("includes documents and images by default", () => {
      const allowed = parseAllowedExtensions({
        downloadDocuments: true,
        downloadImages: true,
        downloadArchivesAndCode: false,
        downloadMedia: false
      });

      expect(allowed.has("pdf")).toBe(true);
      expect(allowed.has("docx")).toBe(true);
      expect(allowed.has("png")).toBe(true);
      expect(allowed.has("mp4")).toBe(false);
      expect(allowed.has("zip")).toBe(false);
    });

    it("parses custom comma-separated extensions", () => {
      const allowed = parseAllowedExtensions({
        downloadDocuments: false,
        downloadImages: false,
        allowedExtensions: "pdf, .ipynb, zip"
      });

      expect(allowed.has("pdf")).toBe(true);
      expect(allowed.has("ipynb")).toBe(true);
      expect(allowed.has("zip")).toBe(true);
      expect(allowed.has("png")).toBe(false);
    });

    it("evaluates shouldDownloadAsset correctly", () => {
      const config = {
        downloadAssets: true,
        downloadDocuments: true,
        downloadImages: false,
        maxAssetSizeMb: 10
      };

      // Allowed PDF under size
      expect(shouldDownloadAsset("notes.pdf", 5 * 1024 * 1024, config)).toEqual({ allowed: true });

      // Disallowed image
      expect(shouldDownloadAsset("pic.png", 1024, config)).toEqual({
        allowed: false,
        reason: "extension_filtered"
      });

      // PDF exceeding size limit
      expect(shouldDownloadAsset("huge.pdf", 15 * 1024 * 1024, config)).toEqual({
        allowed: false,
        reason: "size_limit"
      });

      // Master disabled
      expect(shouldDownloadAsset("notes.pdf", 1024, { ...config, downloadAssets: false })).toEqual({
        allowed: false,
        reason: "disabled"
      });
    });
  });

  describe("Canvas URL Extractors", () => {
    it("extracts file ID from Canvas file download URLs", () => {
      expect(extractCanvasFileId("https://canvas.instructure.com/courses/123/files/45678/download?wrap=1")).toBe("45678");
      expect(extractCanvasFileId("/courses/123/files/999")).toBe("999");
      expect(extractCanvasFileId("/files/888/download")).toBe("888");
      expect(extractCanvasFileId("https://example.com/other")).toBeNull();
    });

    it("extracts page slugs", () => {
      expect(extractCanvasPageSlug("https://canvas.edu/courses/123/pages/week-1-intro")).toBe("week-1-intro");
      expect(extractCanvasPageSlug("/courses/123/pages/syllabus%20details")).toBe("syllabus details");
      expect(extractCanvasPageSlug("/courses/123/assignments/456")).toBeNull();
    });

    it("extracts assignment IDs", () => {
      expect(extractCanvasAssignmentId("https://canvas.edu/courses/123/assignments/5555")).toBe("5555");
      expect(extractCanvasAssignmentId("/courses/123/assignments/777")).toBe("777");
    });

    it("extracts discussion IDs", () => {
      expect(extractCanvasDiscussionId("https://canvas.edu/courses/123/discussion_topics/8888")).toBe("8888");
      expect(extractCanvasDiscussionId("/courses/123/discussion_topics/999")).toBe("999");
    });
    it("extracts module IDs", () => {
      expect(extractCanvasModuleId("https://canvas.edu/courses/123/modules/120487")).toBe("120487");
      expect(extractCanvasModuleId("/courses/123/modules/120502")).toBe("120502");
      expect(extractCanvasModuleId("https://canvas.edu/courses/123/modules#module_120487")).toBe("120487");
      expect(extractCanvasModuleId("/courses/123/modules/items/998877")).toBe("item_998877");
      expect(extractCanvasModuleId("/courses/123/modules")).toBeNull();
    });

    it("extracts special Canvas course routes", () => {
      expect(extractCanvasSpecialRoute("https://canvas.edu/courses/123/assignments/syllabus")).toBe("syllabus");
      expect(extractCanvasSpecialRoute("/courses/123/syllabus")).toBe("syllabus");
      expect(extractCanvasSpecialRoute("https://canvas.edu/courses/123/assignments")).toBe("assignments");
      expect(extractCanvasSpecialRoute("/courses/123/discussion_topics")).toBe("discussions");
      expect(extractCanvasSpecialRoute("/courses/123/calendar")).toBe("calendar");
      expect(extractCanvasSpecialRoute("https://canvas.edu/courses/123")).toBe("home");
      expect(extractCanvasSpecialRoute("https://canvas.edu/courses/123/modules")).toBe("modules");
    });
  });

  describe("Turndown Canvas Link & Image Rewriting", () => {
    it("rewrites downloaded Canvas file links to WikiLinks", () => {
      const context: LinkRewriteContext = {
        fileMap: new Map([
          ["45678", { relativePath: "Files/Lecture01.pdf", displayName: "Lecture 01 Slides" }]
        ])
      };

      const turndown = createConfiguredTurndown(context);
      const html = `<p>Check the <a href="https://canvas.edu/courses/123/files/45678/download">slides for lecture 1</a> before class.</p>`;
      const markdown = turndown.turndown(html);

      expect(markdown).toBe("Check the [[Files/Lecture01.pdf|slides for lecture 1]] before class.");
    });

    it("leaves undownloaded / external Canvas file links as standard markdown links", () => {
      const context: LinkRewriteContext = {
        fileMap: new Map() // Empty, file not downloaded
      };

      const turndown = createConfiguredTurndown(context);
      const html = `<p>Check the <a href="https://canvas.edu/courses/123/files/99999/download">external file</a>.</p>`;
      const markdown = turndown.turndown(html);

      expect(markdown).toBe("Check the [external file](https://canvas.edu/courses/123/files/99999/download).");
    });

    it("rewrites internal Canvas page links to WikiLinks", () => {
      const context: LinkRewriteContext = {
        pageMap: new Map([
          ["week-1-intro", { relativePath: "Modules/01 - Week 1/01 - Page - Welcome.md", title: "Welcome" }]
        ])
      };

      const turndown = createConfiguredTurndown(context);
      const html = `<p>Read the <a href="/courses/123/pages/week-1-intro">Welcome Guide</a> first.</p>`;
      const markdown = turndown.turndown(html);

      expect(markdown).toBe("Read the [[Modules/01 - Week 1/01 - Page - Welcome.md|Welcome Guide]] first.");
    });

    it("rewrites Canvas module links to WikiLinks", () => {
      const context: LinkRewriteContext = {
        moduleMap: new Map([
          ["120487", { relativePath: "Modules/01 - Welcome! Start Here/00 - Module Overview.md", title: "Welcome! Start Here" }],
          ["120502", { relativePath: "Modules/02 - Module 1/00 - Module Overview.md", title: "Module 1" }]
        ])
      };

      const turndown = createConfiguredTurndown(context);
      const html = `<p><a href="https://canvas.example.edu/courses/17594/modules/120487"><strong>Start Here</strong></a></p><p><a href="https://canvas.example.edu/courses/17594/modules/120502"><strong>Module 1</strong></a></p>`;
      const markdown = turndown.turndown(html);

      expect(markdown).toBe(
        "**[[Modules/01 - Welcome! Start Here/00 - Module Overview.md|Start Here]]**\n\n**[[Modules/02 - Module 1/00 - Module Overview.md|Module 1]]**"
      );
    });

    it("rewrites syllabus and special course routes to WikiLinks", () => {
      const context: LinkRewriteContext = {
        specialRouteMap: new Map([
          ["syllabus", { relativePath: "Syllabus.md", title: "Syllabus" }],
          ["assignments", { relativePath: "Tasks.md", title: "Assignments" }]
        ])
      };

      const turndown = createConfiguredTurndown(context);
      const html = `<p><a href="https://canvas.example.edu/courses/17594/assignments/syllabus"><strong>Syllabus</strong></a></p>`;
      const markdown = turndown.turndown(html);

      expect(markdown).toBe("**[[Syllabus.md|Syllabus]]**");
    });

    it("rewrites downloaded images to WikiLink image embeds", () => {
      const context: LinkRewriteContext = {
        imageMap: new Map([
          ["112233", { relativePath: "Attachments/architecture.png" }]
        ])
      };

      const turndown = createConfiguredTurndown(context);
      const html = `<p><img src="https://canvas.edu/courses/123/files/112233/preview" alt="System Diagram" /></p>`;
      const markdown = turndown.turndown(html);

      expect(markdown).toBe("![[Attachments/architecture.png]]");
    });

    it("correctly unwraps images inside links without generating broken nested wikilinks", () => {
      const context: LinkRewriteContext = {
        moduleMap: new Map([
          ["149661", { relativePath: "Modules/01 - Welcome! Start Here/00 - Module Overview.md", title: "Welcome! Start Here" }]
        ]),
        imageMap: new Map([
          ["3573151", { relativePath: "Attachments/Getting Started.png" }]
        ])
      };

      const turndown = createConfiguredTurndown(context);
      const iconOnlyHtml = `<a href="https://canvas.example.edu/courses/23211/modules/149661"><img src="https://canvas.example.edu/courses/23211/files/3573151/download" alt="" /></a>`;
      expect(turndown.turndown(iconOnlyHtml)).toBe("![[Attachments/Getting Started.png]]");

      const iconAndTextHtml = `<a href="https://canvas.example.edu/courses/23211/modules/149661"><img src="https://canvas.example.edu/courses/23211/files/3573151/download" alt="" /><strong>Start Here</strong></a>`;
      expect(turndown.turndown(iconAndTextHtml)).toBe(
        "![[Attachments/Getting Started.png]] **[[Modules/01 - Welcome! Start Here/00 - Module Overview.md|Start Here]]**"
      );
    });
  });
});

