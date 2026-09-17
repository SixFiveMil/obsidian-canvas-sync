import TurndownService from "turndown";
import { highlightedCodeBlock, strikethrough, taskListItems } from "turndown-plugin-gfm";
import { canvasTablePlugin } from "./table-utils";
import type { AssetSyncFilterConfig } from "./types";

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
  // Avoid matching /assignments/syllabus
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

export interface LinkRewriteContext {
  // Map of fileId or file URL -> relative path in vault
  fileMap?: Map<string, { relativePath: string; displayName: string }>;
  // Map of module ID -> relative path in vault
  moduleMap?: Map<string, { relativePath: string; title: string }>;
  // Map of page slug or title -> relative path in vault
  pageMap?: Map<string, { relativePath: string; title: string }>;
  // Map of assignment ID -> relative path in vault
  assignmentMap?: Map<string, { relativePath: string; title: string }>;
  // Map of discussion ID -> relative path in vault
  discussionMap?: Map<string, { relativePath: string; title: string }>;
  // Map of image URL or fileId -> relative path in vault
  imageMap?: Map<string, { relativePath: string; displayName?: string }>;
  // Map of special routes (syllabus, tasks, etc.)
  specialRouteMap?: Map<string, { relativePath: string; title: string }>;
}

export function canvasLinkRewritePlugin(context?: LinkRewriteContext): (service: TurndownService) => void {
  return (turndownService: TurndownService) => {
    turndownService.addRule("canvasLinkRewrite", {
      filter: "a",
      replacement: function (content, node) {
        const el = node as HTMLElement;
        const href = el.getAttribute("href") || "";
        const trimmedContent = content.trim();

        if (!href) {
          return trimmedContent;
        }

        // Helper to format wikilink preserving outer bold/italic formatting
        const formatWikiLink = (relativePath: string, defaultTitle: string) => {
          const rawLabel = trimmedContent || defaultTitle;
          const boldMatch = rawLabel.match(/^\*\*(.+)\*\*$/);
          if (boldMatch) {
            return `**[[${relativePath}|${boldMatch[1]}]]**`;
          }
          const italicMatch = rawLabel.match(/^\*(.+)\*$/) || rawLabel.match(/^_(.+)_$/);
          if (italicMatch) {
            return `*[[${relativePath}|${italicMatch[1]}]]*`;
          }
          return `[[${relativePath}|${rawLabel}]]`;
        };

        // 1. Check if it's a Canvas File link
        const fileId = extractCanvasFileId(href);
        if (fileId && context?.fileMap?.has(fileId)) {
          const fileInfo = context.fileMap.get(fileId)!;
          return formatWikiLink(fileInfo.relativePath, fileInfo.displayName || "File");
        }

        // 2. Check if it's a Canvas Module link
        const moduleId = extractCanvasModuleId(href);
        if (moduleId && context?.moduleMap?.has(moduleId)) {
          const moduleInfo = context.moduleMap.get(moduleId)!;
          return formatWikiLink(moduleInfo.relativePath, moduleInfo.title);
        }

        // 3. Check if it's a Canvas Page link
        const pageSlug = extractCanvasPageSlug(href);
        if (pageSlug && context?.pageMap?.has(pageSlug)) {
          const pageInfo = context.pageMap.get(pageSlug)!;
          return formatWikiLink(pageInfo.relativePath, pageInfo.title);
        }

        // 4. Check if it's a Canvas Assignment link
        const assignmentId = extractCanvasAssignmentId(href);
        if (assignmentId && context?.assignmentMap?.has(assignmentId)) {
          const assignmentInfo = context.assignmentMap.get(assignmentId)!;
          return formatWikiLink(assignmentInfo.relativePath, assignmentInfo.title);
        }

        // 5. Check if it's a Canvas Discussion link
        const discussionId = extractCanvasDiscussionId(href);
        if (discussionId && context?.discussionMap?.has(discussionId)) {
          const discussionInfo = context.discussionMap.get(discussionId)!;
          return formatWikiLink(discussionInfo.relativePath, discussionInfo.title);
        }

        // 6. Check if it's a special Canvas course route
        const specialRoute = extractCanvasSpecialRoute(href);
        if (specialRoute && context?.specialRouteMap?.has(specialRoute)) {
          const routeInfo = context.specialRouteMap.get(specialRoute)!;
          return formatWikiLink(routeInfo.relativePath, routeInfo.title);
        }

        // Fallback to standard Markdown link
        const label = trimmedContent || href;
        return `[${label}](${href})`;
      }
    });

    turndownService.addRule("canvasImageRewrite", {
      filter: "img",
      replacement: function (_content, node) {
        const el = node as HTMLElement;
        const src = el.getAttribute("src") || "";
        const alt = el.getAttribute("alt") || "";

        if (!src) {
          return "";
        }

        // Check if image is in imageMap (by full src or by fileId)
        const fileId = extractCanvasFileId(src);
        const imageInfo = (fileId ? context?.imageMap?.get(fileId) : undefined) || context?.imageMap?.get(src);

        if (imageInfo) {
          return `![[${imageInfo.relativePath}]]`;
        }

        return `![${alt}](${src})`;
      }
    });
  };
}

export function createConfiguredTurndown(context?: LinkRewriteContext): TurndownService {
  const service = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  service.use([highlightedCodeBlock, strikethrough, taskListItems, canvasTablePlugin, canvasLinkRewritePlugin(context)]);
  return service;
}

