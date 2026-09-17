import { describe, expect, it } from "vitest";

import {
  cleanCourseName,
  extractCanvasAssignmentId,
  extractCanvasDiscussionId,
  extractCanvasFileId,
  extractCanvasModuleId,
  extractCanvasPageSlug,
  extractCanvasSpecialRoute,
  extractCourseCode,
  extractFileExtension,
  isCanvasUrl,
  isDashboardTitle,
  mimeToExtension,
  normalizeModuleItemType,
  parseAllowedExtensions,
  parseContentDispositionFilename,
  parseCourseInfo,
  parseModulesFromHtml,
  parseRubricCriteria,
  shouldDownloadAsset
} from "../src/sync-utils";

describe("isCanvasUrl", () => {
  it("accepts Canvas course URLs", () => {
    expect(isCanvasUrl("https://example.canvaslms.com/courses/123")).toBe(true);
  });

  it("rejects non-course URLs", () => {
    expect(isCanvasUrl("https://example.canvaslms.com/calendar")).toBe(false);
  });

  it("rejects invalid URL strings", () => {
    expect(isCanvasUrl("not-a-url")).toBe(false);
  });
});

describe("normalizeModuleItemType", () => {
  it("normalizes known aliases", () => {
    expect(normalizeModuleItemType("Page")).toBe("WikiPage");
    expect(normalizeModuleItemType("discussion")).toBe("DiscussionTopic");
    expect(normalizeModuleItemType("subheader")).toBe("ContextModuleSubHeader");
    expect(normalizeModuleItemType("file")).toBe("File");
    expect(normalizeModuleItemType("attachment")).toBe("File");
  });

  it("falls back safely for unknown types", () => {
    expect(normalizeModuleItemType("mystery")).toBe("ContextExternalTool");
  });
});

describe("parseRubricCriteria", () => {
  it("returns undefined when rubric is missing", () => {
    expect(parseRubricCriteria({})).toBeUndefined();
  });

  it("parses valid criteria and ratings", () => {
    const rubric = parseRubricCriteria({
      rubric: [
        {
          id: "crit-1",
          description: "Quality",
          points: 10,
          ratings: [
            { description: "Great", points: 10 },
            { description: "Poor", points: 2, long_description: "Needs work" }
          ]
        }
      ]
    });

    expect(rubric).toHaveLength(1);
    expect(rubric?.[0].id).toBe("crit-1");
    expect(rubric?.[0].ratings).toHaveLength(2);
    expect(rubric?.[0].ratings[1].longDescription).toBe("Needs work");
  });
});

describe("extractCourseCode", () => {
  it("extracts hyphenated codes like CSOL-500", () => {
    expect(extractCourseCode("CSOL-500 Foundations of Cyber Security")).toBe("CSOL-500");
  });

  it("extracts space-separated codes like CSOL 500", () => {
    expect(extractCourseCode("CSOL 500: Foundations of Cyber Security")).toBe("CSOL 500");
  });

  it("extracts unhyphenated codes like MATH101", () => {
    expect(extractCourseCode("Welcome to MATH101 Calculus I")).toBe("MATH101");
  });

  it("extracts alphanumeric codes like CS106A", () => {
    expect(extractCourseCode("CS106A Programming Methodology")).toBe("CS106A");
  });

  it("returns null when no code pattern matches", () => {
    expect(extractCourseCode("General Studies")).toBeNull();
    expect(extractCourseCode("")).toBeNull();
  });
});

describe("isDashboardTitle", () => {
  it("detects dashboard variants", () => {
    expect(isDashboardTitle("My Dashboard")).toBe(true);
    expect(isDashboardTitle("Dashboard")).toBe(true);
    expect(isDashboardTitle("dashboard - Canvas")).toBe(true);
    expect(isDashboardTitle("Courses")).toBe(true);
  });

  it("does not flag real course names", () => {
    expect(isDashboardTitle("CSOL-500 Foundations")).toBe(false);
    expect(isDashboardTitle("Cyber Security")).toBe(false);
  });
});

describe("cleanCourseName", () => {
  it("returns empty string for dashboard titles", () => {
    expect(cleanCourseName("My Dashboard")).toBe("");
    expect(cleanCourseName("Dashboard")).toBe("");
  });

  it("strips Canvas suffixes and course codes", () => {
    expect(cleanCourseName("CSOL-500: Foundations of Cyber Security - Canvas LMS", "CSOL-500")).toBe(
      "Foundations of Cyber Security"
    );
    expect(cleanCourseName("CSOL-500 - Foundations of Cyber Security: Modules", "CSOL-500")).toBe(
      "Foundations of Cyber Security"
    );
    expect(cleanCourseName("Foundations of Cyber Security (CSOL-500)")).toBe("Foundations of Cyber Security");
  });
});

describe("parseCourseInfo", () => {
  it("uses official Canvas API data when available", () => {
    const result = parseCourseInfo({
      courseId: "12345",
      apiName: "CSOL-500: Foundations of Cyber Security",
      apiCourseCode: "CSOL-500"
    });
    expect(result.courseCode).toBe("CSOL-500");
    expect(result.courseName).toBe("Foundations of Cyber Security");
  });

  it("filters out 'My Dashboard' and uses real course title from breadcrumbs", () => {
    const result = parseCourseInfo({
      courseId: "12345",
      breadcrumbText: "CSOL-500 Foundations of Cyber Security",
      courseTitleElText: "My Dashboard"
    });
    expect(result.courseCode).toBe("CSOL-500");
    expect(result.courseName).toBe("Foundations of Cyber Security");
  });

  it("extracts from document title when DOM breadcrumbs are absent", () => {
    const result = parseCourseInfo({
      courseId: "999",
      documentTitle: "CSOL-510: Information Assurance - Canvas LMS"
    });
    expect(result.courseCode).toBe("CSOL-510");
    expect(result.courseName).toBe("Information Assurance");
  });

  it("falls back to Course ID when no valid title or code exists", () => {
    const result = parseCourseInfo({
      courseId: "888",
      breadcrumbText: "My Dashboard",
      documentTitle: "Dashboard"
    });
    expect(result.courseCode).toBe("");
    expect(result.courseName).toBe("Course 888");
  });
});

