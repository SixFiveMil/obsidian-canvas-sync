import type {
  CanvasAssignmentPayload,
  CanvasCoursePayload,
  CanvasDiscussionPayload,
  CanvasEventPayload,
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
      const envelope = await extractFromActiveCanvasTab(
        syncMessage.apiToken,
        syncMessage.courseName,
        syncMessage.courseCode,
        syncMessage.tabId
      );
      const response = await postToLocalBridge(envelope, syncMessage.port ?? DEFAULT_PORT);
      sendResponse({ ok: true, response });
    } catch (error) {
      sendResponse({ ok: false, message: error instanceof Error ? error.message : "Sync failed." });
    }
  })();

  return true;
});

async function detectCourseFromActiveTab(
  apiToken?: string,
  targetTabId?: number
): Promise<{ courseId: string; courseCode: string; courseName: string }> {
  let tabId = targetTabId;
  let tabUrl: string | undefined;

  if (typeof tabId === "number") {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    tabUrl = tab?.url;
  }

  if (!tabId || !tabUrl) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    tabUrl = tab?.url;
  }

  if (!tabId) {
    throw new Error("No active tab available.");
  }

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
  let tabId = targetTabId;
  let tabUrl: string | undefined;

  if (typeof tabId === "number") {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    tabUrl = tab?.url;
  }

  if (!tabId || !tabUrl) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    tabUrl = tab?.url;
  }

  if (!tabId) {
    throw new Error("No active tab available.");
  }

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
    throw new Error("Canvas data extraction returned no result. Firefox may be blocking script execution on this Canvas page.");
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
    throw new Error("Firefox did not return a valid script result from the active Canvas tab.");
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
      const message = error instanceof Error ? error.message : "Unknown Firefox scripting error.";
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
      const message = error instanceof Error ? error.message : "Unknown Firefox tabs.executeScript error.";
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
      `Your course has too many or too large images. Try enabling the Obsidian plugin's ` +
      `"Reduce image payload" option or reduce the number of synced modules.`
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
      throw new Error(`Firefox blocked access to ${parsed.origin}. Please allow access to this Canvas site and reload the page.`);
    }
  } catch {
    // Ignore permission issues for non-standard URLs; the earlier URL check already validates the canonical course route.
  }
}

function isCanvasUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\/courses\/\d+/.test(parsed.pathname);
  } catch {
    return false;
  }
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

  async function inlineImages(html: string, origin: string): Promise<string> {
    return html;
  }

  let detectedCourseCode = "";
  let detectedCourseName = "";

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function isUnknownArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
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

  // 2. Query DOM:
  // - '#breadcrumbs a[href*="/courses/"]'
  // - '#breadcrumbs li:last-child span'
  // - '.course-title'
  // - document '<title>'
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

  const [courseHomePageHtml, syllabusHtml, pages, assignments, discussions, events] = await Promise.all([
    getCourseHomePage(courseId),
    getSyllabus(courseId),
    getPages(courseId, moduleIndex.pagesBySlug),
    getAssignments(courseId, moduleIndex.assignmentsById),
    getDiscussions(courseId, moduleIndex.discussionsById),
    getEvents(courseId)
  ]);

  const origin = window.location.origin;

  const [inlinedHomeHtml, inlinedSyllabusHtml] = await Promise.all([
    courseHomePageHtml ? inlineImages(courseHomePageHtml, origin) : Promise.resolve(courseHomePageHtml),
    syllabusHtml ? inlineImages(syllabusHtml, origin) : Promise.resolve(syllabusHtml)
  ]);

  await Promise.all(
    pages.map(async (page) => {
      page.html = await inlineImages(page.html, origin);
    })
  );

  await Promise.all(
    assignments.map(async (assignment) => {
      if (assignment.descriptionHtml) {
        assignment.descriptionHtml = await inlineImages(assignment.descriptionHtml, origin);
      }
    })
  );

  await Promise.all(
    discussions.map(async (discussion) => {
      if (discussion.messageHtml) {
        discussion.messageHtml = await inlineImages(discussion.messageHtml, origin);
      }
    })
  );

  const payload: CanvasCoursePayload = {
    courseId,
    courseCode: finalCourseCode,
    courseName: finalCourseName,
    fetchedAt: new Date().toISOString(),
    courseHomePageHtml: inlinedHomeHtml || undefined,
    syllabusHtml: inlinedSyllabusHtml || undefined,
    modules: moduleIndex.modules,
    pages,
    assignments,
    discussions,
    events
  };

  return {
    source: "canvas-browser-extension",
    version: "1",
    payload
  };

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

      if (!html) {
        return null;
      }

      return {
        title: typeof detail?.title === "string" && detail.title.trim() !== "" ? detail.title : fallbackTitle,
        html,
        url: routeUrl,
        slug,
        updatedAt: typeof detail?.updated_at === "string" ? detail.updated_at : fallbackUpdatedAt || undefined,
        moduleNames: moduleNames && moduleNames.length > 0 ? moduleNames : undefined
      };
    } catch (error) {
      try {
        const html = await fetchPageHtml(routeUrl);
        if (!html) {
          throw new Error("No content matched known Canvas content selectors.");
        }

        return {
          title: fallbackTitle,
          html,
          url: routeUrl,
          slug,
          updatedAt: fallbackUpdatedAt || undefined,
          moduleNames: moduleNames && moduleNames.length > 0 ? moduleNames : undefined
        };
      } catch (routeError) {
        console.warn("Canvas page detail fetch failed", {
          courseId: id,
          pageUrl: slug,
          apiError: error instanceof Error ? error.message : String(error),
          routeError: routeError instanceof Error ? routeError.message : String(routeError)
        });
        return null;
      }
    }
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
    const modules: CanvasModulePayload[] = [];

    try {
      const apiModules = await api(`/api/v1/courses/${id}/modules?include[]=items&per_page=100`);
      if (!isUnknownArray(apiModules)) {
        return { modules, pagesBySlug, assignmentsById, discussionsById };
      }

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

      return { modules, pagesBySlug, assignmentsById, discussionsById };
    } catch (error) {
      console.warn("Module membership map fetch failed", {
        courseId: id,
        error: error instanceof Error ? error.message : String(error)
      });
      return { modules, pagesBySlug, assignmentsById, discussionsById };
    }
  }

  function normalizeModuleItemType(typeValue: unknown): CanvasModuleItemPayload["type"] {
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

  function addModuleMembership(map: Map<string, string[]>, key: string, moduleName: string): void {
    const existing = map.get(key) ?? [];
    if (!existing.includes(moduleName)) {
      existing.push(moduleName);
      map.set(key, existing);
    }
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
      if (!isUnknownArray(list)) {
        return [];
      }

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

      const rubricCount = assignments.filter((assignment) => (assignment.rubric?.length ?? 0) > 0).length;
      console.debug("Canvas assignment rubric debug", {
        courseId: id,
        assignmentCount: assignments.length,
        assignmentsWithRubric: rubricCount
      });

      return assignments;
    } catch {
      return [];
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

  async function getDiscussions(id: string, memberships: Map<string, string[]>): Promise<CanvasDiscussionPayload[]> {
    try {
      const list = await api(`/api/v1/courses/${id}/discussion_topics?per_page=100`);
      if (!isUnknownArray(list)) {
        return [];
      }

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
    } catch {
      return [];
    }
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

