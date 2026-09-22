/**
 * @module renderers/discussion-renderer
 * @description Renders Canvas discussion topics, threaded discussion reply trees,
 * graded discussion submissions, and the master Discussions index note.
 */

import type TurndownService from "turndown";
import type { CanvasCoursePayload, CanvasDiscussionPayload, CanvasModuleItemPayload } from "../types";
import { formatIsoDate, formatIsoTimestamp, formatSyncTimestamp } from "../utils";
import { renderAssignmentSubmission, renderStructuredRubric } from "./assignment-renderer";
import { formatModuleLinks, prependFrontmatter } from "./doc-renderer";

/**
 * Recursively counts the total number of nested discussion replies in a thread tree.
 *
 * @param entries - Array of discussion reply entries.
 * @returns Total count including all nested child replies.
 */
export function countDiscussionReplies(entries?: CanvasDiscussionPayload["entries"]): number {
  if (!Array.isArray(entries)) return 0;
  let count = entries.length;
  for (const e of entries) {
    if (e.replies) count += countDiscussionReplies(e.replies);
  }
  return count;
}

/**
 * Recursively renders threaded discussion board entries into nested Obsidian callouts.
 *
 * @param turndown - TurndownService instance for HTML conversion.
 * @param entries - Array of discussion entries at the current depth.
 * @param depth - Current nesting level for callout quoting (`> `).
 * @returns Formatted Markdown callout block string.
 */
export function renderDiscussionEntries(
  turndown: TurndownService,
  entries?: CanvasDiscussionPayload["entries"],
  depth = 0
): string {
  if (!Array.isArray(entries) || entries.length === 0) return "";
  const indent = "> ".repeat(depth + 1);
  const blocks: string[] = [];

  for (const entry of entries) {
    const author = entry.userName || "Participant";
    const date = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "";
    const header = `${indent}[!NOTE] **${author}** ${date ? `_(${date})_` : ""}`;

    const messageMarkdown = turndown.turndown(entry.messageHtml || "").trim();
    const indentedMessage = messageMarkdown
      ? messageMarkdown.split("\n").map((l) => `${indent}${l}`).join("\n")
      : `${indent}_(No content)_`;

    let block = `${header}\n${indent}\n${indentedMessage}`;

    if (entry.replies && entry.replies.length > 0) {
      const nestedReplies = renderDiscussionEntries(turndown, entry.replies, depth + 1);
      block += `\n${indent}\n${nestedReplies}`;
    }

    blocks.push(block);
  }

  return blocks.join("\n\n");
}

/**
 * Renders an individual discussion topic note within a module folder.
 * Includes topic prompts, assignment/grading metadata, attached rubrics, student submission status,
 * and complete discussion reply threads.
 */