describe("asset utilities", () => {
  it("extracts file extensions correctly", () => {
    expect(extractFileExtension("Homework1.pdf")).toBe("pdf");
    expect(extractFileExtension("diagram.PNG")).toBe("png");
    expect(extractFileExtension("archive.tar.gz")).toBe("gz");
    expect(extractFileExtension("README")).toBe("");
  });

  it("parses allowed extensions and checks permissions", () => {
    const allowed = parseAllowedExtensions({
      downloadDocuments: true,
      downloadImages: false,
      allowedExtensions: "zip, ipynb"
    });

    expect(allowed.has("pdf")).toBe(true);
    expect(allowed.has("zip")).toBe(true);
    expect(allowed.has("ipynb")).toBe(true);
    expect(allowed.has("png")).toBe(false);

    const check = shouldDownloadAsset("project.zip", 1024, {
      downloadAssets: true,
      downloadDocuments: true,
      downloadImages: false,
      allowedExtensions: "zip"
    });
    expect(check.allowed).toBe(true);

    const checkDisallowed = shouldDownloadAsset("pic.jpg", 1024, {
      downloadAssets: true,
      downloadDocuments: true,
      downloadImages: false,
      allowedExtensions: "zip"
    });
    expect(checkDisallowed.allowed).toBe(false);
    expect(checkDisallowed.reason).toBe("extension_filtered");
  });

  it("extracts Canvas IDs and special routes from URLs", () => {
    expect(extractCanvasFileId("https://canvas.edu/courses/100/files/200/download")).toBe("200");
    expect(extractCanvasPageSlug("https://canvas.edu/courses/100/pages/syllabus-overview")).toBe("syllabus-overview");
    expect(extractCanvasModuleId("https://canvas.edu/courses/100/modules/12345")).toBe("12345");
    expect(extractCanvasAssignmentId("https://canvas.edu/courses/100/assignments/555")).toBe("555");
    expect(extractCanvasDiscussionId("https://canvas.edu/courses/100/discussion_topics/777")).toBe("777");
    expect(extractCanvasSpecialRoute("https://canvas.edu/courses/100/assignments/syllabus")).toBe("syllabus");
    expect(extractCanvasSpecialRoute("https://canvas.edu/courses/100/calendar")).toBe("calendar");
  });

  it("maps MIME types to file extensions", () => {
    expect(mimeToExtension("image/png")).toBe("png");
    expect(mimeToExtension("image/jpeg; charset=utf-8")).toBe("jpg");
    expect(mimeToExtension("application/pdf")).toBe("pdf");
    expect(mimeToExtension("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
    expect(mimeToExtension("unknown/format")).toBe("");
  });

  it("parses filenames from Content-Disposition headers", () => {
    expect(parseContentDispositionFilename('attachment; filename="lecture01.pptx"')).toBe("lecture01.pptx");
    expect(parseContentDispositionFilename("attachment; filename*=UTF-8''my%20notes.pdf")).toBe("my notes.pdf");
    expect(parseContentDispositionFilename("inline; filename=document.pdf")).toBe("document.pdf");
    expect(parseContentDispositionFilename("inline")).toBeNull();
  });
});

describe("parseModulesFromHtml", () => {
  it("extracts modules and items from Canvas HTML DOM structure", () => {
    const mockHtml = `
      <div class="context_module" data-module-id="101">
        <div class="header">
          <span class="name">Week 1: Introduction</span>
        </div>
        <div class="content">
          <ul class="context_module_items">
            <li class="context_module_item WikiPage" data-item-id="1">
              <div class="ig-row">
                <a class="ig-title" href="/courses/123/pages/getting-started" title="Getting Started">Getting Started</a>
              </div>
            </li>
            <li class="context_module_item Attachment" data-item-id="2">
              <div class="ig-row">
                <a class="ig-title" href="/courses/123/files/555/download" title="Syllabus.pdf">Syllabus.pdf</a>
              </div>
            </li>
            <li class="context_module_item Assignment" data-item-id="3">
              <div class="ig-row">
                <a class="ig-title" href="/courses/123/assignments/777" title="Lab 1">Lab 1</a>
              </div>
            </li>
          </ul>
        </div>
      </div>
    `;

    const result = parseModulesFromHtml(mockHtml, "123");
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].name).toBe("Week 1: Introduction");
    expect(result.modules[0].items).toHaveLength(3);

    expect(result.modules[0].items[0].type).toBe("WikiPage");
    expect(result.modules[0].items[0].pageSlug).toBe("getting-started");
    expect(result.pagesBySlug.get("getting-started")).toEqual(["Week 1: Introduction"]);

    expect(result.modules[0].items[1].type).toBe("File");
    expect(result.modules[0].items[1].fileId).toBe("555");
    expect(result.filesById.get("555")).toEqual(["Week 1: Introduction"]);
    expect(result.discoveredFiles).toHaveLength(1);
    expect(result.discoveredFiles[0].id).toBe("555");

    expect(result.modules[0].items[2].type).toBe("Assignment");
    expect(result.modules[0].items[2].assignmentId).toBe("777");
    expect(result.assignmentsById.get("777")).toEqual(["Week 1: Introduction"]);
  });
});

