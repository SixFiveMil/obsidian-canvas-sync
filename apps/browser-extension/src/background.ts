import {
  cleanCourseName,
  extractCanvasFileId,
  extractCanvasModuleId,
  extractCanvasSpecialRoute,
  extractCourseCode,
  extractFileExtension,
  isCanvasUrl,
  isDashboardTitle,
  mimeToExtension,
  normalizeModuleItemType,
  parseAllowedExtensions,
  parseContentDispositionFilename,
  parseCourseInfo,
  parseModulesFromHtml,
  parseRubricCriteria,
  shouldDownloadAsset
} from "./sync-utils";
import type {
  AssetSyncDiagnostics,
  AssetSyncFilterConfig,
  CanvasAssignmentPayload,
  CanvasCoursePayload,
  CanvasDiscussionPayload,
  CanvasEventPayload,
  CanvasFileAssetPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasPagePayload,
  CanvasRubricCriterionPayload,
  CanvasRubricRatingPayload,
  CanvasSyncEnvelope
} from "./types";

declare const browser: {
  tabs?: {
    executeScript?: (tabId: number, details: { code?: string; allFrames?: boolean }) => Promise<unknown[]>;
  };
  scripting?: {
    executeScript?: (options: { target: { tabId: number }; func: (...args: unknown[]) => unknown; args?: unknown[] }) => Promise<Array<{ result?: unknown }>>;
  };
  permissions?: {
    contains?: (p: { origins: string[] }) => Promise<boolean>;
    request?: (p: { origins: string[] }) => Promise<boolean>;
  };
} | undefined;

const DEFAULT_PORT = 27125;

interface SyncCanvasCourseMessage {
  type: "syncCanvasCourse";
  port?: number;
  apiToken?: string;
  courseCode?: string;
  courseName?: string;
  tabId?: number;
}

interface DetectCourseInfoMessage {
  type: "detectCourseInfo";
  apiToken?: string;
  tabId?: number;
}

interface CourseModuleIndex {
  modules: CanvasModulePayload[];
  pagesBySlug: Map<string, string[]>;
  assignmentsById: Map<string, string[]>;
  discussionsById: Map<string, string[]>;
  filesById: Map<string, string[]>;
  discoveredFiles: CanvasFileAssetPayload[];
}

chrome.runtime.onMessage.addListener((rawMessage: unknown, _sender, sendResponse) => {
  if (!isRecord(rawMessage)) {
    return;
  }

  if (rawMessage.type === "detectCourseInfo") {
    const detectMessage = rawMessage as unknown as DetectCourseInfoMessage;
    void (async () => {
      try {
        const info = await detectCourseFromActiveTab(detectMessage.apiToken, detectMessage.tabId);
        sendResponse({ ok: true, ...info });
      } catch (error) {
        sendResponse({ ok: false, message: error instanceof Error ? error.message : "Failed to detect course." });
      }
    })();
    return true;
  }

  if (rawMessage.type !== "syncCanvasCourse") {
    return;
  }

  const syncMessage = rawMessage as unknown as SyncCanvasCourseMessage;

  void (async () => {
    try {
      const port = syncMessage.port ?? DEFAULT_PORT;
      const bridgeConfig = await getBridgeConfig(port);

      const envelope = await extractFromActiveCanvasTab(
        syncMessage.apiToken,
        syncMessage.courseName,
        syncMessage.courseCode,
        syncMessage.tabId
      );

      const targetTabId = await resolveActiveTabId(syncMessage.tabId);

      // Stream static assets sequentially if enabled (Option B)
      if (bridgeConfig?.config?.downloadAssets && Array.isArray(envelope.payload.files) && envelope.payload.files.length > 0) {
        const courseFolder = formatCourseFolderName(
          envelope.payload.courseCode,
          envelope.payload.courseName,
          envelope.payload.courseId
        );
        const documentsSubfolder = bridgeConfig.documentsSubfolder || "Files";
        const attachmentsSubfolder = bridgeConfig.attachmentsSubfolder || "Attachments";

        const filesToDownload: CanvasFileAssetPayload[] = [];
        const diagnostics: AssetSyncDiagnostics = envelope.payload.assetDiagnostics || {
          apiRestricted: false,
          totalDiscovered: envelope.payload.files.length,
          totalDownloaded: 0,
          totalSkippedSize: 0,
          totalFilteredExtension: 0,
          skippedFiles: []
        };

        for (const file of envelope.payload.files) {
          const decision = shouldDownloadAsset(file.displayName, file.size, bridgeConfig.config);
          if (decision.allowed) {
            filesToDownload.push(file);
          } else {
            if (decision.reason === "size_limit") {
              diagnostics.totalSkippedSize++;
              diagnostics.skippedFiles.push({
                name: file.displayName,
                reason: "size_limit",
                size: file.size
              });
            } else if (decision.reason === "extension_filtered") {
              diagnostics.totalFilteredExtension++;
              diagnostics.skippedFiles.push({
                name: file.displayName,
                reason: "extension_filtered",
                size: file.size
              });
            }
          }
        }

        // Stream each allowed asset sequentially over loopback
        for (let i = 0; i < filesToDownload.length; i++) {
          const file = filesToDownload[i];
          try {
            notifyProgress(i + 1, filesToDownload.length, file.displayName);

            const assetResult = await executeScriptInTab(targetTabId, fetchBinaryAssetInPage, [file.url]);
            if (!assetResult || !assetResult.base64) {
              diagnostics.skippedFiles.push({
                name: file.displayName,
                reason: "error",
                message: "Download failed or empty"
              });
              continue;
            }

            const binaryBytes = base64ToUint8Array(assetResult.base64);
            const headerFilename = assetResult.contentDisposition ? parseContentDispositionFilename(assetResult.contentDisposition) : null;
            const inferredExt = assetResult.contentType ? mimeToExtension(assetResult.contentType) : "";

            let finalFileName = headerFilename || file.displayName;
            if (!extractFileExtension(finalFileName) && inferredExt) {
              finalFileName = `${finalFileName}.${inferredExt}`;
            }

            const isImage = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(finalFileName) || (assetResult.contentType?.startsWith("image/") ?? false);
            const targetSubfolder = isImage ? attachmentsSubfolder : documentsSubfolder;
            const targetAssetPath = `${targetSubfolder}/${cleanFileName(finalFileName)}`;

            await postAssetToLocalBridge(port, courseFolder, targetAssetPath, finalFileName, file.id, binaryBytes);

            file.displayName = finalFileName;
            file.downloaded = true;
            file.savedRelativePath = targetAssetPath;
            if (typeof assetResult.size === "number") {
              file.size = assetResult.size;
            }
            diagnostics.totalDownloaded++;
          } catch (error) {
            console.warn("Failed to stream asset to bridge", file.displayName, error);
            diagnostics.skippedFiles.push({
              name: file.displayName,
              reason: "error",
              message: error instanceof Error ? error.message : String(error)
            });
          }
        }

        envelope.payload.assetDiagnostics = diagnostics;
      }

      const response = await postToLocalBridge(envelope, port);
      sendResponse({ ok: true, response });
    } catch (error) {
      sendResponse({ ok: false, message: error instanceof Error ? error.message : "Sync failed." });
    }
  })();

  return true;
});

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function cleanFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "file";
}

