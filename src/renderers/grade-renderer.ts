/**
 * @module renderers/grade-renderer
 * @description Renders the comprehensive course Gradebook (`Grades.md`) note,
 * including overall score callouts, metrics summary, and an itemized assignment grade table.
 */

import type { CanvasCoursePayload } from "../types";
import { formatIsoTimestamp, formatSyncTimestamp } from "../utils";
import { formatModuleLinks, prependFrontmatter } from "./doc-renderer";

/**
 * Renders the master `Grades.md` document for a course.
 *
 * @param payload - CanvasCoursePayload containing grade totals and assignment submissions.
 * @param assignmentMap - Lookup map for assignment file paths.
 * @param moduleByName - Lookup map for module note paths.
 * @param enableYaml - Whether YAML frontmatter is enabled in plugin settings.
 * @returns Complete Grades.md note string.
 */
export function renderGradesPage(
  payload: CanvasCoursePayload,
  assignmentMap?: Map<string, { relativePath: string; title: string }>,
  moduleByName?: Map<string, { relativePath: string; title: string }>,
  enableYaml = true
): string {
  const lines: string[] = [`# Grades - ${payload.courseName}`, ""];

  // 1. Overall Grade Banner
  const g = payload.grades;
  const currentScoreText = g?.currentScore != null ? `${g.currentScore}%` : "N/A";
  const currentGradeText = g?.currentGrade ? ` (${g.currentGrade})` : "";
  const finalScoreText = g?.finalScore != null ? `${g.finalScore}%` : "N/A";
  const finalGradeText = g?.finalGrade ? ` (${g.finalGrade})` : "";

  lines.push(`> [!INFO] **Overall Course Grade**`);
  lines.push(`> - **Current Score**: ${currentScoreText}${currentGradeText}`);
  lines.push(`> - **Final Calculated Score**: ${finalScoreText}${finalGradeText}`);
  lines.push(`> - **Last Synced**: ${formatSyncTimestamp(payload.fetchedAt)}`);
  lines.push("");

  // 2. Metrics & Summary
  const assignments = payload.assignments || [];
  let totalPointsPossible = 0;
  let totalPointsEarned = 0;
  let gradedCount = 0;
  let submittedCount = 0;
  let missingCount = 0;

  for (const a of assignments) {
    if (typeof a.pointsPossible === "number") {
      totalPointsPossible += a.pointsPossible;
    }
    const sub = a.submission;
    if (sub?.workflowState === "graded" && typeof sub.score === "number") {
      totalPointsEarned += sub.score;
      gradedCount++;
    } else if (sub?.workflowState === "submitted") {
      submittedCount++;
    }
    if (sub?.missing) {
      missingCount++;
    }
  }

  lines.push("## Summary Statistics", "");
  lines.push(`- **Graded Coursework**: ${gradedCount} / ${assignments.length}`);
  if (submittedCount > 0) {
    lines.push(`- **Pending Review**: ${submittedCount}`);
  }
  if (missingCount > 0) {
    lines.push(`- **Missing Assignments**: ⚠️ ${missingCount}`);
  }
  if (gradedCount > 0 && totalPointsPossible > 0) {
    lines.push(`- **Total Points Earned (Graded)**: ${totalPointsEarned.toFixed(1)} / ${totalPointsPossible.toFixed(1)} pts`);
  }
  lines.push("- **Quick Links**: [[Tasks.md|Tasks & Assignments]] | [[Announcements.md|Announcements]] | [[Discussions.md|Discussions]] | [[Calendar.md|Calendar]]");
  lines.push("");

  // 3. Assignment Gradebook Table
  lines.push("## Assignment Gradebook", "");
  lines.push("| Assignment | Module | Due Date | Status | Score | Grade | Submitted | Feedback |");
  lines.push("| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |");

  if (assignments.length === 0) {
    lines.push("| _No assignments found_ | - | - | - | - | - | - | - |");
  } else {
    const sorted = [...assignments].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    for (const a of sorted) {
      const assignInfo = assignmentMap?.get(a.id);
      const rawName = a.name.replace(/\|/g, "\\|");
      const nameLink = assignInfo?.relativePath
        ? `[[${assignInfo.relativePath}\\|${rawName}]]`
        : rawName;
      
      const modLinks = formatModuleLinks(a.moduleNames, moduleByName, true);
      const moduleCol = modLinks.length > 0 ? modLinks.join(", ") : "-";

      const dueDate = a.dueAt ? new Date(a.dueAt).toISOString().slice(0, 10) : "-";
      const sub = a.submission;

      let statusStr = "⚪ Unsubmitted";
      if (sub?.workflowState === "graded") {
        statusStr = sub.late ? "🟡 Graded (Late)" : "🟢 Graded";
      } else if (sub?.workflowState === "submitted") {
        statusStr = "🔵 Submitted";
      } else if (sub?.missing) {
        statusStr = "🔴 Missing";
      } else if (sub?.excused) {
        statusStr = "🟣 Excused";
      }

      const maxPoints = a.pointsPossible != null ? `${a.pointsPossible}` : "?";
      const earnedPoints = sub?.score != null ? `${sub.score}` : "-";
      const scoreCol = `${earnedPoints} / ${maxPoints}`;
      const gradeCol = sub?.grade ? sub.grade.replace(/\|/g, "\\|") : "-";
      const submittedDate = sub?.submittedAt ? new Date(sub.submittedAt).toISOString().slice(0, 10) : "-";

      let feedbackSnippet = "-";
      if (sub?.comments && sub.comments.length > 0) {
        const firstComment = sub.comments[0].comment.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
        feedbackSnippet = firstComment.length > 80 ? `${firstComment.slice(0, 77)}...` : firstComment;
      }

      lines.push(`| ${nameLink} | ${moduleCol} | ${dueDate} | ${statusStr} | ${scoreCol} | ${gradeCol} | ${submittedDate} | ${feedbackSnippet} |`);
    }
  }

  lines.push("");
  const body = lines.join("\n");
  const props: Record<string, unknown> = {
    canvas_type: "grades",
    course_id: payload.courseId ? Number(payload.courseId) || payload.courseId : undefined,
    course_name: payload.courseName,
    course_code: payload.courseCode || null,
    current_score: payload.grades?.currentScore ?? null,
    current_grade: payload.grades?.currentGrade ?? null,
    final_score: payload.grades?.finalScore ?? null,
    final_grade: payload.grades?.finalGrade ?? null,
    last_synced: formatIsoTimestamp(payload.fetchedAt),
    tags: ["canvas/course", "canvas/grades", `canvas/course/${payload.courseId}`].filter(Boolean)
  };
  return prependFrontmatter(body, props, enableYaml);
}
