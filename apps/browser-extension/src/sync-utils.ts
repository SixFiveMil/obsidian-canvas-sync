import type {
  AssetSyncFilterConfig,
  CanvasAssignmentPayload,
  CanvasFileAssetPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasRubricCriterionPayload,
  CanvasRubricRatingPayload
} from "./types";

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
  if (type === "file" || type === "attachment") {
    return "File";
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
    .map((criterion): CanvasRubricCriterionPayload | null => {
      if (!isRecord(criterion)) {
        return null;
      }

      const ratings = Array.isArray(criterion.ratings)
        ? criterion.ratings
            .map((rating): CanvasRubricRatingPayload | null => {
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

export const COURSE_CODE_REGEX = /\b([A-Z]{2,5}[-\s]?\d{3,4}[A-Z]?)\b/i;

export function extractCourseCode(text: string): string | null {
  if (!text || typeof text !== "string") {
    return null;
  }
  const match = text.match(COURSE_CODE_REGEX);
  return match ? match[1].trim() : null;
}

export function isDashboardTitle(text: string): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }
  const normalized = text.trim().toLowerCase();
  return (
    normalized === "dashboard" ||
    normalized === "my dashboard" ||
    normalized.startsWith("dashboard") ||
    normalized.startsWith("my dashboard") ||
    normalized === "courses" ||
    normalized === "my courses"
  );
}

export function cleanCourseName(rawText: string, courseCode?: string | null): string {
  if (!rawText || typeof rawText !== "string") {
    return "";
  }

  if (isDashboardTitle(rawText)) {
    return "";
  }

  let cleaned = rawText.trim();

  // Strip common Canvas page title suffixes
  cleaned = cleaned
    .replace(/\s*[-:|•]\s*Canvas(?:\s+LMS)?.*$/i, "")
    .replace(/\s*[-:|•]\s*(?:Course\s+)?Home$/i, "")
    .replace(/\s*[-:|•]\s*Modules$/i, "")
    .replace(/\s*[-:|•]\s*Syllabus$/i, "")
    .replace(/\s*[-:|•]\s*Assignments$/i, "")
    .trim();

  // If a course code is identified, remove it from the beginning or end of courseName to prevent duplication
  const code = courseCode || extractCourseCode(cleaned);
  if (code) {
    const escapedCode = code.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`^${escapedCode}\\s*[-:]*\\s*`, "i"), "");
    cleaned = cleaned.replace(new RegExp(`\\s*[([]?\\s*${escapedCode}\\s*[)\\]]?$`, "i"), "");
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return isDashboardTitle(cleaned) ? "" : cleaned;
}

export interface CourseInfoCandidates {
  courseId: string;
  apiName?: string | null;
  apiCourseCode?: string | null;
  breadcrumbText?: string | null;
  lastBreadcrumbText?: string | null;
  courseTitleElText?: string | null;
  documentTitle?: string | null;
}

export function parseCourseInfo(candidates: CourseInfoCandidates): { courseCode: string; courseName: string } {
  let detectedCode = candidates.apiCourseCode?.trim() || "";

  const allCandidateStrings = [
    candidates.apiName,
    candidates.courseTitleElText,
    candidates.breadcrumbText,
    candidates.lastBreadcrumbText,
    candidates.documentTitle
  ].filter((str): str is string => typeof str === "string" && str.trim().length > 0 && !isDashboardTitle(str));

  if (!detectedCode) {
    for (const str of allCandidateStrings) {
      const code = extractCourseCode(str);
      if (code) {
        detectedCode = code;
        break;
      }
    }
  }

  let detectedName = "";
  for (const str of allCandidateStrings) {
    const cleaned = cleanCourseName(str, detectedCode);
    if (cleaned) {
      detectedName = cleaned;
      break;
    }
  }

  if (!detectedName) {
    detectedName = `Course ${candidates.courseId}`;
  }

  return {
    courseCode: detectedCode,
    courseName: detectedName
  };
}

export const DOCUMENT_EXTENSIONS = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "csv", "rtf", "odt"];
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
export const ARCHIVE_CODE_EXTENSIONS = [
  "zip",
  "tar",
  "gz",
  "7z",
  "rar",
  "py",
  "java",
  "cpp",
  "c",
  "h",
  "cs",
  "js",
  "ts",
  "html",
  "css",
  "json",
  "ipynb",
  "r",
  "sql",
  "sh"
];
export const MEDIA_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "avi", "mp3", "m4a", "wav", "aac", "ogg", "flac"];

