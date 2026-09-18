import type { CanvasCoursePayload } from "./types";

export const PERSONAL_NOTES_HEADER = "## 📝 Personal Notes";
export const PERSONAL_NOTES_START_TAG = "<!-- %% canvas-sync:user-notes-start %% -->";
export const PERSONAL_NOTES_END_TAG = "<!-- %% canvas-sync:user-notes-end %% -->";

export interface CanvasCourseSyncManifest {
  courseId: string;
  courseName: string;
  courseCode?: string;
  lastSyncedAt: string;
  syncSource: "api" | "browser-extension";
  totalFiles: number;
  files: string[];
}

/**
 * Extracts personal student notes and annotations from existing file content.
 */
export function extractPersonalNotes(content: string): string | null {
  if (!content || typeof content !== "string") {
    return null;
  }

  // Check 1: Tagged comment markers
  const startIdx = content.indexOf(PERSONAL_NOTES_START_TAG);
  const endIdx = content.indexOf(PERSONAL_NOTES_END_TAG);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const raw = content.substring(startIdx + PERSONAL_NOTES_START_TAG.length, endIdx).trim();
    return raw.length > 0 ? raw : null;
  }

  // Check 2: Header match for '## 📝 Personal Notes' or '## Personal Notes'
  const headerRegex = /##\s*(?:📝\s*)?Personal Notes[^\n]*\n([\s\S]*)$/i;
  const match = content.match(headerRegex);
  if (match && match[1]) {
    // Strip out tags if any remain
    const raw = match[1]
      .replace(PERSONAL_NOTES_START_TAG, "")
      .replace(PERSONAL_NOTES_END_TAG, "")
      .trim();
    return raw.length > 0 ? raw : null;
  }

  return null;
}

/**
 * Appends or injects the personal notes section into a newly rendered markdown note.
 */
export function appendPersonalNotesSection(newContent: string, existingUserNotes?: string | null): string {
  const base = newContent.trimEnd();
  const notesBody = existingUserNotes && existingUserNotes.trim().length > 0 ? `\n${existingUserNotes.trim()}\n` : "\n";

  return [
    base,
    "",
    "---",
    "",
    PERSONAL_NOTES_HEADER,
    "",
    PERSONAL_NOTES_START_TAG,
    notesBody.trimEnd(),
    PERSONAL_NOTES_END_TAG,
    ""
  ]
    .filter((line, idx, arr) => {
      // Avoid excessive duplicate empty lines
      if (line === "" && arr[idx - 1] === "") return false;
      return true;
    })
    .join("\n");
}

/**
 * Merges newly generated note content with any existing user personal notes.
 */
export function mergePreservedContent(newContent: string, existingFileContent?: string | null): string {
  if (!existingFileContent) {
    return appendPersonalNotesSection(newContent, null);
  }

  const userNotes = extractPersonalNotes(existingFileContent);
  return appendPersonalNotesSection(newContent, userNotes);
}

/**
 * Creates the sync manifest data structure for a synced course.
 */
export function createCourseManifest(
  payload: CanvasCoursePayload,
  syncedFiles: string[],
  syncSource: "api" | "browser-extension"
): CanvasCourseSyncManifest {
  return {
    courseId: payload.courseId,
    courseName: payload.courseName,
    courseCode: payload.courseCode,
    lastSyncedAt: new Date().toISOString(),
    syncSource,
    totalFiles: syncedFiles.length,
    files: [...syncedFiles].sort()
  };
}
