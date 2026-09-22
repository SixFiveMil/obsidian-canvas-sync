/**
 * @module renderers/announcement-renderer
 * @description Renders individual Canvas announcement notes and the Announcements hub note
 * with recent announcements callouts, summary tables, Dataview queries, and reply threads.
 */

import type TurndownService from "turndown";
import type { CanvasCoursePayload, CanvasDiscussionPayload } from "../types";
import { formatIsoDate, formatIsoTimestamp, formatSyncTimestamp } from "../utils";
import { countDiscussionReplies, renderDiscussionEntries } from "./discussion-renderer";
import { prependFrontmatter } from "./doc-renderer";

/**
 * Generates an Obsidian callout block displaying the 3 most recent announcements for a course.
 *
 * @param announcements - List of announcement payloads.
 * @param announcementMap - Map from announcement ID to relative file path and title.
 * @returns Formatted callout string or empty string if no announcements exist.
 */
export function renderRecentAnnouncementsCallout(
  announcements: CanvasDiscussionPayload[],
  announcementMap?: Map<string, { relativePath: string; title: string }>
): string {
  if (!Array.isArray(announcements) || announcements.length === 0) {
    return "";
  }

  const sorted = [...announcements].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  const recent = sorted.slice(0, 3);

  const lines: string[] = ["> [!IMPORTANT] **Recent Announcements**"];
  for (const ann of recent) {
    const dateStr = formatIsoDate(ann.postedAt) || "Recent";
    const annInfo = announcementMap?.get(ann.id);
    const cleanTitle = ann.title.replace(/\|/g, "\\|");
    const titleLink = annInfo?.relativePath
      ? `[[${annInfo.relativePath}|${cleanTitle}]]`
      : cleanTitle;
    const author = ann.author || ann.authorName || ann.userName;
    const authorStr = author ? ` by ${author}` : "";
    lines.push(`> - **${dateStr}**: ${titleLink}${authorStr}`);
  }

  return lines.join("\n");
}

/**
 * Renders an individual announcement note containing metadata frontmatter, author info,
 * converted HTML message body, attachment links, and nested discussion replies.
 *
 * @param turndown - Configured Turndown instance.
 * @param announcement - The announcement payload.
 * @param lastSynced - Timestamp of the current sync.
 * @param coursePayload - Parent course payload context.
 * @param fileMap - Lookup map for resolved attachment file paths.
 * @param enableYaml - Whether YAML frontmatter is enabled in plugin settings.
 * @returns Complete announcement Markdown note.
 */
export function renderAnnouncementDoc(
  turndown: TurndownService,
  announcement: CanvasDiscussionPayload,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  fileMap?: Map<string, { relativePath: string; displayName: string }>,
  enableYaml = true
): string {
  const author = announcement.author || announcement.authorName || announcement.userName || "Instructor";
  const postedDate = announcement.postedAt ? new Date(announcement.postedAt).toLocaleString() : null;
  const replyCount = countDiscussionReplies(announcement.entries);

  const props: Record<string, unknown> = {
    canvas_id: announcement.id ? Number(announcement.id) || announcement.id : undefined,
    canvas_type: "announcement",
    title: announcement.title,
    author: announcement.author || announcement.authorName || announcement.userName || null,
    posted_at: formatIsoTimestamp(announcement.postedAt),
    course: coursePayload?.courseName,
    course_id: coursePayload?.courseId ? Number(coursePayload.courseId) || coursePayload.courseId : undefined,
    source: announcement.htmlUrl || null,
    last_synced: formatIsoTimestamp(lastSynced || coursePayload?.fetchedAt),
    tags: ["canvas/announcement", `canvas/course/${coursePayload?.courseId}`].filter(Boolean)
  };

  const lines: string[] = [
    `# ${announcement.title}`,
    ""
  ];

  if (postedDate) {
    lines.push(`> [!INFO] **Posted by**: ${author} on ${postedDate}`);
  } else {
    lines.push(`> [!INFO] **Posted by**: ${author}`);
  }
  lines.push("");

  const bodyMarkdown = announcement.messageHtml ? turndown.turndown(announcement.messageHtml).trim() : "";
  lines.push(bodyMarkdown || "No announcement content.");
  lines.push("");

  if (announcement.attachments && announcement.attachments.length > 0) {
    lines.push("### Attachments", "");
    for (const att of announcement.attachments) {
      const fileInfo = att.id ? fileMap?.get(att.id) : undefined;
      const relativePath = fileInfo?.relativePath || att.savedRelativePath;
      const displayName = fileInfo?.displayName || att.displayName;
      if (relativePath) {
        lines.push(`- [[${relativePath}|${displayName}]]`);
      } else if (att.url) {
        lines.push(`- [${displayName}](${att.url})`);
      } else {
        lines.push(`- ${displayName}`);
      }
    }
    lines.push("");
  }

  if (announcement.entries && announcement.entries.length > 0) {
    const repliesBlock = renderDiscussionEntries(turndown, announcement.entries);
    if (repliesBlock) {
      lines.push(`## Discussion Replies (${replyCount})`, "");
      lines.push(repliesBlock);
      lines.push("");
    }
  }

  const body = lines.join("\n").trim() + "\n";
  return prependFrontmatter(body, props, enableYaml);
}

