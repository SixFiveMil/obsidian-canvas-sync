/**
 * @module renderers/assignment-renderer
 * @description Renders individual Canvas assignment notes, rubric breakdowns,
 * student submission feedback callouts, and the master Tasks/Assignments checklist.
 */

import type TurndownService from "turndown";
import type {
  CanvasAssignmentPayload,
  CanvasCoursePayload,
  CanvasModuleItemPayload,
  CanvasRubricCriterionPayload
} from "../types";
import { formatIsoDate, formatIsoTimestamp, formatSyncTimestamp } from "../utils";
import { formatModuleLinks, prependFrontmatter } from "./doc-renderer";

/**
 * Extracts embedded HTML rubric tables from assignment descriptions.
 */
export function extractRubricTables(html: string): string[] {
  const matches = html.match(/<table\b[^>]*class=["'][^"']*\brubric_table\b[^"']*["'][^>]*>[\s\S]*?<\/table>/gi);
  return matches ?? [];
}

/**
 * Strips embedded HTML rubric tables from assignment description HTML.
 */
export function stripRubricTables(html: string): string {
  return html.replace(/<table\b[^>]*class=["'][^"']*\brubric_table\b[^"']*["'][^>]*>[\s\S]*?<\/table>/gi, "");
}

/**
 * Renders an assignment description, cleanly formatting instructions and separate rubric sections.
 */
export function renderAssignmentDescription(turndown: TurndownService, descriptionHtml?: string): string {
  if (!descriptionHtml) {
    return "";
  }

  const rubricTables = extractRubricTables(descriptionHtml);
  const htmlWithoutRubrics = stripRubricTables(descriptionHtml);
  const markdownDescription = turndown.turndown(htmlWithoutRubrics).trim();

  if (rubricTables.length === 0) {
    return markdownDescription;
  }

  const rubricBlocks = rubricTables
    .map((tableHtml, index) => {
      const title = rubricTables.length > 1 ? `### Rubric ${index + 1}` : "### Rubric";
      const converted = turndown.turndown(tableHtml).trim();
      return [title, "", converted || "No rubric content."].join("\n");
    })
    .join("\n\n");

  return [markdownDescription, rubricBlocks].filter((part) => part.trim() !== "").join("\n\n");
}

/**
 * Formats structured Canvas API rubric criteria into a clean Markdown table with evaluator scoring.
 */
export function renderStructuredRubric(
  rubric?: CanvasRubricCriterionPayload[],
  assessment?: Record<string, { points?: number | null; comments?: string | null }>
): string {
  if (!rubric || rubric.length === 0) {
    return "";
  }

  const lines: string[] = ["## Rubric (Structured API)", ""];
  for (const criterion of rubric) {
    const assessed = assessment ? assessment[criterion.id] : undefined;
    const scoreBadge = assessed?.points != null ? ` [Score: ${assessed.points} / ${criterion.points} pts]` : "";
    lines.push(`### ${criterion.description}${scoreBadge}`);
    lines.push("");
    lines.push(`- Criterion Points: ${criterion.points}`);
    if (assessed?.points != null) {
      lines.push(`- **Assessed Score**: ${assessed.points} / ${criterion.points}`);
    }
    if (assessed?.comments) {
      lines.push(`- **Evaluator Feedback**: ${assessed.comments}`);
    }
    if (criterion.longDescription) {
      lines.push(`- Notes: ${criterion.longDescription}`);
    }
    lines.push("");

    if (criterion.ratings.length > 0) {
      lines.push("| Rating | Points | Details |");
      lines.push("| --- | ---: | --- |");
      for (const rating of criterion.ratings) {
        const details = (rating.longDescription ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
        lines.push(`| ${rating.description} | ${rating.points} | ${details} |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

/**
 * Renders the student submission section for an assignment note, including workflow status,
 * scores, submission text, file attachments, and instructor comments.
 */
export function renderAssignmentSubmission(
  turndown: TurndownService,
  submission?: CanvasAssignmentPayload["submission"],
  fileMap?: Map<string, { relativePath: string; displayName: string }>
): string | null {
  if (!submission) return null;

  const lines: string[] = ["## Student Submission & Feedback", ""];
  const state = submission.workflowState || "unsubmitted";
  const scoreStr = submission.score != null ? `${submission.score}` : "Not graded";
  const gradeStr = submission.grade ? ` (Grade: ${submission.grade})` : "";
  const submittedDate = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : "N/A";

  const calloutType = state === "graded" ? "SUCCESS" : state === "submitted" ? "INFO" : "WARNING";
  lines.push(`> [!${calloutType}] **Status: ${state.toUpperCase()}**`);
  lines.push(`> - **Score**: ${scoreStr}${gradeStr}`);
  lines.push(`> - **Submitted**: ${submittedDate}`);
  if (submission.late) lines.push(`> - ⚠️ **Late Submission**`);
  if (submission.missing) lines.push(`> - ⚠️ **Marked Missing**`);
  if (submission.excused) lines.push(`> - ℹ️ **Excused**`);

  lines.push("");

  if (submission.body) {
    lines.push("### Submitted Text Content", "");
    lines.push(turndown.turndown(submission.body).trim());
    lines.push("");
  }

  if (submission.url) {
    lines.push("### Submitted URL", "");
    lines.push(`[${submission.url}](${submission.url})`);
    lines.push("");
  }

  if (submission.attachments && submission.attachments.length > 0) {
    lines.push("### Submitted Attachments", "");
    for (const att of submission.attachments) {
      const fileInfo = att.id ? fileMap?.get(att.id) : undefined;
      const relativePath = fileInfo?.relativePath || att.savedRelativePath;
      const displayName = fileInfo?.displayName || att.displayName;
      if (relativePath) {
        lines.push(`- [[${relativePath}|${displayName}]]`);
      } else {
        lines.push(`- [${displayName}](${att.url})`);
      }
    }
    lines.push("");
  }

  if (submission.comments && submission.comments.length > 0) {
    lines.push("### Instructor & Peer Comments", "");
    for (const c of submission.comments) {
      const cDate = c.createdAt ? new Date(c.createdAt).toLocaleString() : "";
      lines.push(`> [!QUOTE] **${c.authorName}** ${cDate ? `_(${cDate})_` : ""}`);
      lines.push(`>`);
      const commentMarkdown = turndown.turndown(c.comment || "").trim();
      const commentLines = commentMarkdown.split("\n").map((l) => `> ${l}`).join("\n");
      lines.push(commentLines);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

/**
 * Renders an individual assignment note inside a module folder.
 */
export function renderModuleAssignmentDoc(
  turndown: TurndownService,
  item: CanvasModuleItemPayload,
  assignment?: CanvasAssignmentPayload,
  moduleByName?: Map<string, { relativePath: string; title: string }>,
  fileMap?: Map<string, { relativePath: string; displayName: string }>,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  enableYaml = true
): string {
  let status = "unsubmitted";
  const sub = assignment?.submission;
  if (sub?.excused) {
    status = "excused";
  } else if (sub?.missing) {
    status = "missing";
  } else if (sub?.late && sub?.workflowState === "graded") {
    status = "late";
  } else if (sub?.workflowState) {
    status = sub.workflowState;
  }

  const modLinks = formatModuleLinks(assignment?.moduleNames, moduleByName);
  const props: Record<string, unknown> = {
    canvas_id: assignment?.id ? Number(assignment.id) || assignment.id : (item.assignmentId ? Number(item.assignmentId) || item.assignmentId : Number(item.id) || item.id),
    canvas_type: "assignment",
    title: assignment?.name || item.title,
    course: coursePayload?.courseName,
    course_id: coursePayload?.courseId ? Number(coursePayload.courseId) || coursePayload.courseId : undefined,
    due: formatIsoTimestamp(assignment?.dueAt),
    due_date: formatIsoDate(assignment?.dueAt),
    points_possible: assignment?.pointsPossible ?? null,
    points: assignment?.pointsPossible ?? null,
    status,
    score: sub?.score ?? null,
    grade: sub?.grade ?? null,
    submitted_at: formatIsoTimestamp(sub?.submittedAt),
    modules: modLinks.length > 0 ? modLinks : null,
    source: assignment?.htmlUrl || null,
    last_synced: formatIsoTimestamp(lastSynced),
    tags: ["canvas/assignment", `canvas/course/${coursePayload?.courseId}`].filter(Boolean)
  };

  if (!assignment) {
    const body = [
      `# ${item.title}`,
      "",
      `Type: ${item.type}`,
      item.assignmentId ? `Assignment ID: ${item.assignmentId}` : null,
      `Last Synced: ${formatSyncTimestamp(lastSynced)}`,
      "",
      "Assignment details could not be retrieved in this sync."
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim() + "\n";
    return prependFrontmatter(body, props, enableYaml);
  }

  const due = assignment.dueAt ? new Date(assignment.dueAt).toISOString() : "No due date";
  const points = assignment.pointsPossible ?? "?";
  const description = renderAssignmentDescription(turndown, assignment.descriptionHtml);
  const submissionBlock = renderAssignmentSubmission(turndown, assignment.submission, fileMap);
  const structuredRubric = renderStructuredRubric(assignment.rubric, assignment.submission?.rubricAssessment);
  const hasRubricTableInHtml =
    typeof assignment.descriptionHtml === "string" &&
    /class=["'][^"']*\brubric_table\b/.test(assignment.descriptionHtml);

  const body = [
    `# ${assignment.name}`,
    "",
    `Assignment ID: ${assignment.id}`,
    `Due: ${due}`,
    `Points: ${points}`,
    `Last Synced: ${formatSyncTimestamp(lastSynced)}`,
    modLinks.length > 0 ? `Modules: ${modLinks.join(", ")}` : null,
    assignment.htmlUrl ? `Source: ${assignment.htmlUrl}` : null,
    "",
    submissionBlock ? submissionBlock : null,
    submissionBlock ? "" : null,
    "## Instructions & Description",
    "",
    description || "No assignment description available.",
    structuredRubric ? "" : null,
    structuredRubric || null,
    !structuredRubric && !hasRubricTableInHtml
      ? "_Rubric debug: No rubric_table HTML or structured rubric array was present in this assignment payload._"
      : null
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
    .trim() + "\n";

  return prependFrontmatter(body, props, enableYaml);
}

/**
 * Renders the master `Tasks.md` (or `Assignments.md`) checklist note for all course assignments.
 */
export function renderAssignments(
  assignmentsOrPayload: CanvasAssignmentPayload[] | CanvasCoursePayload,
  assignmentMap?: Map<string, { relativePath: string; title: string }>,
  moduleByName?: Map<string, { relativePath: string; title: string }>,
  fileMap?: Map<string, { relativePath: string; displayName: string }>,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  enableYaml = true
): string {
  const payload = "courseId" in assignmentsOrPayload ? assignmentsOrPayload : coursePayload;
  const assignments = "courseId" in assignmentsOrPayload ? (assignmentsOrPayload.assignments || []) : assignmentsOrPayload;

  const lines: string[] = [
    "# Tasks & Assignments",
    "",
    `> [!INFO] **Last Synced**: ${formatSyncTimestamp(lastSynced || payload?.fetchedAt)}`,
    ""
  ];

  if (assignments.length === 0) {
    lines.push("No assignments were found in this sync.", "");
  } else {
    const sorted = [...assignments].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    for (const assignment of sorted) {
      const due = assignment.dueAt ? new Date(assignment.dueAt).toISOString().slice(0, 10) : "No due date";
      const points = assignment.pointsPossible ?? "?";
      const sub = assignment.submission;
      const isDone = sub?.workflowState === "graded" || sub?.workflowState === "submitted";
      const check = isDone ? "x" : " ";
      let scoreInfo = "";
      if (sub?.score != null) {
        scoreInfo = `, score: ${sub.score}/${points}`;
      } else {
        scoreInfo = `, points: ${points}`;
      }
      if (sub?.grade) {
        scoreInfo += ` [Grade: ${sub.grade}]`;
      }

      const assignInfo = assignmentMap?.get(assignment.id);
      const titleDisplay =
        assignInfo?.relativePath && !assignInfo.relativePath.startsWith("Tasks.md")
          ? `[[${assignInfo.relativePath}|${assignment.name}]]`
          : assignment.name;

      lines.push(`- [${check}] ${titleDisplay} (due: ${due}${scoreInfo})`);
      
      const modLinks = formatModuleLinks(assignment.moduleNames, moduleByName);
      if (modLinks.length > 0) {
        lines.push(`  - Modules: ${modLinks.join(", ")}`);
      }
      if (sub?.attachments && sub.attachments.length > 0) {
        for (const att of sub.attachments) {
          const fileInfo = att.id ? fileMap?.get(att.id) : undefined;
          const relativePath = fileInfo?.relativePath || att.savedRelativePath;
          if (relativePath) {
            lines.push(`  - Submitted File: [[${relativePath}|${fileInfo?.displayName || att.displayName}]]`);
          }
        }
      }
      if (assignInfo?.relativePath && !assignInfo.relativePath.startsWith("Tasks.md")) {
        lines.push(`  - Note: [[${assignInfo.relativePath}|Open Assignment Note]]`);
      }
      lines.push("");
    }
  }

  const body = lines.join("\n");
  const props: Record<string, unknown> = {
    canvas_type: "tasks",
    course_id: payload?.courseId ? Number(payload.courseId) || payload.courseId : undefined,
    course_name: payload?.courseName,
    course_code: payload?.courseCode || null,
    current_score: payload?.grades?.currentScore ?? null,
    current_grade: payload?.grades?.currentGrade ?? null,
    final_score: payload?.grades?.finalScore ?? null,
    final_grade: payload?.grades?.finalGrade ?? null,
    last_synced: formatIsoTimestamp(lastSynced || payload?.fetchedAt),
    tags: ["canvas/course", "canvas/tasks", `canvas/course/${payload?.courseId}`].filter(Boolean)
  };
  return prependFrontmatter(body, props, enableYaml);
}