export function renderModuleDiscussionDoc(
  turndown: TurndownService,
  item: CanvasModuleItemPayload,
  discussion?: CanvasDiscussionPayload,
  moduleByName?: Map<string, { relativePath: string; title: string }>,
  fileMap?: Map<string, { relativePath: string; displayName: string }>,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  enableYaml = true
): string {
  const assignment = discussion?.assignment;
  const replyCount = countDiscussionReplies(discussion?.entries);
  const modLinks = formatModuleLinks(discussion?.moduleNames, moduleByName);

  const props: Record<string, unknown> = {
    canvas_id: discussion?.id ? Number(discussion.id) || discussion.id : (item.discussionId ? Number(item.discussionId) || item.discussionId : Number(item.id) || item.id),
    canvas_type: "discussion",
    title: discussion?.title || item.title,
    course: coursePayload?.courseName,
    course_id: coursePayload?.courseId ? Number(coursePayload.courseId) || coursePayload.courseId : undefined,
    posted_at: formatIsoTimestamp(discussion?.postedAt),
    updated_at: formatIsoTimestamp(discussion?.updatedAt),
    due: formatIsoTimestamp(assignment?.dueAt),
    due_date: formatIsoDate(assignment?.dueAt),
    points_possible: assignment?.pointsPossible ?? null,
    reply_count: replyCount,
    unread_count: discussion?.unreadCount ?? null,
    modules: modLinks.length > 0 ? modLinks : null,
    source: discussion?.htmlUrl || null,
    last_synced: formatIsoTimestamp(lastSynced),
    tags: ["canvas/discussion", `canvas/course/${coursePayload?.courseId}`].filter(Boolean)
  };

  if (!discussion) {
    const body = [
      `# ${item.title}`,
      "",
      `Type: ${item.type}`,
      item.discussionId ? `Discussion ID: ${item.discussionId}` : null,
      `Last Synced: ${formatSyncTimestamp(lastSynced)}`,
      "",
      "Discussion details could not be retrieved in this sync."
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim() + "\n";
    return prependFrontmatter(body, props, enableYaml);
  }

  const submission = discussion.submission ?? assignment?.submission;
  const due = assignment?.dueAt ? new Date(assignment.dueAt).toISOString() : null;
  const points = assignment?.pointsPossible != null ? `${assignment.pointsPossible}` : null;

  const discussionBody = discussion.messageHtml ? turndown.turndown(discussion.messageHtml).trim() : "";
  const repliesBlock =
    discussion.entries && discussion.entries.length > 0
      ? renderDiscussionEntries(turndown, discussion.entries)
      : null;

  const submissionBlock = renderAssignmentSubmission(turndown, submission, fileMap);
  const structuredRubric = assignment?.rubric
    ? renderStructuredRubric(assignment.rubric, submission?.rubricAssessment)
    : null;

  const body = [
    `# ${discussion.title}`,
    "",
    `Discussion ID: ${discussion.id}`,
    discussion.assignmentId ? `Assignment ID: ${discussion.assignmentId}` : null,
    `Last Synced: ${formatSyncTimestamp(lastSynced)}`,
    due ? `Due: ${due}` : null,
    points ? `Points: ${points}` : null,
    discussion.postedAt ? `Posted: ${discussion.postedAt}` : null,
    discussion.updatedAt ? `Updated: ${discussion.updatedAt}` : null,
    modLinks.length > 0 ? `Modules: ${modLinks.join(", ")}` : null,
    discussion.htmlUrl ? `Source: ${discussion.htmlUrl}` : null,
    "",
    submissionBlock ? submissionBlock : null,
    submissionBlock ? "" : null,
    "## Prompt & Instructions",
    "",
    discussionBody || "No discussion prompt available.",
    structuredRubric ? "" : null,
    structuredRubric || null,
    repliesBlock ? "" : null,
    repliesBlock ? `## Discussion Board Replies (${replyCount})` : null,
    repliesBlock ? "" : null,
    repliesBlock || null
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
    .trim() + "\n";

  return prependFrontmatter(body, props, enableYaml);
}

/**
 * Renders the master `Discussions.md` course index note with links to all discussion topics.
 */
export function renderDiscussions(
  discussionsOrPayload: CanvasDiscussionPayload[] | CanvasCoursePayload,
  discussionMap?: Map<string, { relativePath: string; title: string }>,
  moduleByName?: Map<string, { relativePath: string; title: string }>,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  enableYaml = true
): string {
  const payload = "courseId" in discussionsOrPayload ? discussionsOrPayload : coursePayload;
  const discussions = "courseId" in discussionsOrPayload ? (discussionsOrPayload.discussions || []) : discussionsOrPayload;

  const lines: string[] = [
    "# Discussions",
    "",
    `> [!INFO] **Last Synced**: ${formatSyncTimestamp(lastSynced || payload?.fetchedAt)}`,
    ""
  ];

  if (discussions.length === 0) {
    lines.push("No discussions were found in this sync.", "");
  } else {
    const sorted = [...discussions].sort((a, b) => a.title.localeCompare(b.title));
    for (const discussion of sorted) {
      const replyCount = countDiscussionReplies(discussion.entries);
      const replyBadge = replyCount > 0 ? ` (${replyCount} replies)` : "";
      const discInfo = discussionMap?.get(discussion.id);

      const titleDisplay =
        discInfo?.relativePath && !discInfo.relativePath.startsWith("Discussions.md")
          ? `[[${discInfo.relativePath}|${discussion.title}]]`
          : discussion.title;

      lines.push(`- ${titleDisplay}${replyBadge}`);

      const modLinks = formatModuleLinks(discussion.moduleNames, moduleByName);
      if (modLinks.length > 0) {
        lines.push(`  - Modules: ${modLinks.join(", ")}`);
      }
      if (discInfo?.relativePath && !discInfo.relativePath.startsWith("Discussions.md")) {
        lines.push(`  - Note: [[${discInfo.relativePath}|Open Discussion Note]]`);
      }
      lines.push("");
    }
  }

  const body = lines.join("\n");
  const props: Record<string, unknown> = {
    canvas_type: "discussions",
    course_id: payload?.courseId ? Number(payload.courseId) || payload.courseId : undefined,
    course_name: payload?.courseName,
    course_code: payload?.courseCode || null,
    current_score: payload?.grades?.currentScore ?? null,
    current_grade: payload?.grades?.currentGrade ?? null,
    final_score: payload?.grades?.finalScore ?? null,
    final_grade: payload?.grades?.finalGrade ?? null,
    last_synced: formatIsoTimestamp(lastSynced || payload?.fetchedAt),
    tags: ["canvas/course", "canvas/discussions", `canvas/course/${payload?.courseId}`].filter(Boolean)
  };
  return prependFrontmatter(body, props, enableYaml);
}
