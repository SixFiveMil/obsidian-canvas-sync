import { describe, expect, it } from "vitest";

import { formatCourseFolderName } from "../src/template-utils";

describe("formatCourseFolderName", () => {
  it("renders default template with courseCode and courseName", () => {
    const result = formatCourseFolderName("{{courseCode}} - {{courseName}}", {
      courseId: "12345",
      courseCode: "CSOL-500",
      courseName: "Foundations of Cyber Security"
    });
    expect(result).toBe("CSOL-500 - Foundations of Cyber Security");
  });

  it("supports ${courseCode} syntax as well", () => {
    const result = formatCourseFolderName("${courseCode} - ${courseName}", {
      courseId: "12345",
      courseCode: "CSOL-500",
      courseName: "Foundations of Cyber Security"
    });
    expect(result).toBe("CSOL-500 - Foundations of Cyber Security");
  });

  it("falls back to '${courseName} (${courseId})' if courseCode is empty", () => {
    const result = formatCourseFolderName("{{courseCode}} - {{courseName}}", {
      courseId: "12345",
      courseCode: "",
      courseName: "Foundations of Cyber Security"
    });
    expect(result).toBe("Foundations of Cyber Security (12345)");
  });

  it("falls back if courseCode is whitespace or undefined", () => {
    const result = formatCourseFolderName("{{courseCode}} - {{courseName}}", {
      courseId: "999",
      courseName: "Network Security"
    });
    expect(result).toBe("Network Security (999)");
  });

  it("prevents 'My Dashboard' folder spam when code is present", () => {
    const result = formatCourseFolderName("{{courseCode}} - {{courseName}}", {
      courseId: "12345",
      courseCode: "CSOL-500",
      courseName: "My Dashboard"
    });
    expect(result).toBe("CSOL-500 - CSOL-500");
    expect(result).not.toContain("My Dashboard");
  });

  it("prevents 'Dashboard' folder spam when code is absent", () => {
    const result = formatCourseFolderName("{{courseCode}} - {{courseName}}", {
      courseId: "12345",
      courseCode: "",
      courseName: "Dashboard"
    });
    expect(result).toBe("Course 12345 (12345)");
    expect(result).not.toContain("Dashboard (12345)");
  });

  it("supports subfolder templates and sanitizes path segments", () => {
    const result = formatCourseFolderName("Semester 1/{{courseCode}}? - {{courseName}}", {
      courseId: "101",
      courseCode: "CSOL-510",
      courseName: "Applied Cryptography"
    });
    expect(result).toBe("Semester 1/CSOL-510- - Applied Cryptography");
  });

  it("supports templates without courseCode", () => {
    const result = formatCourseFolderName("Courses/{{courseName}}", {
      courseId: "101",
      courseName: "Applied Cryptography"
    });
    expect(result).toBe("Courses/Applied Cryptography");
  });
});