function formatCourseFolderName(courseCode: string | undefined, courseName: string, courseId: string): string {
  const code = courseCode?.trim();
  const name = cleanFileName(courseName);
  if (code) {
    return `${cleanFileName(code)} - ${name}`;
  }
  return `${name} (${courseId})`;
}

function notifyProgress(current: number, total: number, filename: string): void {
  try {
    chrome.runtime.sendMessage({
      type: "syncProgress",
      current,
      total,
      filename
    }).catch(() => {
      // Popup might not be open, safe to ignore
    });
  } catch {
    // Ignore runtime messaging errors
  }
}

async function getBridgeConfig(port: number): Promise<{
  config: AssetSyncFilterConfig;
  documentsSubfolder: string;
  attachmentsSubfolder: string;
} | null> {
  try {
    const res = (await requestJson(`http://127.0.0.1:${port}/canvas-sync/config`, {
      method: "GET",
      headers: {
        "X-Canvas-Sync-Client": "canvas-browser-extension"
      }
    })) as {
      ok?: boolean;
      config?: AssetSyncFilterConfig;
      documentsSubfolder?: string;
      attachmentsSubfolder?: string;
    };

    if (res?.ok && res.config) {
      return {
        config: res.config,
        documentsSubfolder: res.documentsSubfolder || "Files",
        attachmentsSubfolder: res.attachmentsSubfolder || "Attachments"
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function postAssetToLocalBridge(
  port: number,
  courseFolder: string,
  assetPath: string,
  assetName: string,
  assetId: string,
  data: Uint8Array
): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}/canvas-sync/asset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Canvas-Sync-Client": "canvas-browser-extension",
      "X-Course-Folder": courseFolder,
      "X-Asset-Path": assetPath,
      "X-Asset-Name": assetName,
      "X-Asset-Id": assetId
    },
    body: new Blob([data.buffer as ArrayBuffer])
  });

  if (!response.ok) {
    throw new Error(`Bridge rejected asset: ${response.status}`);
  }
}

async function resolveActiveTabId(targetTabId?: number): Promise<number> {
  if (typeof targetTabId === "number") {
    return targetTabId;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab available.");
  }
  return tab.id;
}

async function detectCourseFromActiveTab(
  apiToken?: string,
  targetTabId?: number
): Promise<{ courseId: string; courseCode: string; courseName: string }> {
  const tabId = await resolveActiveTabId(targetTabId);
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  const tabUrl = tab?.url;

  if (tabUrl && !isCanvasUrl(tabUrl)) {
    throw new Error("Open a Canvas course tab first (URL should include /courses/{id}).");
  }

  if (tabUrl) {
    await ensureCanvasOriginPermission(tabUrl);
  }

  await probeCanvasScriptExecution(tabId);

  const result = await executeScriptInTab(tabId, detectCanvasCourseInPage, [apiToken ?? null]);

  if (!result) {
    throw new Error("Canvas course detection returned no result. The page may be blocked from script execution or may not be a valid Canvas course page.");
  }

  return result;
}

async function extractFromActiveCanvasTab(
  apiToken?: string,
  customCourseName?: string,
  customCourseCode?: string,
  targetTabId?: number
): Promise<CanvasSyncEnvelope> {
  const tabId = await resolveActiveTabId(targetTabId);
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  const tabUrl = tab?.url;

  if (tabUrl && !isCanvasUrl(tabUrl)) {
    throw new Error("Open a Canvas course tab first (URL should include /courses/{id}).");
  }

  if (tabUrl) {
    await ensureCanvasOriginPermission(tabUrl);
  }

  await probeCanvasScriptExecution(tabId);

  const result = await executeScriptInTab(tabId, scrapeCanvasFromPage, [
    apiToken ?? null,
    customCourseName ?? null,
    customCourseCode ?? null
  ]);

  if (!result) {
    throw new Error("Canvas data extraction returned no result. Script execution may be blocked on this Canvas page.");
  }

  return result;
}

async function probeCanvasScriptExecution(tabId: number): Promise<void> {
  const probeResult = await executeScriptInTab(tabId, () => ({
    ok: true,
    href: location.href,
    title: document.title,
    pathname: location.pathname
  }), []);

  if (!probeResult || !probeResult.ok) {
    throw new Error("Browser did not return a valid script result from the active Canvas tab.");
  }
}