export function extractFileExtension(filename: string): string {
  if (!filename || typeof filename !== "string") {
    return "";
  }
  const clean = filename.split(/[?#]/)[0].trim();
  const lastDot = clean.lastIndexOf(".");
  if (lastDot === -1 || lastDot === clean.length - 1) {
    return "";
  }
  return clean.substring(lastDot + 1).toLowerCase();
}

export function parseAllowedExtensions(config: Partial<AssetSyncFilterConfig>): Set<string> {
  const allowed = new Set<string>();

  if (config.downloadDocuments ?? true) {
    DOCUMENT_EXTENSIONS.forEach((ext) => allowed.add(ext));
  }
  if (config.downloadImages ?? true) {
    IMAGE_EXTENSIONS.forEach((ext) => allowed.add(ext));
  }
  if (config.downloadArchivesAndCode) {
    ARCHIVE_CODE_EXTENSIONS.forEach((ext) => allowed.add(ext));
  }
  if (config.downloadMedia) {
    MEDIA_EXTENSIONS.forEach((ext) => allowed.add(ext));
  }

  if (config.allowedExtensions && typeof config.allowedExtensions === "string") {
    config.allowedExtensions
      .split(/[,;\s]+/)
      .map((ext) => ext.replace(/^\./, "").trim().toLowerCase())
      .filter(Boolean)
      .forEach((ext) => allowed.add(ext));
  }

  return allowed;
}

export function shouldDownloadAsset(
  filename: string,
  sizeBytes: number | undefined,
  config: Partial<AssetSyncFilterConfig>
): { allowed: boolean; reason?: "size_limit" | "extension_filtered" | "disabled" } {
  if (config.downloadAssets === false) {
    return { allowed: false, reason: "disabled" };
  }

  const ext = extractFileExtension(filename);
  const allowedExts = parseAllowedExtensions(config);

  if (ext && !allowedExts.has(ext)) {
    return { allowed: false, reason: "extension_filtered" };
  }

  if (typeof sizeBytes === "number" && Number.isFinite(sizeBytes) && sizeBytes > 0) {
    const maxBytes = (config.maxAssetSizeMb || 50) * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      return { allowed: false, reason: "size_limit" };
    }
  }

  return { allowed: true };
}

export function extractCanvasFileId(url: string): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }
  const match = url.match(/(?:\/courses\/\d+)?\/files\/(\d+)/i);
  return match ? match[1] : null;
}

export function extractCanvasPageSlug(url: string): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }
  const match = url.match(/\/courses\/\d+\/pages\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

export function extractCanvasModuleId(url: string): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }
  const directMatch = url.match(/\/courses\/\d+\/modules\/(\d+)/i);
  if (directMatch) {
    return directMatch[1];
  }
  const hashMatch = url.match(/\/courses\/\d+\/modules#module_(\d+)/i);
  if (hashMatch) {
    return hashMatch[1];
  }
  const itemMatch = url.match(/\/courses\/\d+\/modules\/items\/(\d+)/i);
  if (itemMatch) {
    return `item_${itemMatch[1]}`;
  }
  return null;
}

export function extractCanvasAssignmentId(url: string): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }
  if (/\/assignments\/syllabus\b/i.test(url)) {
    return null;
  }
  const match = url.match(/\/courses\/\d+\/assignments\/(\d+)/i);
  return match ? match[1] : null;
}

export function extractCanvasDiscussionId(url: string): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }
  const match = url.match(/\/courses\/\d+\/(?:discussion_topics|discussions)\/(\d+)/i);
  return match ? match[1] : null;
}

