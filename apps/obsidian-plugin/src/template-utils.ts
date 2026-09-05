import { sanitizeFileName } from "./security-utils";
import type { CanvasCoursePayload } from "./types";

export type CourseFolderPayload = Pick<CanvasCoursePayload, "courseId" | "courseName" | "courseCode">;

export function formatCourseFolderName(template: string, payload: CourseFolderPayload): string {
  let courseName = payload.courseName?.trim() || "";
  const courseId = payload.courseId?.trim() || "";
  const courseCode = payload.courseCode?.trim() || "";

  // Guard against 'My Dashboard' / 'Dashboard' folder spam
  const lowerName = courseName.toLowerCase();
  if (!courseName || lowerName === "my dashboard" || lowerName === "dashboard") {
    if (courseCode) {
      courseName = courseCode;
    } else {
      courseName = `Course ${courseId}`;
    }
  }

  const fallbackFolder = `${sanitizeFileName(courseName)} (${courseId})`;

  const effectiveTemplate = template?.trim() || "{{courseCode}} - {{courseName}}";

  // Fallback to '${courseName} (${courseId})' if courseCode is empty and template requires courseCode
  const requiresCode =
    effectiveTemplate.includes("{{courseCode}}") ||
    effectiveTemplate.includes("${courseCode}");

  if (requiresCode && !courseCode) {
    return fallbackFolder;
  }

  // Replace placeholders
  const resolved = effectiveTemplate
    .replace(/\{\{courseCode\}\}|\$\{courseCode\}/g, courseCode)
    .replace(/\{\{courseName\}\}|\$\{courseName\}/g, courseName)
    .replace(/\{\{courseId\}\}|\$\{courseId\}/g, courseId);

  // Sanitize path segments while preserving subfolder hierarchy if slashes are present
  const segments = resolved
    .split("/")
    .map((seg) => sanitizeFileName(seg))
    .filter((seg) => seg.length > 0);

  if (segments.length === 0) {
    return fallbackFolder;
  }

  return segments.join("/");
}
