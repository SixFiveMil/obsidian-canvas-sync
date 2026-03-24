import { describe, expect, it } from "vitest";

import { isCanvasUrl, normalizeModuleItemType, parseRubricCriteria } from "../src/sync-utils";

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