export function extractCanvasSpecialRoute(url: string): "syllabus" | "assignments" | "discussions" | "calendar" | "home" | "modules" | null {
  if (!url || typeof url !== "string") {
    return null;
  }
  if (/\/courses\/\d+\/(?:assignments\/syllabus|syllabus)\b/i.test(url)) {
    return "syllabus";
  }
  if (/\/courses\/\d+\/assignments(?:\/|\?|#|$)/i.test(url) && !/\/courses\/\d+\/assignments\/\d+/i.test(url)) {
    return "assignments";
  }
  if (/\/courses\/\d+\/(?:discussion_topics|discussions)(?:\/|\?|#|$)/i.test(url) && !/\/courses\/\d+\/(?:discussion_topics|discussions)\/\d+/i.test(url)) {
    return "discussions";
  }
  if (/(?:\/courses\/\d+)?\/calendar(?:\/|\?|#|$)/i.test(url)) {
    return "calendar";
  }
  if (/\/courses\/\d+\/modules(?:\/|\?|#|$)/i.test(url) && !/\/courses\/\d+\/modules\/\d+/i.test(url)) {
    return "modules";
  }
  if (/\/courses\/\d+\/?(?:home)?(?:\?|#|$)/i.test(url)) {
    return "home";
  }
  return null;
}

export function mimeToExtension(mime: string): string {
  if (!mime || typeof mime !== "string") {
    return "";
  }
  const clean = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "text/plain": "txt",
    "text/csv": "csv",
    "text/markdown": "md",
    "application/json": "json"
  };
  return map[clean] || "";
}

export function parseContentDispositionFilename(header: string): string | null {
  if (!header || typeof header !== "string") {
    return null;
  }
  const matchStar = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (matchStar) {
    try {
      return decodeURIComponent(matchStar[1].trim());
    } catch {
      return matchStar[1].trim();
    }
  }
  const matchQuote = header.match(/filename="([^"]+)"/i);
  if (matchQuote) {
    return matchQuote[1].trim();
  }
  const matchPlain = header.match(/filename=([^;]+)/i);
  if (matchPlain) {
    return matchPlain[1].trim();
  }
  return null;
}

export function addModuleMembership(map: Map<string, string[]>, key: string, moduleName: string): void {
  const existing = map.get(key) ?? [];
  if (!existing.includes(moduleName)) {
    existing.push(moduleName);
    map.set(key, existing);
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ParsedModuleData {
  modules: CanvasModulePayload[];
  pagesBySlug: Map<string, string[]>;
  assignmentsById: Map<string, string[]>;
  discussionsById: Map<string, string[]>;
  filesById: Map<string, string[]>;
  discoveredFiles: CanvasFileAssetPayload[];
}

export function parseModulesFromHtml(html: string, courseId: string): ParsedModuleData {
  const pagesBySlug = new Map<string, string[]>();
  const assignmentsById = new Map<string, string[]>();
  const discussionsById = new Map<string, string[]>();
  const filesById = new Map<string, string[]>();
  const discoveredFiles: CanvasFileAssetPayload[] = [];
  const modules: CanvasModulePayload[] = [];

  if (!html || typeof html !== "string") {
    return { modules, pagesBySlug, assignmentsById, discussionsById, filesById, discoveredFiles };
  }

  // Parse using DOMParser if available (browser/happy-dom)
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const moduleEls = doc.querySelectorAll(".context_module, .item-group-condensed");

      let moduleIndex = 0;
      for (const moduleEl of Array.from(moduleEls)) {
        moduleIndex++;
        const moduleId =
          moduleEl.getAttribute("data-module-id") ||
          moduleEl.id.replace(/^context_module_/, "") ||
          String(moduleIndex);

        const headerEl = moduleEl.querySelector(".name, .header, .ig-header-title, h2, h3, .title");
        const moduleName = headerEl?.textContent?.trim() || `Module ${moduleIndex}`;

        const itemEls = moduleEl.querySelectorAll(".context_module_item, .ig-row");
        const items: CanvasModuleItemPayload[] = [];
        let itemIndex = 0;

        for (const itemEl of Array.from(itemEls)) {
          itemIndex++;
          const itemId =
            itemEl.getAttribute("data-item-id") ||
            itemEl.id.replace(/^context_module_item_/, "") ||
            `${moduleId}-${itemIndex}`;

          const linkEl = itemEl.querySelector("a.ig-title, a.item_link, a");
          const title =
            linkEl?.getAttribute("title")?.trim() ||
            linkEl?.textContent?.trim() ||
            itemEl.querySelector(".item_name, .title")?.textContent?.trim() ||
            `Item ${itemIndex}`;

          const href = linkEl?.getAttribute("href") || "";
          const classList = (
            itemEl.className +
            " " +
            (linkEl?.className || "") +
            " " +
            (itemEl.querySelector("i")?.className || "")
          ).toLowerCase();

          let type: CanvasModuleItemPayload["type"] = "ContextExternalTool";
          let pageSlug: string | undefined;
          let assignmentId: string | undefined;
          let discussionId: string | undefined;
          let fileId: string | undefined;
          let externalUrl: string | undefined;

          // 1. SubHeader
          if (
            classList.includes("contextmodulesubheader") ||
            classList.includes("sub_header") ||
            classList.includes("header_title")
          ) {
            type = "ContextModuleSubHeader";
          }
          // 2. WikiPage
          else if (
            classList.includes("wikipage") ||
            classList.includes("icon-page") ||
            /\/courses\/\d+\/pages\/([^/?#]+)/i.test(href)
          ) {
            type = "WikiPage";
            const match = href.match(/\/courses\/\d+\/pages\/([^/?#]+)/i);
            pageSlug = match ? decodeURIComponent(match[1]) : slugify(title);
            if (pageSlug) {
              addModuleMembership(pagesBySlug, pageSlug, moduleName);
            }
          }
          // 3. Assignment
          else if (
            classList.includes("assignment") ||
            classList.includes("icon-assignment") ||
            /\/courses\/\d+\/assignments\/(\d+)/i.test(href)
          ) {
            type = "Assignment";
            const match = href.match(/\/courses\/\d+\/assignments\/(\d+)/i);
            if (match) {
              assignmentId = match[1];
              addModuleMembership(assignmentsById, assignmentId, moduleName);
            }
          }
          // 4. Discussion
          else if (
            classList.includes("discussion") ||
            classList.includes("icon-discussion") ||
            /\/courses\/\d+\/discussion_topics\/(\d+)/i.test(href)
          ) {
            type = "DiscussionTopic";
            const match = href.match(/\/courses\/\d+\/discussion_topics\/(\d+)/i);
            if (match) {
              discussionId = match[1];
              addModuleMembership(discussionsById, discussionId, moduleName);
            }
          }
          // 5. File / Attachment
          else if (
            classList.includes("attachment") ||
            classList.includes("file") ||
            classList.includes("icon-document") ||
            classList.includes("icon-paperclip") ||
            classList.includes("icon-download") ||
            /\/files\/(\d+)/i.test(href)
          ) {
            type = "File";
            const match = href.match(/(?:\/courses\/\d+)?\/files\/(\d+)/i);
            fileId = match ? match[1] : itemId;
            addModuleMembership(filesById, fileId, moduleName);
            discoveredFiles.push({
              id: fileId,
              displayName: title,
              url: href.startsWith("http") ? href : `/courses/${courseId}/files/${fileId}/download`,
              moduleNames: [moduleName]
            });
          }
          // 6. External URL / Tool
          else if (
            classList.includes("externalurl") ||
            classList.includes("icon-link") ||
            (href.startsWith("http") && !href.includes("/courses/"))
          ) {
            type = "ExternalUrl";
            externalUrl = href;
          }

          items.push({
            id: itemId,
            position: itemIndex,
            title,
            type,
            pageSlug,
            assignmentId,
            discussionId,
            fileId,
            externalUrl: externalUrl || (href ? href : undefined)
          });
        }

        modules.push({
          id: moduleId,
          name: moduleName,
          position: moduleIndex,
          items
        });
      }
    } catch {
      // Fallback if parsing fails
    }
  }

  // Fallback regex parser for Node test environments where DOMParser is not globally available
  if (typeof DOMParser === "undefined" || modules.length === 0) {
    const moduleBlockRegex =
      /<div[^>]*class=["'][^"']*\b(?:context_module|item-group-condensed)\b[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["'][^"']*\b(?:context_module|item-group-condensed)\b|$)/gi;
    let modMatch: RegExpExecArray | null;
    let moduleIndex = 0;

    while ((modMatch = moduleBlockRegex.exec(html)) !== null) {
      moduleIndex++;
      const block = modMatch[0];
      const nameMatch =
        block.match(/<span[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) ||
        block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
      const moduleName = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, "").trim() : `Module ${moduleIndex}`;

      const itemRegex = /<li[^>]*class=["']([^"']*\bcontext_module_item\b[^"']*)["'][^>]*>([\s\S]*?)<\/li>/gi;
      let itemMatch: RegExpExecArray | null;
      let itemIndex = 0;
      const items: CanvasModuleItemPayload[] = [];

      while ((itemMatch = itemRegex.exec(block)) !== null) {
        itemIndex++;
        const itemClass = itemMatch[1].toLowerCase();
        const itemContent = itemMatch[2];

        const linkMatch = itemContent.match(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
        const href = linkMatch ? linkMatch[1] : "";
        const title = linkMatch ? linkMatch[2].replace(/<[^>]+>/g, "").trim() : `Item ${itemIndex}`;

        let type: CanvasModuleItemPayload["type"] = "ContextExternalTool";
        let pageSlug: string | undefined;
        let assignmentId: string | undefined;
        let discussionId: string | undefined;
        let fileId: string | undefined;

        if (itemClass.includes("wikipage") || /\/courses\/\d+\/pages\/([^/?#]+)/i.test(href)) {
          type = "WikiPage";
          const match = href.match(/\/courses\/\d+\/pages\/([^/?#]+)/i);
          pageSlug = match ? decodeURIComponent(match[1]) : slugify(title);
          if (pageSlug) {
            addModuleMembership(pagesBySlug, pageSlug, moduleName);
          }
        } else if (
          itemClass.includes("attachment") ||
          itemClass.includes("file") ||
          itemClass.includes("icon-document") ||
          /\/files\/(\d+)/i.test(href)
        ) {
          type = "File";
          const match = href.match(/(?:\/courses\/\d+)?\/files\/(\d+)/i);
          fileId = match ? match[1] : `${moduleIndex}-${itemIndex}`;
          addModuleMembership(filesById, fileId, moduleName);
          discoveredFiles.push({
            id: fileId,
            displayName: title,
            url: href.startsWith("http") ? href : `/courses/${courseId}/files/${fileId}/download`,
            moduleNames: [moduleName]
          });
        } else if (itemClass.includes("assignment") || /\/courses\/\d+\/assignments\/(\d+)/i.test(href)) {
          type = "Assignment";
          const match = href.match(/\/courses\/\d+\/assignments\/(\d+)/i);
          if (match) {
            assignmentId = match[1];
            addModuleMembership(assignmentsById, assignmentId, moduleName);
          }
        } else if (itemClass.includes("discussion") || /\/courses\/\d+\/discussion_topics\/(\d+)/i.test(href)) {
          type = "DiscussionTopic";
          const match = href.match(/\/courses\/\d+\/discussion_topics\/(\d+)/i);
          if (match) {
            discussionId = match[1];
            addModuleMembership(discussionsById, discussionId, moduleName);
          }
        }

        items.push({
          id: `${moduleIndex}-${itemIndex}`,
          position: itemIndex,
          title,
          type,
          pageSlug,
          assignmentId,
          discussionId,
          fileId,
          externalUrl: href || undefined
        });
      }

      modules.push({
        id: String(moduleIndex),
        name: moduleName,
        position: moduleIndex,
        items
      });
    }
  }

  return { modules, pagesBySlug, assignmentsById, discussionsById, filesById, discoveredFiles };
}