/**
 * Renders the master `Announcements.md` hub note with recent announcement callouts,
 * an overview table of all announcements with reply counts, and a Dataview query.
 *
 * @param announcementsOrPayload - Array of announcements or full course payload.
 * @param lastSynced - Timestamp of the current sync.
 * @param coursePayload - Parent course payload context.
 * @param announcementMap - Lookup map for announcement file paths.
 * @param enableYaml - Whether YAML frontmatter is enabled in plugin settings.
 * @returns Master announcements hub note string.
 */
export function renderAnnouncementsHub(
  announcementsOrPayload: CanvasDiscussionPayload[] | CanvasCoursePayload,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  announcementMap?: Map<string, { relativePath: string; title: string }>,
  enableYaml = true
): string {
  const payload = "courseId" in announcementsOrPayload ? announcementsOrPayload : coursePayload;
  const announcements = "courseId" in announcementsOrPayload ? (announcementsOrPayload.announcements || []) : announcementsOrPayload;

  const lines: string[] = [
    `# Announcements - ${payload?.courseName || "Course"}`,
    "",
    `> [!INFO] **Last Synced**: ${formatSyncTimestamp(lastSynced || payload?.fetchedAt)}`,
    ""
  ];

  if (announcements.length === 0) {
    lines.push("No announcements were found for this course.", "");
  } else {
    const recentCallout = renderRecentAnnouncementsCallout(announcements, announcementMap);
    if (recentCallout) {
      lines.push(recentCallout, "");
    }

    lines.push("## All Announcements", "");
    lines.push("| Date | Title | Author | Replies | Link |");
    lines.push("| :--- | :--- | :--- | :---: | :--- |");

    const sorted = [...announcements].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
    for (const ann of sorted) {
      const dateStr = formatIsoDate(ann.postedAt) || "-";
      const authorStr = (ann.author || ann.authorName || ann.userName || "Instructor").replace(/\|/g, "\\|");
      const replyCount = countDiscussionReplies(ann.entries);
      const annInfo = announcementMap?.get(ann.id);
      const cleanTitle = ann.title.replace(/\|/g, "\\|");
      const titleLink = annInfo?.relativePath
        ? `[[${annInfo.relativePath}\\|${cleanTitle}]]`
        : cleanTitle;
      const openLink = annInfo?.relativePath
        ? `[[${annInfo.relativePath}\\|Open Note]]`
        : ann.htmlUrl
          ? `[Canvas Link](${ann.htmlUrl})`
          : "-";

      lines.push(`| ${dateStr} | ${titleLink} | ${authorStr} | ${replyCount} | ${openLink} |`);
    }
    lines.push("");

    const courseIdStr = payload?.courseId ? String(payload.courseId) : "";
    lines.push(
      "## Dataview Query",
      "",
      "```dataview",
      'TABLE posted_at as "Posted Date", author as "Author", reply_count as "Replies"',
      'FROM #canvas/announcement',
      ...(courseIdStr ? [`WHERE course_id = ${courseIdStr}`] : []),
      "SORT posted_at DESC",
      "```",
      ""
    );
  }

  const body = lines.join("\n");
  const props: Record<string, unknown> = {
    canvas_type: "announcements",
    course_id: payload?.courseId ? Number(payload.courseId) || payload.courseId : undefined,
    course_name: payload?.courseName,
    course_code: payload?.courseCode || null,
    current_score: payload?.grades?.currentScore ?? null,
    current_grade: payload?.grades?.currentGrade ?? null,
    final_score: payload?.grades?.finalScore ?? null,
    final_grade: payload?.grades?.finalGrade ?? null,
    last_synced: formatIsoTimestamp(lastSynced || payload?.fetchedAt),
    tags: ["canvas/course", "canvas/announcements", `canvas/course/${payload?.courseId}`].filter(Boolean)
  };

  return prependFrontmatter(body, props, enableYaml);
}