async function executeScriptInTab<T, A extends unknown[]>(tabId: number, func: (...args: A) => T, args: A): Promise<T> {
  const browserApi = typeof browser !== "undefined" ? browser : undefined;
  const scriptingApi = chrome.scripting ?? browserApi?.scripting;

  if (scriptingApi?.executeScript) {
    try {
      const results = await scriptingApi.executeScript({
        target: { tabId },
        func,
        args
      });

      const first = results?.[0];
      if (typeof first?.result !== "undefined") {
        return first.result as T;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scripting error.";
      console.warn("chrome.scripting fallback failed:", message);
    }
  }

  const browserTabsApi = browserApi?.tabs;
  if (browserTabsApi?.executeScript) {
    try {
      const serialized = `(${func.toString()})(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
      const result = await browserTabsApi.executeScript(tabId, { code: serialized, allFrames: false });
      if (Array.isArray(result) && result.length > 0) {
        return result[0] as T;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tabs.executeScript error.";
      throw new Error(`Canvas script execution failed: ${message}`);
    }
  }

  throw new Error("The Canvas page returned no payload from script execution.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function requestText(
  url: string,
  options?: {
    method?: "GET" | "POST" | "OPTIONS";
    headers?: Record<string, string>;
    body?: string;
    withCredentials?: boolean;
  }
): Promise<string> {
  const response = await fetch(url, {
    method: options?.method ?? "GET",
    headers: options?.headers,
    body: options?.body,
    credentials: options?.withCredentials ? "include" : "omit"
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return await response.text();
}

async function requestJson(
  url: string,
  options?: {
    method?: "GET" | "POST" | "OPTIONS";
    headers?: Record<string, string>;
    body?: string;
    withCredentials?: boolean;
  }
): Promise<unknown> {
  const text = await requestText(url, options);
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text) as unknown;
}

const BRIDGE_PAYLOAD_LIMIT_MB = 25;

async function postToLocalBridge(envelope: CanvasSyncEnvelope, port: number): Promise<unknown> {
  const serialized = JSON.stringify(envelope);
  const sizeBytes = new TextEncoder().encode(serialized).length;
  const sizeMb = sizeBytes / (1024 * 1024);
  if (sizeMb > BRIDGE_PAYLOAD_LIMIT_MB) {
    throw new Error(
      `Payload is ${sizeMb.toFixed(1)} MB which exceeds the ${BRIDGE_PAYLOAD_LIMIT_MB} MB limit. ` +
      `Your course notes are too large. Try reducing the number of synced modules.`
    );
  }

  try {
    return await requestJson(`http://127.0.0.1:${port}/canvas-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Canvas-Sync-Client": "canvas-browser-extension"
      },
      body: JSON.stringify(envelope)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bridge request failed";
    throw new Error(`Bridge rejected payload: ${message}`);
  }
}

async function ensureCanvasOriginPermission(tabUrl: string): Promise<void> {
  try {
    const parsed = new URL(tabUrl);
    const originPattern = `${parsed.origin}/*`;
    const browserApi = typeof browser !== "undefined" ? browser : undefined;
    const permissionsApi = chrome.permissions ?? browserApi?.permissions;

    if (!permissionsApi) {
      return;
    }

    const hasPermission = await permissionsApi.contains?.({ origins: [originPattern] }).catch(() => false);
    if (hasPermission) {
      return;
    }

    const granted = await permissionsApi.request?.({ origins: [originPattern] }).catch(() => false);
    if (!granted) {
      throw new Error(`Browser blocked access to ${parsed.origin}. Please allow access to this Canvas site and reload the page.`);
    }
  } catch {
    // Ignore permission issues for non-standard URLs
  }
}

// In-page asset fetcher that runs in the active Canvas tab context with session cookies
async function fetchBinaryAssetInPage(url: string): Promise<{
  base64: string;
  contentType: string;
  contentDisposition: string;
  size: number;
} | null> {
  // Strategy 1: Standard fetch with credentials: "include"
  try {
    const response = await fetch(url, { credentials: "include" });
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const contentDisposition = response.headers.get("content-disposition") || "";
      const blob = await response.blob();
      const base64 = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          if (typeof result === "string") {
            const commaIndex = result.indexOf(",");
            resolve(commaIndex !== -1 ? result.slice(commaIndex + 1) : result);
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (base64) {
        return {
          base64,
          contentType,
          contentDisposition,
          size: blob.size
        };
      }
    }
  } catch {
    // Fetch failed (likely CORS redirect to S3 storage), fallback to XHR
  }

  // Strategy 2: XMLHttpRequest with arraybuffer
  try {
    const xhrResult = await new Promise<{
      base64: string;
      contentType: string;
      contentDisposition: string;
      size: number;
    } | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      xhr.withCredentials = true;

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 400 && xhr.response) {
          const arrayBuffer = xhr.response as ArrayBuffer;
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const contentType = xhr.getResponseHeader("content-type") || "";
          const contentDisposition = xhr.getResponseHeader("content-disposition") || "";
          resolve({
            base64,
            contentType,
            contentDisposition,
            size: len
          });
        } else {
          resolve(null);
        }
      };

      xhr.onerror = () => resolve(null);
      xhr.send();
    });

    if (xhrResult) {
      return xhrResult;
    }
  } catch {
    // XHR failed, fallback to anonymous fetch
  }

  // Strategy 3: Anonymous fetch (for pre-signed S3 links)
  try {
    const response = await fetch(url);
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const contentDisposition = response.headers.get("content-disposition") || "";
      const blob = await response.blob();
      const base64 = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          if (typeof result === "string") {
            const commaIndex = result.indexOf(",");
            resolve(commaIndex !== -1 ? result.slice(commaIndex + 1) : result);
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (base64) {
        return {
          base64,
          contentType,
          contentDisposition,
          size: blob.size
        };
      }
    }
  } catch {
    // All download attempts failed
  }

  return null;
}

