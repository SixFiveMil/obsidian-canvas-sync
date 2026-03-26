import type { CanvasAssignmentPayload, CanvasModuleItemPayload } from "./types";

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
    .map((criterion): CanvasAssignmentPayload["rubric"][number] | null => {
      if (!isRecord(criterion)) {
        return null;
      }

      const ratings = Array.isArray(criterion.ratings)
        ? criterion.ratings
            .map((rating): CanvasAssignmentPayload["rubric"][number]["ratings"][number] | null => {
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
