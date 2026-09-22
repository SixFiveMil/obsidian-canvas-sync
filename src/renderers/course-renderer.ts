/**
 * @module renderers/course-renderer
 * @description Renders the main course index (`Course.md`) overview note,
 * linking to modules, home page, syllabus, grades, tasks, announcements, discussions, and files.
 */

import type { AssetSyncDiagnostics, CanvasCoursePayload, CanvasSyncSettings } from "../types";
import { formatIsoTimestamp, formatSyncTimestamp } from "../utils";
import { renderRecentAnnouncementsCallout } from "./announcement-renderer";
import { prependFrontmatter } from "./doc-renderer";

/**
 * Renders the primary `Course.md` index note for a Canvas course.
 *
 * @param payload - CanvasCoursePayload containing full course metadata.
 * @param settings - Current plugin settings for subfolder naming & limits.
 * @param announcementMap - Optional lookup map for announcement file paths.
 * @returns Master Course.md document string.
 */
export function renderCourseIndex(
  payload: CanvasCoursePayload,
  settings: CanvasSyncSettings,
  announcementMap?: Map<string, { relativePath: string; title: string }>
): string {
  const announcements = Array.isArray(payload.announcements) ? payload.announcements : [];
  const recentCallout = renderRecentAnnouncementsCallout(announcements, announcementMap);

  const lines = [
    `# ${payload.courseName}`,
    "",
    `Course ID: ${payload.courseId}`,
    `Last Synced: ${formatSyncTimestamp(payload.fetchedAt)}`,
    ""
  ];

  if (recentCallout) {
    lines.push(recentCallout, "");
  }

  lines.push(
    "## Notes",
    "",
    "- Module-ordered content is in ./Modules",
    "- Course home page is in ./Home.md (if available)",
    "- Syllabus is in ./Syllabus.md (if available)",
    "- Overall grade report & gradebook is in ./Grades.md",
    "- Assignment checklist is in ./Tasks.md",
    "- Announcements summary is in ./Announcements.md",
    "- Discussion summary is in ./Discussions.md",
    "- Events are in ./Calendar.md",
    `- Downloaded static documents are in ./${settings.documentsSubfolder || "Files"}`,
    "",
    "- **Quick Links**: [[Home.md|Course Home]] | [[Tasks.md|Tasks & Assignments]] | [[Announcements.md|Announcements]] | [[Discussions.md|Discussions]] | [[Grades.md|Grades]] | [[Calendar.md|Calendar]]"
  );

  if (payload.grades && (payload.grades.currentScore != null || payload.grades.currentGrade != null || payload.grades.finalScore != null || payload.grades.finalGrade != null)) {
    lines.push("", "## Course Grades", "");
    const g = payload.grades;
    const currentScoreText = g.currentScore != null ? `${g.currentScore}%` : "No score recorded";
    const currentGradeText = g.currentGrade ? ` (Grade: ${g.currentGrade})` : "";
    lines.push(`> [!INFO] **Current Course Grade**: ${currentScoreText}${currentGradeText}`);

    if (g.finalScore != null || g.finalGrade != null) {
      const finalScoreText = g.finalScore != null ? `${g.finalScore}%` : "No score recorded";
      const finalGradeText = g.finalGrade ? ` (Grade: ${g.finalGrade})` : "";
      lines.push(`> - **Final Calculated Grade**: ${finalScoreText}${finalGradeText}`);
    }
  }

  if (payload.assetDiagnostics || (payload.files && payload.files.length > 0)) {
    lines.push("", "## Asset Sync Diagnostics", "");
    const diag: AssetSyncDiagnostics = payload.assetDiagnostics || {
      apiRestricted: false,
      totalDiscovered: payload.files?.length || 0,
      totalDownloaded: payload.files?.filter((f) => f.downloaded).length || 0,
      totalSkippedSize: 0,
      totalFilteredExtension: 0,
      skippedFiles: []
    };

    lines.push(`- **Status**: ${diag.apiRestricted ? "⚠️ API Restricted by Institution" : "✅ Available"}`);
    lines.push(`- **Total Files Discovered**: ${diag.totalDiscovered}`);
    lines.push(`- **Total Files Downloaded**: ${diag.totalDownloaded}`);

    if (diag.totalFilteredExtension > 0) {
      lines.push(`- **Files Filtered by Extension**: ${diag.totalFilteredExtension}`);
    }
    if (diag.totalSkippedSize > 0) {
      lines.push(`- **Files Skipped (> ${settings.maxAssetSizeMb || 50} MB)**: ${diag.totalSkippedSize}`);
    }

    if (diag.skippedFiles && diag.skippedFiles.length > 0) {
      lines.push("", "### Skipped Files", "");
      lines.push("| File Name | Reason | Size |");
      lines.push("| :--- | :--- | :--- |");
      for (const file of diag.skippedFiles) {
        const sizeStr = typeof file.size === "number" ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : "N/A";
        const reasonStr =
          file.reason === "size_limit"
            ? "Exceeds size limit"
            : file.reason === "extension_filtered"
              ? "Extension filtered"
              : file.reason === "auth_restricted"
                ? "Restricted by Canvas"
                : "Error downloading";
        lines.push(`| ${file.name} | ${reasonStr} | ${sizeStr} |`);
      }
    }
  }

  const body = lines.join("\n");
  const props: Record<string, unknown> = {
    canvas_type: "course",
    course_id: payload.courseId ? Number(payload.courseId) || payload.courseId : undefined,
    course_name: payload.courseName,
    course_code: payload.courseCode || null,
    current_score: payload.grades?.currentScore ?? null,
    current_grade: payload.grades?.currentGrade ?? null,
    final_score: payload.grades?.finalScore ?? null,
    final_grade: payload.grades?.finalGrade ?? null,
    last_synced: formatIsoTimestamp(payload.fetchedAt),
    tags: ["canvas/course", "canvas/hub", `canvas/course/${payload.courseId}`].filter(Boolean)
  };
  return prependFrontmatter(body, props, settings.enableYamlFrontmatter);
}
