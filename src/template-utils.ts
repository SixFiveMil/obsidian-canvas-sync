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

  // If courseCode and courseName are identical, simplify to avoid "CSOL-510 - CSOL-510"
  let effectiveCourseName = courseName;
  if (courseCode && courseName.toLowerCase() === courseCode.toLowerCase()) {
    effectiveCourseName = courseName;
  }

  // Replace placeholders
  let resolved = effectiveTemplate;
  if (
    courseCode &&
    courseName &&
    courseName.toLowerCase() === courseCode.toLowerCase() &&
    (resolved === "{{courseCode}} - {{courseName}}" || resolved === "${courseCode} - ${courseName}")
  ) {
    resolved = courseName;
  } else {
    resolved = resolved
      .replace(/\{\{courseCode\}\}|\$\{courseCode\}/g, courseCode)
      .replace(/\{\{courseName\}\}|\$\{courseName\}/g, effectiveCourseName)
      .replace(/\{\{courseId\}\}|\$\{courseId\}/g, courseId);
  }

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

export function formatSyncTimestamp(isoTimestamp?: string): string {
  if (!isoTimestamp) {
    return new Date().toLocaleString();
  }
  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime()) ? isoTimestamp : date.toLocaleString();
}

