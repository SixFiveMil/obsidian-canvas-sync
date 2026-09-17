import { describe, expect, it } from "vitest";

import {
  cleanCourseName,
  extractCourseCode,
  isCanvasUrl,
  isDashboardTitle,
  normalizeModuleItemType,
  parseCourseInfo,
  parseRubricCriteria
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