async function scrapeCanvasFromPage(
  apiToken: string | null,
  customCourseName: string | null = null,
  customCourseCode: string | null = null
): Promise<CanvasSyncEnvelope> {
  const href = window.location.href;
  const match = window.location.pathname.match(/\/courses\/(\d+)/);
  if (!match) {
    throw new Error("Could not determine Canvas course ID from URL.");
  }

  const courseId = match[1];

  function requestText(
    url: string,
    options?: {
      method?: "GET" | "POST" | "OPTIONS";
      headers?: Record<string, string>;
      body?: string;
      withCredentials?: boolean;
    }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options?.method ?? "GET", url, true);
      xhr.withCredentials = options?.withCredentials ?? false;

      const headers = options?.headers ?? {};
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value);
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
          return;
        }
        reject(new Error(`Request failed: ${xhr.status}`));
      };

      xhr.onerror = () => {
        reject(new Error("Network request failed."));
      };

      xhr.send(options?.body);
    });
  }

  async function requestJson(
    url: string,
    options?: {
      method?: "GET" | "POST" | "OPTIONS";
      headers?: Record<string, string>;
      body?: string;
      withCredentials?: boolean;
    }
  ): Promise<unknown> {
    const text = await requestText(url, options);
    if (!text.trim()) {
      return {};
    }
    return JSON.parse(text) as unknown;
  }

  let detectedCourseCode = "";
  let detectedCourseName = "";

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function isUnknownArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeModuleItemType(typeValue: unknown): CanvasModuleItemPayload["type"] {
    const type = String(typeValue ?? "").toLowerCase();
    if (type === "page" || type === "wikipage") return "WikiPage";
    if (type === "assignment") return "Assignment";
    if (type === "discussion" || type === "discussiontopic") return "DiscussionTopic";
    if (type === "file" || type === "attachment") return "File";
    if (type === "externalurl") return "ExternalUrl";
    if (type === "subheader" || type === "contextmodulesubheader") return "ContextModuleSubHeader";
    if (type === "externaltool" || type === "contextexternaltool") return "ContextExternalTool";
    return "ContextExternalTool";
  }

  function addModuleMembership(map: Map<string, string[]>, key: string, moduleName: string): void {
    const existing = map.get(key) ?? [];
    if (!existing.includes(moduleName)) {
      existing.push(moduleName);
      map.set(key, existing);
    }
  }

  function parseRubricCriteria(item: unknown): CanvasAssignmentPayload["rubric"] {
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

  function parseModulesFromHtml(html: string, cId: string): CourseModuleIndex {
    const pBySlug = new Map<string, string[]>();
    const aById = new Map<string, string[]>();
    const dById = new Map<string, string[]>();
    const fById = new Map<string, string[]>();
    const discFiles: CanvasFileAssetPayload[] = [];
    const mods: CanvasModulePayload[] = [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const moduleEls = doc.querySelectorAll(".context_module, .item-group-condensed");

    let mIdx = 0;
    for (const moduleEl of Array.from(moduleEls)) {
      mIdx++;
      const mId =
        moduleEl.getAttribute("data-module-id") ||
        moduleEl.id.replace(/^context_module_/, "") ||
        String(mIdx);

      const headerEl = moduleEl.querySelector(".name, .header, .ig-header-title, h2, h3, .title");
      const mName = headerEl?.textContent?.trim() || `Module ${mIdx}`;

      const itemEls = moduleEl.querySelectorAll(".context_module_item, .ig-row");
      const itms: CanvasModuleItemPayload[] = [];
      let iIdx = 0;

      for (const itemEl of Array.from(itemEls)) {
        iIdx++;
        const itmId =
          itemEl.getAttribute("data-item-id") ||
          itemEl.id.replace(/^context_module_item_/, "") ||
          `${mId}-${iIdx}`;

        const linkEl = itemEl.querySelector("a.ig-title, a.item_link, a");
        const itmTitle =
          linkEl?.getAttribute("title")?.trim() ||
          linkEl?.textContent?.trim() ||
          itemEl.querySelector(".item_name, .title")?.textContent?.trim() ||
          `Item ${iIdx}`;

        const itmHref = linkEl?.getAttribute("href") || "";
        const cList = (
          itemEl.className +
          " " +
          (linkEl?.className || "") +
          " " +
          (itemEl.querySelector("i")?.className || "")
        ).toLowerCase();

        let itmType: CanvasModuleItemPayload["type"] = "ContextExternalTool";
        let itmSlug: string | undefined;
        let itmAssignId: string | undefined;
        let itmDiscId: string | undefined;
        let itmFileId: string | undefined;
        let itmExtUrl: string | undefined;

        if (
          cList.includes("contextmodulesubheader") ||
          cList.includes("sub_header") ||
          cList.includes("header_title")
        ) {
          itmType = "ContextModuleSubHeader";
        } else if (
          cList.includes("wikipage") ||
          cList.includes("icon-page") ||
          /\/courses\/\d+\/pages\/([^/?#]+)/i.test(itmHref)
        ) {
          itmType = "WikiPage";
          const m = itmHref.match(/\/courses\/\d+\/pages\/([^/?#]+)/i);
          itmSlug = m ? decodeURIComponent(m[1]) : slugify(itmTitle);
          if (itmSlug) {
            addModuleMembership(pBySlug, itmSlug, mName);
          }
        } else if (
          cList.includes("assignment") ||
          cList.includes("icon-assignment") ||
          /\/courses\/\d+\/assignments\/(\d+)/i.test(itmHref)
        ) {
          itmType = "Assignment";
          const m = itmHref.match(/\/courses\/\d+\/assignments\/(\d+)/i);
          if (m) {
            itmAssignId = m[1];
            addModuleMembership(aById, itmAssignId, mName);
          }
        } else if (
          cList.includes("discussion") ||
          cList.includes("icon-discussion") ||
          /\/courses\/\d+\/discussion_topics\/(\d+)/i.test(itmHref)
        ) {
          itmType = "DiscussionTopic";
          const m = itmHref.match(/\/courses\/\d+\/discussion_topics\/(\d+)/i);
          if (m) {
            itmDiscId = m[1];
            addModuleMembership(dById, itmDiscId, mName);
          }
        } else if (
          cList.includes("attachment") ||
          cList.includes("file") ||
          cList.includes("icon-document") ||
          cList.includes("icon-paperclip") ||
          cList.includes("icon-download") ||
          /\/files\/(\d+)/i.test(itmHref)
        ) {
          itmType = "File";
          const m = itmHref.match(/(?:\/courses\/\d+)?\/files\/(\d+)/i);
          itmFileId = m ? m[1] : itmId;
          addModuleMembership(fById, itmFileId, mName);
          discFiles.push({
            id: itmFileId,
            displayName: itmTitle,
            url: itmHref.startsWith("http")
              ? itmHref
              : `${window.location.origin}/courses/${cId}/files/${itmFileId}/download`,
            moduleNames: [mName]
          });
        } else if (
          cList.includes("externalurl") ||
          cList.includes("icon-link") ||
          (itmHref.startsWith("http") && !itmHref.includes("/courses/"))
        ) {
          itmType = "ExternalUrl";
          itmExtUrl = itmHref;
        }

        itms.push({
          id: itmId,
          position: iIdx,
          title: itmTitle,
          type: itmType,
          pageSlug: itmSlug,
          assignmentId: itmAssignId,
          discussionId: itmDiscId,
          fileId: itmFileId,
          externalUrl: itmExtUrl || (itmHref ? itmHref : undefined)
        });
      }

      mods.push({
        id: mId,
        name: mName,
        position: mIdx,
        items: itms
      });
    }

    return {
      modules: mods,
      pagesBySlug: pBySlug,
      assignmentsById: aById,
      discussionsById: dById,
      filesById: fById,
      discoveredFiles: discFiles
    };
  }

  // 1. Attempt Canvas API fetch /api/v1/courses/${courseId} to extract official name and course_code
  try {
    const courseDetail = (await api(`/api/v1/courses/${courseId}`)) as Record<string, unknown> | null;
    if (isRecord(courseDetail)) {
      if (typeof courseDetail.course_code === "string" && courseDetail.course_code.trim()) {
        detectedCourseCode = courseDetail.course_code.trim();
      }
      if (typeof courseDetail.name === "string" && courseDetail.name.trim()) {
        detectedCourseName = courseDetail.name.trim();
      }
    }
  } catch {
    // API failure handled with DOM fallbacks
  }

  const COURSE_CODE_REGEX = /\b([A-Z]{2,5}[-\s]?\d{3,4}[A-Z]?)\b/i;

  function isDashboard(text: string): boolean {
    const n = text.trim().toLowerCase();
    return (
      n === "dashboard" ||
      n === "my dashboard" ||
      n.startsWith("dashboard") ||
      n.startsWith("my dashboard") ||
      n === "courses" ||
      n === "my courses"
    );
  }

  function cleanTitle(raw: string, code?: string): string {
    if (isDashboard(raw)) return "";
    let s = raw
      .trim()
      .replace(/\s*[-:|•]\s*Canvas(?:\s+LMS)?.*$/i, "")
      .replace(/\s*[-:|•]\s*(?:Course\s+)?Home$/i, "")
      .replace(/\s*[-:|•]\s*Modules$/i, "")
      .replace(/\s*[-:|•]\s*Syllabus$/i, "")
      .replace(/\s*[-:|•]\s*Assignments$/i, "")
      .trim();

    const c = code || s.match(COURSE_CODE_REGEX)?.[1];
    if (c) {
      const esc = c.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      s = s.replace(new RegExp(`^${esc}\\s*[-:]*\\s*`, "i"), "");
      s = s.replace(new RegExp(`\\s*[([]?\\s*${esc}\\s*[)\\]]?$`, "i"), "");
    }
    s = s.replace(/\s+/g, " ").trim();
    return isDashboard(s) ? "" : s;
  }

  const breadcrumbCourseEl = document.querySelector('#breadcrumbs a[href*="/courses/"]');
  const breadcrumbCourseText = breadcrumbCourseEl?.textContent?.trim() || "";

  const lastBreadcrumbSpan = document.querySelector('#breadcrumbs li:last-child span');
  const lastBreadcrumbText = lastBreadcrumbSpan?.textContent?.trim() || "";

  const courseTitleEl = document.querySelector('.course-title');
  const courseTitleText = courseTitleEl?.textContent?.trim() || "";

  const docTitle = document.title || document.querySelector("title")?.textContent?.trim() || "";

  const domCandidates = [
    breadcrumbCourseText,
    courseTitleText,
    lastBreadcrumbText,
    docTitle
  ].filter((t): t is string => Boolean(t && !isDashboard(t)));

  if (!detectedCourseCode) {
    for (const text of [detectedCourseName, ...domCandidates]) {
      const m = text.match(COURSE_CODE_REGEX);
      if (m) {
        detectedCourseCode = m[1].trim();
        break;
      }
    }
  }

  if (!detectedCourseName || isDashboard(detectedCourseName)) {
    for (const text of domCandidates) {
      const cleaned = cleanTitle(text, detectedCourseCode);
      if (cleaned) {
        detectedCourseName = cleaned;
        break;
      }
    }
  } else {
    detectedCourseName = cleanTitle(detectedCourseName, detectedCourseCode) || detectedCourseName;
  }

  const finalCourseCode = customCourseCode?.trim() || detectedCourseCode || undefined;
  const finalCourseName = customCourseName?.trim() || detectedCourseName || `Course ${courseId}`;

  const moduleIndex = await getCourseModuleIndex(courseId);

  const [courseHomePageHtml, syllabusHtml, pages, assignments, discussions, events, filesResult] = await Promise.all([
    getCourseHomePage(courseId),
    getSyllabus(courseId),
    getPages(courseId, moduleIndex.pagesBySlug),
    getAssignments(courseId, moduleIndex.assignmentsById),
    getDiscussions(courseId, moduleIndex.discussionsById),
    getEvents(courseId),
    getFiles(courseId)
  ]);

  const fileMapById = new Map<string, CanvasFileAssetPayload>();
  for (const f of filesResult.files) {
    fileMapById.set(f.id, f);
  }

  // Merge files discovered from module index (API or HTML)
  for (const f of moduleIndex.discoveredFiles) {
    if (!fileMapById.has(f.id)) {
      fileMapById.set(f.id, f);
    }
  }

  for (const [fileId, moduleNames] of moduleIndex.filesById.entries()) {
    if (!fileMapById.has(fileId)) {
      fileMapById.set(fileId, {
        id: fileId,
        displayName: `file_${fileId}`,
        url: `${window.location.origin}/courses/${courseId}/files/${fileId}/download`,
        moduleNames
      });
    }
  }

  // Scan HTML content for any additional file links or image links
  const allHtmlBlocks = [
    courseHomePageHtml,
    syllabusHtml,
    ...pages.map((p) => p.html),
    ...assignments.map((a) => a.descriptionHtml || ""),
    ...discussions.map((d) => d.messageHtml || "")
  ];

  for (const html of allHtmlBlocks) {
    if (!html) continue;

    // 1. Extract embedded images with alt text & full URL (including verifier tokens)
    const imgMatches = html.matchAll(/<img[^>]+src=["']((?:https?:\/\/[^"'\s]+)?(?:\/courses\/\d+)?\/files\/(\d+)[^"']*)["'][^>]*>/gi);
    for (const match of imgMatches) {
      const imgTag = match[0];
      const rawSrc = match[1];
      const fid = match[2];
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1].trim() : "";
      const initialName = alt && !alt.startsWith("http") ? alt : `image_${fid}`;
      let downloadUrl = rawSrc.startsWith("http") ? rawSrc : `${window.location.origin}${rawSrc}`;
      if (!downloadUrl.includes("/download") && !downloadUrl.includes("/preview")) {
        downloadUrl = downloadUrl.replace(`/files/${fid}`, `/files/${fid}/download`);
      }

      if (fid) {
        const existing = fileMapById.get(fid);
        if (!existing || existing.displayName.startsWith("asset_") || existing.displayName.startsWith("file_")) {
          fileMapById.set(fid, {
            id: fid,
            displayName: initialName,
            url: downloadUrl,
            moduleNames: existing?.moduleNames
          });
        }
      }
    }

    // 2. Extract <a> links with href & full query params (including verifier tokens)
    const linkMatches = html.matchAll(/(?:href|src)=["']((?:https?:\/\/[^"'\s]+)?(?:\/courses\/\d+)?\/files\/(\d+)(?:[^\s"']*))["']/gi);
    for (const match of linkMatches) {
      const rawUrl = match[1];
      const fid = match[2];
      let downloadUrl = rawUrl.startsWith("http") ? rawUrl : `${window.location.origin}${rawUrl}`;
      if (!downloadUrl.includes("/download") && !downloadUrl.includes("/preview")) {
        downloadUrl = downloadUrl.replace(`/files/${fid}`, `/files/${fid}/download`);
      }

      if (fid && !fileMapById.has(fid)) {
        fileMapById.set(fid, {
          id: fid,
          displayName: `asset_${fid}`,
          url: downloadUrl
        });
      }
    }
  }

  const files = Array.from(fileMapById.values());
  const assetDiagnostics: AssetSyncDiagnostics = {
    apiRestricted: filesResult.apiRestricted,
    totalDiscovered: files.length,
    totalDownloaded: 0,
    totalSkippedSize: 0,
    totalFilteredExtension: 0,
    skippedFiles: []
  };

  const payload: CanvasCoursePayload = {
    courseId,
    courseCode: finalCourseCode,
    courseName: finalCourseName,
    fetchedAt: new Date().toISOString(),
    courseHomePageHtml: courseHomePageHtml || undefined,
    syllabusHtml: syllabusHtml || undefined,
    modules: moduleIndex.modules,
    pages,
    assignments,
    discussions,
    events,
    files,
    assetDiagnostics
  };

  return {
    source: "canvas-browser-extension",
    version: "1",
    payload
  };

  async function getFiles(id: string): Promise<{ files: CanvasFileAssetPayload[]; apiRestricted: boolean }> {
    try {
      const list = await api(`/api/v1/courses/${id}/files?per_page=100`);
      if (!isUnknownArray(list)) {
        return { files: [], apiRestricted: true };
      }

      const files: CanvasFileAssetPayload[] = [];
      for (const item of list) {
        if (!isRecord(item) || item.id == null) {
          continue;
        }

        const fileId = String(item.id);
        const displayName =
          typeof item.display_name === "string" && item.display_name.trim()
            ? item.display_name.trim()
            : typeof item.filename === "string" && item.filename.trim()
              ? item.filename.trim()
              : `file_${fileId}`;
        const downloadUrl =
          typeof item.url === "string" && item.url.trim()
            ? item.url.trim()
            : `${window.location.origin}/courses/${id}/files/${fileId}/download`;
        const size = typeof item.size === "number" ? item.size : undefined;
        const contentType = typeof item["content-type"] === "string" ? item["content-type"] : undefined;

        files.push({
          id: fileId,
          displayName,
          url: downloadUrl,
          size,
          contentType
        });
      }

      return { files, apiRestricted: false };
    } catch {
      return { files: [], apiRestricted: true };
    }
  }

  async function getCourseHomePage(id: string): Promise<string> {
    try {
      const frontPage = (await api(`/api/v1/courses/${id}/front_page`)) as Record<string, unknown> | null;
      if (typeof frontPage?.body === "string" && frontPage.body.trim() !== "") {
        return frontPage.body;
      }
      return "";
    } catch {
      return "";
    }
  }

  async function getSyllabus(id: string): Promise<string> {
    try {
      const course = (await api(`/api/v1/courses/${id}?include[]=syllabus_body`)) as Record<string, unknown> | null;
      if (typeof course?.syllabus_body === "string" && course.syllabus_body.trim() !== "") {
        return course.syllabus_body;
      }
      return "";
    } catch {
      return "";
    }
  }

  async function getPages(id: string, memberships: Map<string, string[]>): Promise<CanvasPagePayload[]> {
    try {
      const list = await api(`/api/v1/courses/${id}/pages?per_page=100`);
      if (!isUnknownArray(list)) {
        throw new Error("Pages API returned a non-array payload.");
      }

      const result: CanvasPagePayload[] = [];
      for (const page of list) {
        if (!isRecord(page) || typeof page.url !== "string" || !page.url.trim()) {
          continue;
        }

        const slug = page.url.trim();
        const moduleNames = memberships.get(slug);
        const title = typeof page.title === "string" && page.title.trim() ? page.title.trim() : slug;
        const updatedAt = typeof page.updated_at === "string" ? page.updated_at : undefined;
        const retrieved = await getPageBySlug(id, slug, title, updatedAt, moduleNames);
        if (retrieved) {
          result.push(retrieved);
        }
      }

      if (result.length > 0) {
        return result;
      }

      throw new Error("No pages were returned from Canvas API.");
    } catch (error) {
      console.warn("Canvas pages API failed; trying module-derived page discovery", {
        courseId: id,
        error: error instanceof Error ? error.message : String(error)
      });

      const modulePages = await getPagesFromModules(id, memberships);
      if (modulePages.length > 0) {
        return modulePages;
      }

      console.warn("Module-derived page discovery failed; using current-page fallback", {
        courseId: id
      });

      const fallbackHtml = document.querySelector(".user_content, .show-content")?.innerHTML ?? "";
      const fallbackTitle = document.querySelector("h1")?.textContent?.trim() || "Current Canvas Page";
      const fallbackSlug = extractSlugFromCoursePageUrl(href, id);
      return fallbackHtml
        ? [
            {
              title: fallbackTitle,
              html: fallbackHtml,
              url: href,
              slug: fallbackSlug || undefined,
              updatedAt: new Date().toISOString(),
              moduleNames: fallbackSlug ? memberships.get(fallbackSlug) : undefined
            }
          ]
        : [];
    }
  }

  async function getPageBySlug(
    id: string,
    slug: string,
    fallbackTitle: string,
    fallbackUpdatedAt: string | null | undefined,
    moduleNames?: string[]
  ): Promise<CanvasPagePayload | null> {
    const routeUrl = `${window.location.origin}/courses/${id}/pages/${encodeURIComponent(slug)}`;

    try {
      const detail = (await api(`/api/v1/courses/${id}/pages/${encodeURIComponent(slug)}`)) as Record<string, unknown> | null;
      let html = typeof detail?.body === "string" ? detail.body : "";
      if (!html) {
        html = await fetchPageHtml(routeUrl);
      }

      if (html) {
        return {
          title: typeof detail?.title === "string" && detail.title.trim() !== "" ? detail.title : fallbackTitle,
          html,
          url: routeUrl,
          slug,
          updatedAt: typeof detail?.updated_at === "string" ? detail.updated_at : fallbackUpdatedAt || undefined,
          moduleNames: moduleNames && moduleNames.length > 0 ? moduleNames : undefined
        };
      }
    } catch {
      // API failure handled by HTML fallback
    }

    try {
      const html = await fetchPageHtml(routeUrl);
      if (html) {
        return {
          title: fallbackTitle,
          html,
          url: routeUrl,
          slug,
          updatedAt: fallbackUpdatedAt || undefined,
          moduleNames: moduleNames && moduleNames.length > 0 ? moduleNames : undefined
        };
      }
    } catch (routeError) {
      console.warn("Canvas page detail fetch failed", {
        courseId: id,
        pageUrl: slug,
        routeError: routeError instanceof Error ? routeError.message : String(routeError)
      });
    }

    return null;
  }

  async function getPagesFromModules(id: string, memberships: Map<string, string[]>): Promise<CanvasPagePayload[]> {
    if (memberships.size === 0) {
      return [];
    }

    const pages: CanvasPagePayload[] = [];
    for (const [slug, moduleNames] of memberships.entries()) {
      const page = await getPageBySlug(id, slug, slugToTitle(slug), null, moduleNames);
      if (page) {
        pages.push(page);
      }
    }

    return pages;
  }

  async function getCourseModuleIndex(id: string): Promise<CourseModuleIndex> {
    const pagesBySlug = new Map<string, string[]>();
    const assignmentsById = new Map<string, string[]>();
    const discussionsById = new Map<string, string[]>();
    const filesById = new Map<string, string[]>();
    const discoveredFiles: CanvasFileAssetPayload[] = [];
    const modules: CanvasModulePayload[] = [];

    // 1. First attempt Canvas REST API
    try {
      const apiModules = await api(`/api/v1/courses/${id}/modules?include[]=items&per_page=100`);
      if (isUnknownArray(apiModules) && apiModules.length > 0) {
        for (let moduleIndex = 0; moduleIndex < apiModules.length; moduleIndex += 1) {
          const module = apiModules[moduleIndex];
          if (!isRecord(module)) {
            continue;
          }

          const moduleName =
            typeof module.name === "string" && module.name.trim() !== "" ? module.name.trim() : "Uncategorized Module";

          const items: CanvasModuleItemPayload[] = [];
          if (isUnknownArray(module.items)) {
            for (let itemIndex = 0; itemIndex < module.items.length; itemIndex += 1) {
              const item = module.items[itemIndex];
              if (!isRecord(item)) {
                continue;
              }

              const rawType = typeof item.type === "string" ? item.type : undefined;
              const normalizedType = normalizeModuleItemType(rawType);
              const itemId = item.id != null ? String(item.id) : `${moduleIndex}-${itemIndex}`;
              const position =
                typeof item.position === "number" && Number.isFinite(item.position) ? item.position : itemIndex + 1;
              const title =
                typeof item.title === "string" && item.title.trim() !== ""
                  ? item.title.trim()
                  : `Untitled Item ${itemIndex + 1}`;
              const indent =
                typeof item.indent === "number" && Number.isFinite(item.indent) ? item.indent : undefined;

              const normalizedItem: CanvasModuleItemPayload = {
                id: itemId,
                position,
                title,
                type: normalizedType,
                indent
              };

              if (normalizedType === "WikiPage") {
                const slug =
                  typeof item.page_url === "string" && item.page_url.trim() !== "" ? item.page_url.trim() : undefined;
                if (slug) {
                  normalizedItem.pageSlug = slug;
                  addModuleMembership(pagesBySlug, slug, moduleName);
                }
              }

              if (normalizedType === "Assignment" && item.content_id != null) {
                const assignmentId = String(item.content_id);
                normalizedItem.assignmentId = assignmentId;
                addModuleMembership(assignmentsById, assignmentId, moduleName);
              }

              if (normalizedType === "DiscussionTopic" && item.content_id != null) {
                const discussionId = String(item.content_id);
                normalizedItem.discussionId = discussionId;
                addModuleMembership(discussionsById, discussionId, moduleName);
              }

              if (normalizedType === "File" && item.content_id != null) {
                const fileId = String(item.content_id);
                normalizedItem.fileId = fileId;
                addModuleMembership(filesById, fileId, moduleName);
                discoveredFiles.push({
                  id: fileId,
                  displayName: title,
                  url: `${window.location.origin}/courses/${id}/files/${fileId}/download`,
                  moduleNames: [moduleName]
                });
              }

              if (normalizedType === "ExternalUrl" || normalizedType === "ContextExternalTool") {
                if (typeof item.external_url === "string" && item.external_url.trim() !== "") {
                  normalizedItem.externalUrl = item.external_url.trim();
                } else if (typeof item.html_url === "string" && item.html_url.trim() !== "") {
                  normalizedItem.externalUrl = item.html_url.trim();
                } else if (typeof item.url === "string" && item.url.trim() !== "") {
                  normalizedItem.externalUrl = item.url.trim();
                }
              }

              items.push(normalizedItem);
            }
          }

          const moduleId = module.id != null ? String(module.id) : String(moduleIndex + 1);
          const summaryHtml =
            typeof module.description === "string" && module.description.trim() !== "" ? module.description : undefined;

          modules.push({
            id: moduleId,
            name: moduleName,
            position: moduleIndex + 1,
            summaryHtml,
            items: items.sort((a, b) => a.position - b.position)
          });
        }

        if (modules.length > 0) {
          return { modules, pagesBySlug, assignmentsById, discussionsById, filesById, discoveredFiles };
        }
      }
    } catch (apiError) {
      console.warn("Canvas modules API failed; falling back to web HTML parsing", {
        courseId: id,
        error: apiError instanceof Error ? apiError.message : String(apiError)
      });
    }

    // 2. DOM / Web HTML parsing fallback for /courses/:id/modules
    try {
      let modulesHtml = "";
      if (
        window.location.pathname.includes(`/courses/${id}/modules`) ||
        document.querySelector(".context_module, #context_modules")
      ) {
        modulesHtml = document.body.innerHTML;
      } else {
        modulesHtml = await requestText(`${window.location.origin}/courses/${id}/modules`, { withCredentials: true });
      }

      if (modulesHtml) {
        const parsed = parseModulesFromHtml(modulesHtml, id);
        if (parsed.modules.length > 0) {
          return parsed;
        }
      }
    } catch (domError) {
      console.warn("DOM fallback for modules failed", {
        courseId: id,
        error: domError instanceof Error ? domError.message : String(domError)
      });
    }

    return { modules, pagesBySlug, assignmentsById, discussionsById, filesById, discoveredFiles };
  }

  async function fetchPageHtml(url: string): Promise<string> {
    const htmlDoc = await requestText(url, { withCredentials: true });
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlDoc, "text/html");
    const content =
      doc.querySelector(".user_content")?.innerHTML ??
      doc.querySelector(".show-content")?.innerHTML ??
      doc.querySelector(".user_content.enhanced")?.innerHTML ??
      doc.querySelector(".ic-Layout-contentMain .user_content")?.innerHTML ??
      doc.querySelector("#content .user_content")?.innerHTML ??
      doc.querySelector(".page-description")?.innerHTML ??
      "";
    return content.trim();
  }

  function slugToTitle(slug: string): string {
    return slug
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase()) || slug;
  }

  function extractSlugFromCoursePageUrl(url: string, id: string): string | null {
    try {
      const parsed = new URL(url);
      const pageMatch = parsed.pathname.match(new RegExp(`/courses/${id}/pages/([^/]+)$`));
      if (!pageMatch) {
        return null;
      }
      return decodeURIComponent(pageMatch[1]);
    } catch {
      return null;
    }
  }

  async function getAssignments(id: string, memberships: Map<string, string[]>): Promise<CanvasAssignmentPayload[]> {
    try {
      const list = await api(`/api/v1/courses/${id}/assignments?per_page=100&include[]=rubric`);
      if (isUnknownArray(list) && list.length > 0) {
        const assignments: CanvasAssignmentPayload[] = [];
        for (const item of list) {
          if (!isRecord(item)) {
            continue;
          }

          const assignmentId = item.id != null ? String(item.id) : "";
          const name =
            typeof item.name === "string" && item.name.trim() !== "" ? item.name.trim() : "Untitled assignment";
          const dueAt = typeof item.due_at === "string" ? item.due_at : null;
          const pointsPossible = typeof item.points_possible === "number" ? item.points_possible : null;
          const htmlUrl =
            typeof item.html_url === "string" && item.html_url.trim() !== "" ? item.html_url.trim() : undefined;
          const descriptionHtml = typeof item.description === "string" ? item.description : undefined;
          const submissionTypes = Array.isArray(item.submission_types)
            ? item.submission_types.filter((s): s is string => typeof s === "string")
            : undefined;

          assignments.push({
            id: assignmentId,
            name,
            dueAt,
            pointsPossible,
            htmlUrl,
            descriptionHtml,
            submissionTypes,
            moduleNames: memberships.get(assignmentId),
            rubric: parseRubricCriteria(item)
          });
        }
        return assignments;
      }
    } catch {
      // API fallback
    }

    // Fallback: build placeholder assignment entries from module membership
    const fallbackAssignments: CanvasAssignmentPayload[] = [];
    for (const [assignmentId, moduleNames] of memberships.entries()) {
      const routeUrl = `${window.location.origin}/courses/${id}/assignments/${assignmentId}`;
      try {
        const html = await fetchPageHtml(routeUrl);
        fallbackAssignments.push({
          id: assignmentId,
          name: `Assignment ${assignmentId}`,
          htmlUrl: routeUrl,
          descriptionHtml: html || undefined,
          moduleNames
        });
      } catch {
        fallbackAssignments.push({
          id: assignmentId,
          name: `Assignment ${assignmentId}`,
          htmlUrl: routeUrl,
          moduleNames
        });
      }
    }
    return fallbackAssignments;
  }

  async function getDiscussions(id: string, memberships: Map<string, string[]>): Promise<CanvasDiscussionPayload[]> {
    try {
      const list = await api(`/api/v1/courses/${id}/discussion_topics?per_page=100`);
      if (isUnknownArray(list) && list.length > 0) {
        const discussions: CanvasDiscussionPayload[] = [];
        for (const item of list) {
          if (!isRecord(item)) {
            continue;
          }

          const discussionId = item.id != null ? String(item.id) : "";
          const title =
            typeof item.title === "string" && item.title.trim() !== "" ? item.title.trim() : "Untitled discussion";
          const htmlUrl =
            typeof item.html_url === "string" && item.html_url.trim() !== "" ? item.html_url.trim() : undefined;
          const messageHtml = typeof item.message === "string" ? item.message : undefined;
          const postedAt = typeof item.posted_at === "string" ? item.posted_at : null;
          const updatedAt = typeof item.updated_at === "string" ? item.updated_at : null;

          discussions.push({
            id: discussionId,
            title,
            htmlUrl,
            messageHtml,
            postedAt,
            updatedAt,
            moduleNames: memberships.get(discussionId)
          });
        }
        return discussions;
      }
    } catch {
      // Fallback
    }

    return [];
  }

  async function getEvents(id: string): Promise<CanvasEventPayload[]> {
    try {
      const list = await api(`/api/v1/calendar_events?context_codes[]=course_${id}&per_page=100`);
      if (!isUnknownArray(list)) {
        return [];
      }

      const events: CanvasEventPayload[] = [];
      for (const item of list) {
        if (!isRecord(item)) {
          continue;
        }

        const eventId = item.id != null ? String(item.id) : "";
        const title =
          typeof item.title === "string" && item.title.trim() !== "" ? item.title.trim() : "Untitled event";
        const startAt = typeof item.start_at === "string" ? item.start_at : null;
        const endAt = typeof item.end_at === "string" ? item.end_at : null;
        const htmlUrl =
          typeof item.html_url === "string" && item.html_url.trim() !== "" ? item.html_url.trim() : undefined;
        const description = typeof item.description === "string" ? item.description : undefined;

        events.push({
          id: eventId,
          title,
          startAt,
          endAt,
          htmlUrl,
          description
        });
      }

      return events;
    } catch {
      return [];
    }
  }

  async function api(path: string): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (apiToken && apiToken.trim() !== "") {
      headers.Authorization = `Bearer ${apiToken.trim()}`;
    }

    return requestJson(`${window.location.origin}${path}`, {
      withCredentials: true,
      headers
    });
  }
}

async function detectCanvasCourseInPage(
  apiToken: string | null
): Promise<{ courseId: string; courseCode: string; courseName: string }> {
  const match = window.location.pathname.match(/\/courses\/(\d+)/);
  if (!match) {
    throw new Error("Could not determine Canvas course ID from URL.");
  }

  const courseId = match[1];
  let detectedCourseCode = "";
  let detectedCourseName = "";

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function requestText(
    url: string,
    options?: {
      method?: "GET" | "POST" | "OPTIONS";
      headers?: Record<string, string>;
      body?: string;
      withCredentials?: boolean;
    }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options?.method ?? "GET", url, true);
      xhr.withCredentials = options?.withCredentials ?? false;

      const headers = options?.headers ?? {};
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value);
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
          return;
        }
        reject(new Error(`Request failed: ${xhr.status}`));
      };

      xhr.onerror = () => {
        reject(new Error("Network request failed."));
      };

      xhr.send(options?.body);
    });
  }

  async function requestJson(
    url: string,
    options?: {
      method?: "GET" | "POST" | "OPTIONS";
      headers?: Record<string, string>;
      body?: string;
      withCredentials?: boolean;
    }
  ): Promise<unknown> {
    const text = await requestText(url, options);
    if (!text.trim()) {
      return {};
    }
    return JSON.parse(text) as unknown;
  }

  async function api(path: string): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (apiToken && apiToken.trim() !== "") {
      headers.Authorization = `Bearer ${apiToken.trim()}`;
    }

    const text = await requestText(`${window.location.origin}${path}`, {
      withCredentials: true,
      headers
    });
    if (!text.trim()) {
      return {};
    }
    return JSON.parse(text);
  }

  try {
    const courseDetail = (await api(`/api/v1/courses/${courseId}`)) as Record<string, unknown> | null;
    if (isRecord(courseDetail)) {
      if (typeof courseDetail.course_code === "string" && courseDetail.course_code.trim()) {
        detectedCourseCode = courseDetail.course_code.trim();
      }
      if (typeof courseDetail.name === "string" && courseDetail.name.trim()) {
        detectedCourseName = courseDetail.name.trim();
      }
    }
  } catch {
    // API failure handled with DOM fallbacks
  }

  const COURSE_CODE_REGEX = /\b([A-Z]{2,5}[-\s]?\d{3,4}[A-Z]?)\b/i;

  function isDashboard(text: string): boolean {
    const n = text.trim().toLowerCase();
    return (
      n === "dashboard" ||
      n === "my dashboard" ||
      n.startsWith("dashboard") ||
      n.startsWith("my dashboard") ||
      n === "courses" ||
      n === "my courses"
    );
  }

  function cleanTitle(raw: string, code?: string): string {
    if (isDashboard(raw)) return "";
    let s = raw
      .trim()
      .replace(/\s*[-:|•]\s*Canvas(?:\s+LMS)?.*$/i, "")
      .replace(/\s*[-:|•]\s*(?:Course\s+)?Home$/i, "")
      .replace(/\s*[-:|•]\s*Modules$/i, "")
      .replace(/\s*[-:|•]\s*Syllabus$/i, "")
      .replace(/\s*[-:|•]\s*Assignments$/i, "")
      .trim();

    const c = code || s.match(COURSE_CODE_REGEX)?.[1];
    if (c) {
      const esc = c.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      s = s.replace(new RegExp(`^${esc}\\s*[-:]*\\s*`, "i"), "");
      s = s.replace(new RegExp(`\\s*[([]?\\s*${esc}\\s*[)\\]]?$`, "i"), "");
    }
    s = s.replace(/\s+/g, " ").trim();
    return isDashboard(s) ? "" : s;
  }

  const breadcrumbCourseEl = document.querySelector('#breadcrumbs a[href*="/courses/"]');
  const breadcrumbCourseText = breadcrumbCourseEl?.textContent?.trim() || "";

  const lastBreadcrumbSpan = document.querySelector('#breadcrumbs li:last-child span');
  const lastBreadcrumbText = lastBreadcrumbSpan?.textContent?.trim() || "";

  const courseTitleEl = document.querySelector('.course-title');
  const courseTitleText = courseTitleEl?.textContent?.trim() || "";

  const docTitle = document.title || document.querySelector("title")?.textContent?.trim() || "";

  const domCandidates = [
    breadcrumbCourseText,
    courseTitleText,
    lastBreadcrumbText,
    docTitle
  ].filter((t): t is string => Boolean(t && !isDashboard(t)));

  if (!detectedCourseCode) {
    for (const text of [detectedCourseName, ...domCandidates]) {
      const m = text.match(COURSE_CODE_REGEX);
      if (m) {
        detectedCourseCode = m[1].trim();
        break;
      }
    }
  }

  if (!detectedCourseName || isDashboard(detectedCourseName)) {
    for (const text of domCandidates) {
      const cleaned = cleanTitle(text, detectedCourseCode);
      if (cleaned) {
        detectedCourseName = cleaned;
        break;
      }
    }
  } else {
    detectedCourseName = cleanTitle(detectedCourseName, detectedCourseCode) || detectedCourseName;
  }

  return {
    courseId,
    courseCode: detectedCourseCode,
    courseName: detectedCourseName || `Course ${courseId}`
  };
}
