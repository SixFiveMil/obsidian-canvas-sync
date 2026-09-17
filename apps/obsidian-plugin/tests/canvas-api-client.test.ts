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
            syllabus_body: "<p>Course Syllabus Content</p>",
            enrollments: [
              {
                type: "student",
                grades: {
                  current_score: 95.5,
                  current_grade: "A",
                  final_score: 95.5,
                  final_grade: "A"
                }
              }
            ]
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
              description: "<p>Submit homework solutions</p>",
              submission: {
                id: 9001,
                workflow_state: "graded",
                score: 95,
                grade: "95%",
                submitted_at: "2026-05-14T20:00:00Z",
                body: "<p>My submitted assignment solution</p>",
                submission_comments: [
                  {
                    author_name: "Professor Alice",
                    comment: "Great work on problem 2!",
                    created_at: "2026-05-16T10:00:00Z"
                  }
                ]
              }
            }
          ],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335/discussion_topics/701/view")) {
        return {
          status: 200,
          json: {
            participants: [
              { id: 101, display_name: "Alice Smith" },
              { id: 102, display_name: "Bob Jones" }
            ],
            view: [
              {
                id: 8001,
                user_id: 101,
                message: "<p>Hello everyone! Looking forward to this term.</p>",
                created_at: "2026-02-01T10:00:00Z",
                replies: [
                  {
                    id: 8002,
                    user_id: 102,
                    message: "<p>Welcome Alice!</p>",
                    created_at: "2026-02-01T11:00:00Z"
                  }
                ]
              }
            ]
          },
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
              message: "<p>Introduce yourself</p>",
              assignment_id: 502
            }
          ],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/calendar_events")) {
        return {
          status: 200,
          json: [
            {
              id: 3001,
              title: "Office Hours",
              start_at: "2026-05-10T15:00:00Z",
              end_at: "2026-05-10T16:00:00Z",
              description: "Weekly office hours on Zoom"
            }
          ],
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

  it("fetches complete course payload with modules, pages, assignments, submissions, discussion entries, and calendar milestones", async () => {
    const payload = await client.fetchCompleteCoursePayload(28335);
    expect(payload.courseId).toBe("28335");
    expect(payload.courseName).toBe("Applied Cryptography");
    expect(payload.courseCode).toBe("CSOL-510");
    expect(payload.syllabusHtml).toContain("Course Syllabus Content");
    expect(payload.courseHomePageHtml).toContain("Welcome to Applied Cryptography!");
    expect(payload.grades).toBeDefined();
    expect(payload.grades?.currentScore).toBe(95.5);
    expect(payload.grades?.currentGrade).toBe("A");

    expect(payload.modules).toHaveLength(1);
    expect(payload.modules[0].items).toHaveLength(2);
    expect(payload.pages).toHaveLength(1);

    expect(payload.assignments).toHaveLength(1);
    const assignment = payload.assignments[0];
    expect(assignment.submission).toBeDefined();
    expect(assignment.submission?.workflowState).toBe("graded");
    expect(assignment.submission?.score).toBe(95);
    expect(assignment.submission?.comments).toHaveLength(1);
    expect(assignment.submission?.comments?.[0].authorName).toBe("Professor Alice");

    expect(payload.discussions).toHaveLength(1);
    const disc = payload.discussions[0];
    expect(disc.assignmentId).toBe("502");
    expect(disc.entries).toBeDefined();
    expect(disc.entries).toHaveLength(1);
    expect(disc.entries?.[0].userName).toBe("Alice Smith");
    expect(disc.entries?.[0].replies).toHaveLength(1);
    expect(disc.entries?.[0].replies?.[0].userName).toBe("Bob Jones");

    expect(payload.events).toBeDefined();
    // 1 direct event + 1 synthesized assignment milestone
    expect(payload.events.length).toBe(2);
    expect(payload.events.some((e) => e.title === "Office Hours")).toBe(true);
    expect(payload.events.some((e) => e.title.includes("Homework 1"))).toBe(true);

    expect(payload.files).toBeDefined();
    expect(payload.files!.length).toBeGreaterThanOrEqual(1);
  });
});


