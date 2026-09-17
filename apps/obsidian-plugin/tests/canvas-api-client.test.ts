import { describe, expect, it, vi } from "vitest";
import { CanvasApiClient } from "../src/canvas-api-client";

// Mock Obsidian's requestUrl module
vi.mock("obsidian", () => {
  return {
    requestUrl: vi.fn(async (params: { url: string; method?: string; headers?: Record<string, string> }) => {
      const url = params.url;

      if (url.includes("/api/v1/users/self")) {
        return {
          status: 200,
          json: {
            id: 35666,
            name: "Joshua Wortz",
            primary_email: "joshuawortz@sandiego.edu"
          },
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses?include[]=term&include[]=concluded")) {
        return {
          status: 200,
          json: [
            { id: 28335, name: "Applied Cryptography", course_code: "CSOL-510" },
            { id: 28340, name: "Capstone", course_code: "CSOL-599" },
            { id: 17589, name: "Foundations of Cyber Security", course_code: "CSOL-500", concluded: true }
          ],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses?enrollment_state=active")) {
        return {
          status: 200,
          json: [
            { id: 28335, name: "Applied Cryptography", course_code: "CSOL-510" },
            { id: 28340, name: "Capstone", course_code: "CSOL-599" }
          ],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335?include[]=syllabus_body")) {
        return {
          status: 200,
          json: {
            id: 28335,
            name: "Applied Cryptography",
            course_code: "CSOL-510",
            syllabus_body: "<p>Course Syllabus Content</p>"
          },
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335/front_page")) {
        return {
          status: 200,
          json: {
            title: "Course Home",
            body: "<p>Welcome to Applied Cryptography!</p>"
          },
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335/modules")) {
        return {
          status: 200,
          json: [
            {
              id: 101,
              name: "Week 1 - Intro",
              position: 1,
              items: [
                {
                  id: 1001,
                  title: "Intro Lecture",
                  type: "WikiPage",
                  page_url: "intro-lecture",
                  position: 1
                },
                {
                  id: 1002,
                  title: "Homework 1",
                  type: "Assignment",
                  content_id: 501,
                  position: 2
                }
              ]
            }
          ],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335/pages/intro-lecture")) {
        return {
          status: 200,
          json: {
            title: "Intro Lecture",
            body: "<p>Lecture 1 content here with <a href=\"/courses/28335/files/999/download\">Slides PDF</a></p>"
          },
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335/pages")) {
        return {
          status: 200,
          json: [
            {
              title: "Intro Lecture",
              url: "intro-lecture",
              updated_at: "2026-01-22T01:00:00Z"
            }
          ],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335/assignments")) {
        return {
          status: 200,
          json: [
            {
              id: 501,
              name: "Homework 1",
              due_at: "2026-05-15T23:59:00Z",
              points_possible: 100,
              description: "<p>Submit homework solutions</p>"
            }
          ],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335/discussion_topics")) {
        return {
          status: 200,
          json: [
            {
              id: 701,
              title: "Week 1 Discussion",
              message: "<p>Introduce yourself</p>"
            }
          ],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/calendar_events")) {
        return {
          status: 200,
          json: [],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335/files")) {
        return {
          status: 200,
          json: [
            {
              id: 999,
              display_name: "lecture1.pdf",
              size: 2048576,
              url: "https://sandiego.instructure.com/courses/28335/files/999/download"
            }
          ],
          text: "",
          headers: {}
        };
      }

      return {
        status: 200,
        json: {},
        text: "",
        headers: {}
      };
    })
  };
});

describe("CanvasApiClient", () => {
  const client = new CanvasApiClient("https://sandiego.instructure.com", "test-token-12345");

  it("authenticates and returns user profile on testConnection", async () => {
    const user = await client.testConnection();
    expect(user.id).toBe(35666);
    expect(user.name).toBe("Joshua Wortz");
    expect(user.primary_email).toBe("joshuawortz@sandiego.edu");
  });

  it("lists all courses including inactive/concluded when includeInactive is true", async () => {
    const courses = await client.listCourses({ includeInactive: true });
    expect(courses).toHaveLength(3);
    expect(courses[2].name).toBe("Foundations of Cyber Security");
    expect(courses[2].concluded).toBe(true);
  });

  it("lists only active enrolled courses when includeInactive is false", async () => {
    const courses = await client.listCourses({ includeInactive: false });
    expect(courses).toHaveLength(2);
    expect(courses[0].name).toBe("Applied Cryptography");
    expect(courses[0].course_code).toBe("CSOL-510");
  });

  it("fetches complete course payload with modules, pages, assignments, and discovered files", async () => {
    const payload = await client.fetchCompleteCoursePayload(28335);
    expect(payload.courseId).toBe("28335");
    expect(payload.courseName).toBe("Applied Cryptography");
    expect(payload.courseCode).toBe("CSOL-510");
    expect(payload.syllabusHtml).toContain("Course Syllabus Content");
    expect(payload.courseHomePageHtml).toContain("Welcome to Applied Cryptography!");
    expect(payload.modules).toHaveLength(1);
    expect(payload.modules[0].items).toHaveLength(2);
    expect(payload.pages).toHaveLength(1);
    expect(payload.assignments).toHaveLength(1);
    expect(payload.discussions).toHaveLength(1);
    expect(payload.files).toBeDefined();
    expect(payload.files!.length).toBeGreaterThanOrEqual(1);
  });
});

