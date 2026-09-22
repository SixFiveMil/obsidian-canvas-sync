/**
 * @module renderers/module-renderer
 * @description Renders individual module content items including Wiki pages,
 * course file references, external tool links, and section sub-headers.
 */

import type TurndownService from "turndown";
import type {
  CanvasCoursePayload,
  CanvasFileAssetPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasPagePayload
} from "../types";
import { formatIsoTimestamp, formatSyncTimestamp } from "../utils";
import { formatModuleLinks, prependFrontmatter } from "./doc-renderer";

/**
 * Renders a Canvas Wiki Page document within a module folder.
 */
export function renderModulePageDoc(
  turndown: TurndownService,
  item: CanvasModuleItemPayload,
  page?: CanvasPagePayload,
  moduleByName?: Map<string, { relativePath: string; title: string }>,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  enableYaml = true
): string {
  const modLinks = formatModuleLinks(page?.moduleNames, moduleByName);
  const props: Record<string, unknown> = {
    canvas_id: item.id ? Number(item.id) || item.id : null,
    canvas_type: "page",
    title: page?.title || item.title,
    course: coursePayload?.courseName,
    course_id: coursePayload?.courseId ? Number(coursePayload.courseId) || coursePayload.courseId : undefined,
    slug: page?.slug || item.pageSlug || null,
    canvas_updated: formatIsoTimestamp(page?.updatedAt),
    modules: modLinks.length > 0 ? modLinks : null,
    source: page?.url || null,
    last_synced: formatIsoTimestamp(lastSynced),
    tags: ["canvas/page", `canvas/course/${coursePayload?.courseId}`].filter(Boolean)
  };

  if (!page) {
    const body = [
      `# ${item.title}`,
      "",
      `Type: ${item.type}`,
      item.pageSlug ? `Page Slug: ${item.pageSlug}` : null,
      `Last Synced: ${formatSyncTimestamp(lastSynced)}`,
      "",
      "Page content could not be retrieved in this sync."
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim() + "\n";
    return prependFrontmatter(body, props, enableYaml);
  }

  const pageBody = turndown.turndown(page.html).trim();
  const body = [
    `# ${page.title}`,
    "",
    `Source: ${page.url}`,
    `Last Synced: ${formatSyncTimestamp(lastSynced)}`,
    page.updatedAt ? `Canvas Updated: ${page.updatedAt}` : null,
    modLinks.length > 0 ? `Modules: ${modLinks.join(", ")}` : null,
    "",
    pageBody || "No page body available."
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
    .trim() + "\n";
  return prependFrontmatter(body, props, enableYaml);
}

/**
 * Renders a File reference item note within a module folder.
 */
export function renderModuleFileDoc(
  item: CanvasModuleItemPayload,
  file?: CanvasFileAssetPayload,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  enableYaml = true
): string {
  const lines = [`# ${item.title}`, "", `Type: File`, `Last Synced: ${formatSyncTimestamp(lastSynced)}`];

  if (file?.downloaded && file.savedRelativePath) {
    lines.push(`File: [[${file.savedRelativePath}|${file.displayName}]]`);
  }

  if (file?.size) {
    lines.push(`Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
  }

  if (file?.url) {
    lines.push(`Source: ${file.url}`);
  } else if (item.externalUrl) {
    lines.push(`Source: ${item.externalUrl}`);
  }

  const fileSizeMb = file?.size ? +(file.size / (1024 * 1024)).toFixed(2) : null;
  const props: Record<string, unknown> = {
    canvas_id: file?.id ? Number(file.id) || file.id : (item.fileId ? Number(item.fileId) || item.fileId : Number(item.id) || item.id),
    canvas_type: "file",
    title: file?.displayName || item.title,
    course: coursePayload?.courseName,
    course_id: coursePayload?.courseId ? Number(coursePayload.courseId) || coursePayload.courseId : undefined,
    file_size_mb: fileSizeMb,
    source: file?.url || item.externalUrl || null,
    last_synced: formatIsoTimestamp(lastSynced),
    tags: ["canvas/file", `canvas/course/${coursePayload?.courseId}`].filter(Boolean)
  };

  const body = lines.join("\n") + "\n";
  return prependFrontmatter(body, props, enableYaml);
}

/**
 * Renders an external URL or LTI Tool link item note within a module folder.
 */
export function renderModuleLinkDoc(
  item: CanvasModuleItemPayload,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  enableYaml = true
): string {
  const props: Record<string, unknown> = {
    canvas_id: item.id ? Number(item.id) || item.id : null,
    canvas_type: "link",
    title: item.title,
    course: coursePayload?.courseName,
    course_id: coursePayload?.courseId ? Number(coursePayload.courseId) || coursePayload.courseId : undefined,
    url: item.externalUrl || null,
    last_synced: formatIsoTimestamp(lastSynced),
    tags: ["canvas/link", `canvas/course/${coursePayload?.courseId}`].filter(Boolean)
  };
  const body = [
    `# ${item.title}`,
    "",
    `Type: ${item.type}`,
    `Last Synced: ${formatSyncTimestamp(lastSynced)}`,
    item.externalUrl ? `URL: ${item.externalUrl}` : "URL: Not provided by Canvas API"
  ].join("\n") + "\n";
  return prependFrontmatter(body, props, enableYaml);
}

/**
 * Renders a module section header note within a module folder.
 */
export function renderSubHeaderDoc(
  item: CanvasModuleItemPayload,
  lastSynced?: string,
  coursePayload?: CanvasCoursePayload,
  enableYaml = true
): string {
  const props: Record<string, unknown> = {
    canvas_id: item.id ? Number(item.id) || item.id : null,
    canvas_type: "section_header",
    title: item.title,
    course: coursePayload?.courseName,
    course_id: coursePayload?.courseId ? Number(coursePayload.courseId) || coursePayload.courseId : undefined,
    last_synced: formatIsoTimestamp(lastSynced),
    tags: ["canvas/section_header", `canvas/course/${coursePayload?.courseId}`].filter(Boolean)
  };
  const body = [`# ${item.title}`, "", `Type: Section Header`, `Last Synced: ${formatSyncTimestamp(lastSynced)}`, "", "Module section header."].join("\n") + "\n";
  return prependFrontmatter(body, props, enableYaml);
}
