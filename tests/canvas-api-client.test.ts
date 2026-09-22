import { describe, expect, it, vi } from "vitest";
import { CanvasApiClient } from "../src/api";

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
            name: "Student User",
            primary_email: "student@example.edu"
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

      if (url.includes("/api/v1/announcements")) {
        return {
          status: 200,
          json: [
            {
              id: 901,
              title: "Welcome to Class & Course Logistics",
              message: "<p>Welcome to the term! Please read the syllabus.</p>",
              posted_at: "2026-09-01T08:00:00Z",
              user_name: "Professor Alice",
              html_url: "https://canvas.example.edu/courses/28335/announcements/901",
              attachments: [
                {
                  id: 998,
                  display_name: "syllabus-addendum.pdf",
                  url: "https://canvas.example.edu/courses/28335/files/998/download",
                  size: 102400
                }
              ]
            }
          ],
          text: "",
          headers: {}
        };
      }

      if (url.includes("/api/v1/courses/28335/discussion_topics/901/view")) {
        return {
          status: 200,
          json: {
            participants: [{ id: 101, display_name: "Alice Smith" }],
            view: [
              {
                id: 8501,
                user_id: 101,
                message: "<p>Thank you Professor!</p>",
                created_at: "2026-09-01T09:00:00Z"
              }
            ]
          },
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
              url: "https://canvas.example.edu/courses/28335/files/999/download"
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
  const client = new CanvasApiClient("https://canvas.example.edu", "test-token-12345");

  it("authenticates and returns user profile on testConnection", async () => {
    const user = await client.testConnection();
    expect(user.id).toBe(35666);
    expect(user.name).toBe("Student User");
    expect(user.primary_email).toBe("student@example.edu");
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

  it("fetches announcements directly with fallback support and replies", async () => {
    const announcements = await client.getAnnouncements(28335, { syncReplies: true });
    expect(announcements).toHaveLength(1);
    const ann = announcements[0];
    expect(ann.id).toBe("901");
    expect(ann.title).toBe("Welcome to Class & Course Logistics");
    expect(ann.author).toBe("Professor Alice");
    expect(ann.postedAt).toBe("2026-09-01T08:00:00Z");
    expect(ann.attachments).toHaveLength(1);
    expect(ann.attachments?.[0].displayName).toBe("syllabus-addendum.pdf");
    expect(ann.entries).toHaveLength(1);
    expect(ann.entries?.[0].userName).toBe("Alice Smith");
  });

  it("fetches complete course payload with modules, pages, assignments, submissions, discussion entries, announcements, and calendar milestones", async () => {
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

    expect(payload.announcements).toBeDefined();
    expect(payload.announcements).toHaveLength(1);
    expect(payload.announcements![0].title).toBe("Welcome to Class & Course Logistics");
    expect(payload.announcements![0].entries).toHaveLength(1);

    expect(payload.events).toBeDefined();
    // 1 direct event + 1 synthesized assignment milestone
    expect(payload.events.length).toBe(2);
    expect(payload.events.some((e) => e.title === "Office Hours")).toBe(true);
    expect(payload.events.some((e) => e.title.includes("Homework 1"))).toBe(true);

    expect(payload.files).toBeDefined();
    expect(payload.files!.length).toBeGreaterThanOrEqual(1);
  });

  it("probes course capabilities across all 13 data categories", async () => {
    const report = await client.probeCourseCapabilities(28335);
    expect(report.courseId).toBe("28335");
    expect(report.courseName).toBe("Applied Cryptography");
    expect(report.testedAt).toBeDefined();

    const expectedKeys = [
      "course_info",
      "modules",
      "pages",
      "assignments",
      "submissions",
      "announcements",
      "discussions",
      "quizzes",
      "assignment_groups",
      "files",
      "calendar_events",
      "staff_contacts",
      "todo_items"
    ];

    for (const key of expectedKeys) {
      expect(report.capabilities[key]).toBeDefined();
      expect(report.capabilities[key].key).toBe(key);
      expect(report.capabilities[key].label).toBeDefined();
      expect(report.capabilities[key].endpoint).toBeDefined();
      expect(report.capabilities[key].status).toBeDefined();
    }

    // Check specific available statuses from mocked 200 endpoints
    expect(report.capabilities.course_info.status).toBe("available");
    expect(report.capabilities.modules.status).toBe("available");
    expect(report.capabilities.assignments.status).toBe("available");
    expect(report.capabilities.files.status).toBe("available");
  });

  it("gracefully maps HTTP 403, 404, empty, and 500 responses without throwing", async () => {
    const restrictedClient = new CanvasApiClient("https://canvas.example.edu", "test-token-12345");

    // Temporarily mock requestUrl for a test course with mixed error responses
    const { requestUrl } = await import("obsidian");
    const mockRequestUrl = vi.mocked(requestUrl);

    (mockRequestUrl as any).mockImplementation(async (params: any) => {
      const url = params.url;
      if (url.includes("/api/v1/courses/99999?include[]=syllabus_body")) {
        return { status: 200, json: { id: 99999, name: "Restricted Course" }, text: "", headers: {} };
      }
      if (url.includes("/modules")) {
        return { status: 403, json: { message: "User not authorized" }, text: "Forbidden", headers: {} };
      }
      if (url.includes("/quizzes")) {
        return { status: 404, json: { message: "Quizzes not found" }, text: "Not Found", headers: {} };
      }
      if (url.includes("/announcements")) {
        return { status: 200, json: [], text: "[]", headers: {} };
      }
      if (url.includes("/staff_contacts") || url.includes("enrollment_type[]=teacher")) {
        throw new Error("Canvas API returned status 500: Internal Server Error");
      }
      return { status: 200, json: [{ id: 1 }], text: "", headers: {} };
    });

    const report = await restrictedClient.probeCourseCapabilities(99999);
    expect(report.courseId).toBe("99999");
    expect(report.courseName).toBe("Restricted Course");

    expect(report.capabilities.modules.status).toBe("restricted");
    expect(report.capabilities.modules.statusCode).toBe(403);

    expect(report.capabilities.quizzes.status).toBe("unsupported");
    expect(report.capabilities.quizzes.statusCode).toBe(404);

    expect(report.capabilities.announcements.status).toBe("empty");
    expect(report.capabilities.announcements.count).toBe(0);

    expect(report.capabilities.staff_contacts.status).toBe("error");
  });
});


