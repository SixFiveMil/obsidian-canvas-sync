/**
 * @module renderers/calendar-renderer
 * @description Renders Canvas course calendar events, due dates, and milestone timelines
 * into the master `Calendar.md` note.
 */

import type TurndownService from "turndown";
import type { CanvasCoursePayload, CanvasEventPayload } from "../types";
import { formatIsoTimestamp, formatSyncTimestamp } from "../utils";
import { prependFrontmatter } from "./doc-renderer";

/**
 * Renders the master `Calendar.md` note containing an event timeline table cross-linked
 * to internal assignment and task notes.
 *
 * @param turndown - TurndownService instance for converting event descriptions.
 * @param eventsOrPayload - Array of events or parent course payload.
 * @param assignmentMap - Lookup map for assignment file paths.
 * @param lastSynced - Timestamp of the current sync.
 * @param coursePayload - Parent course payload context.
 * @param enableYaml - Whether YAML frontmatter is enabled in plugin settings.
 * @returns Master Calendar.md note string.
 */
export function renderEvents(
  turndown: TurndownService,
  eventsOrPayload: CanvasEventPayload[] | CanvasCoursePayload,
  assignmentMap?: Map<string, { relativePath: string; title: string }>,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  enableYaml = true
): string {
  const payload = "courseId" in eventsOrPayload ? eventsOrPayload : coursePayload;
  const events = "courseId" in eventsOrPayload ? (eventsOrPayload.events || []) : eventsOrPayload;

  let body = "";
  if (events.length === 0) {
    body = [
      "# Calendar & Milestones",
      "",
      `> [!INFO] **Last Synced**: ${formatSyncTimestamp(lastSynced || payload?.fetchedAt)}`,
      "",
      "No events or milestones were found in this sync.",
      ""
    ].join("\n");
  } else {
    const lines: string[] = [
      "# Calendar & Milestones",
      "",
      `> [!INFO] **Last Synced**: ${formatSyncTimestamp(lastSynced || payload?.fetchedAt)}`,
      "",
      "| Date | Type | Event / Milestone | Details | Link |",
      "| :--- | :--- | :--- | :--- | :--- |"
    ];

    const sorted = [...events].sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
    for (const event of sorted) {
      const dateStr = event.startAt ? new Date(event.startAt).toISOString().slice(0, 10) : "N/A";
      const typeStr = event.eventType === "assignment" ? "📝 Assignment" : "📅 Event";
      const assignInfo = event.assignmentId ? assignmentMap?.get(event.assignmentId) : undefined;

      const cleanEventTitle = event.title.replace(/\|/g, "\\|");
      let titleStr = cleanEventTitle;
      let linkStr = "-";

      if (assignInfo?.relativePath && !assignInfo.relativePath.startsWith("Tasks.md")) {
        titleStr = `[[${assignInfo.relativePath}\\|${cleanEventTitle}]]`;
        linkStr = `[[${assignInfo.relativePath}\\|View Note]]`;
      } else if (assignInfo?.relativePath) {
        titleStr = `[[${assignInfo.relativePath}\\|${cleanEventTitle}]]`;
        linkStr = `[[${assignInfo.relativePath}\\|View Task]]`;
      } else if (event.htmlUrl) {
        linkStr = `[Canvas Link](${event.htmlUrl})`;
      }

      const descStr =
        (event.description
          ? turndown.turndown(event.description).replace(/\|/g, "\\|").replace(/\n+/g, " ")
          : ""
        ).trim() || "-";

      lines.push(`| ${dateStr} | ${typeStr} | ${titleStr} | ${descStr} | ${linkStr} |`);
    }

    lines.push("");
    body = lines.join("\n");
  }

  const props: Record<string, unknown> = {
    canvas_type: "calendar",
    course_id: payload?.courseId ? Number(payload.courseId) || payload.courseId : undefined,
    course_name: payload?.courseName,
    course_code: payload?.courseCode || null,
    current_score: payload?.grades?.currentScore ?? null,
    current_grade: payload?.grades?.currentGrade ?? null,
    final_score: payload?.grades?.finalScore ?? null,
    final_grade: payload?.grades?.finalGrade ?? null,
    last_synced: formatIsoTimestamp(lastSynced || payload?.fetchedAt),
    tags: ["canvas/course", "canvas/calendar", `canvas/course/${payload?.courseId}`].filter(Boolean)
  };
  return prependFrontmatter(body, props, enableYaml);
}
