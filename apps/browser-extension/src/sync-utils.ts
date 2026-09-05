import type {
  CanvasAssignmentPayload,
  CanvasModuleItemPayload,
  CanvasRubricCriterionPayload,
  CanvasRubricRatingPayload
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCanvasUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\/courses\/\d+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function normalizeModuleItemType(typeValue: unknown): CanvasModuleItemPayload["type"] {
  const type = String(typeValue ?? "").toLowerCase();
  if (type === "page" || type === "wikipage") {
    return "WikiPage";
  }
  if (type === "assignment") {
    return "Assignment";
  }
  if (type === "discussion" || type === "discussiontopic") {
    return "DiscussionTopic";
  }
  if (type === "externalurl") {
    return "ExternalUrl";
  }
  if (type === "subheader" || type === "contextmodulesubheader") {
    return "ContextModuleSubHeader";
  }
  if (type === "externaltool" || type === "contextexternaltool") {
    return "ContextExternalTool";
  }
  return "ContextExternalTool";
}

export function parseRubricCriteria(item: unknown): CanvasAssignmentPayload["rubric"] {
  if (!isRecord(item) || !Array.isArray(item.rubric)) {
    return undefined;
  }

  const criteria = item.rubric
    .map((criterion): CanvasRubricCriterionPayload | null => {
      if (!isRecord(criterion)) {
        return null;
      }

      const ratings = Array.isArray(criterion.ratings)
        ? criterion.ratings
            .map((rating): CanvasRubricRatingPayload | null => {
              if (!isRecord(rating) || typeof rating.points !== "number") {
                return null;
              }

              return {
                description: String(rating.description ?? "Unnamed Rating"),
                longDescription:
                  typeof rating.long_description === "string" && rating.long_description.trim() !== ""
                    ? rating.long_description
                    : undefined,
                points: Number(rating.points)
              };
            })
            .filter((rating): rating is NonNullable<typeof rating> => rating !== null)
        : [];

      if (typeof criterion.points !== "number") {
        return null;
      }

      return {
        id: String(criterion.id ?? "unknown"),
        description: String(criterion.description ?? "Unnamed Criterion"),
        longDescription:
          typeof criterion.long_description === "string" && criterion.long_description.trim() !== ""
            ? criterion.long_description
            : undefined,
        points: Number(criterion.points),
        ratings
      };
    })
    .filter((criterion): criterion is NonNullable<typeof criterion> => criterion !== null);

  return criteria.length > 0 ? criteria : undefined;
}
export const COURSE_CODE_REGEX = /\b([A-Z]{2,5}[-\s]?\d{3,4}[A-Z]?)\b/i;

export function extractCourseCode(text: string): string | null {
  if (!text || typeof text !== "string") {
    return null;
  }
  const match = text.match(COURSE_CODE_REGEX);
  return match ? match[1].trim() : null;
}

export function isDashboardTitle(text: string): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }
  const normalized = text.trim().toLowerCase();
  return (
    normalized === "dashboard" ||
    normalized === "my dashboard" ||
    normalized.startsWith("dashboard") ||
    normalized.startsWith("my dashboard") ||
    normalized === "courses" ||
    normalized === "my courses"
  );
}

export function cleanCourseName(rawText: string, courseCode?: string | null): string {
  if (!rawText || typeof rawText !== "string") {
    return "";
  }

  if (isDashboardTitle(rawText)) {
    return "";
  }

  let cleaned = rawText.trim();

  // Strip common Canvas page title suffixes
  cleaned = cleaned
    .replace(/\s*[-:|•]\s*Canvas(?:\s+LMS)?.*$/i, "")
    .replace(/\s*[-:|•]\s*(?:Course\s+)?Home$/i, "")
    .replace(/\s*[-:|•]\s*Modules$/i, "")
    .replace(/\s*[-:|•]\s*Syllabus$/i, "")
    .replace(/\s*[-:|•]\s*Assignments$/i, "")
    .trim();

  // If a course code is identified, remove it from the beginning or end of courseName to prevent duplication
  const code = courseCode || extractCourseCode(cleaned);
  if (code) {
    const escapedCode = code.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`^${escapedCode}\\s*[-:]*\\s*`, "i"), "");
    cleaned = cleaned.replace(new RegExp(`\\s*[([]?\\s*${escapedCode}\\s*[)\\]]?$`, "i"), "");
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return isDashboardTitle(cleaned) ? "" : cleaned;
}

export interface CourseInfoCandidates {
  courseId: string;
  apiName?: string | null;
  apiCourseCode?: string | null;
  breadcrumbText?: string | null;
  lastBreadcrumbText?: string | null;
  courseTitleElText?: string | null;
  documentTitle?: string | null;
}

export function parseCourseInfo(candidates: CourseInfoCandidates): { courseCode: string; courseName: string } {
  let detectedCode = candidates.apiCourseCode?.trim() || "";

  const allCandidateStrings = [
    candidates.apiName,
    candidates.courseTitleElText,
    candidates.breadcrumbText,
    candidates.lastBreadcrumbText,
    candidates.documentTitle
  ].filter((str): str is string => typeof str === "string" && str.trim().length > 0 && !isDashboardTitle(str));

  if (!detectedCode) {
    for (const str of allCandidateStrings) {
      const code = extractCourseCode(str);
      if (code) {
        detectedCode = code;
        break;
      }
    }
  }

  let detectedName = "";
  for (const str of allCandidateStrings) {
    const cleaned = cleanCourseName(str, detectedCode);
    if (cleaned) {
      detectedName = cleaned;
      break;
    }
  }

  if (!detectedName) {
    detectedName = `Course ${candidates.courseId}`;
  }

  return {
    courseCode: detectedCode,
    courseName: detectedName
  };
}
