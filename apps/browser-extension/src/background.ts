import type {
  CanvasAssignmentPayload,
  CanvasCoursePayload,
  CanvasDiscussionPayload,
  CanvasEventPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasPagePayload,
  CanvasSyncEnvelope
} from "./types";

const DEFAULT_PORT = 27125;

interface SyncCanvasCourseMessage {
  type: "syncCanvasCourse";
  port?: number;
  apiToken?: string;
}

interface CourseModuleIndex {
  modules: CanvasModulePayload[];
  pagesBySlug: Map<string, string[]>;
  assignmentsById: Map<string, string[]>;
  discussionsById: Map<string, string[]>;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "syncCanvasCourse") {
    return;
  }

  const syncMessage = message as SyncCanvasCourseMessage;

  void (async () => {
    try {
      const envelope = await extractFromActiveCanvasTab(syncMessage.apiToken);
      const response = await postToLocalBridge(envelope, syncMessage.port ?? DEFAULT_PORT);
      sendResponse({ ok: true, response });
    } catch (error) {
      sendResponse({ ok: false, message: error instanceof Error ? error.message : "Sync failed." });
    }
  })();

  return true;
});

async function extractFromActiveCanvasTab(apiToken?: string): Promise<CanvasSyncEnvelope> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error("No active tab available.");
  }

  if (!isCanvasUrl(tab.url)) {
    throw new Error("Open a Canvas course tab first (URL should include /courses/{id}).");
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeCanvasFromPage,
    args: [apiToken ?? null]
  });

  if (!result) {
    throw new Error("Canvas data extraction returned no result.");
  }

  return result;
}

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

function requestBinary(url: string, withCredentials = true): Promise<{ data: ArrayBuffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.withCredentials = withCredentials;
    xhr.responseType = "arraybuffer";

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const contentType = xhr.getResponseHeader("Content-Type") ?? "application/octet-stream";
        resolve({ data: xhr.response as ArrayBuffer, contentType });
        return;
      }
      reject(new Error(`Binary request failed: ${xhr.status}`));
    };

    xhr.onerror = () => {
      reject(new Error("Binary network request failed."));
    };

    xhr.send();
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function inlineImages(html: string, origin: string): Promise<string> {
  if (!html) {
    return html;
  }

  const srcPattern = /<img\b([^>]*?)\ssrc=["']([^"']+)["']([^>]*?)>/gi;
  const matches: Array<{ full: string; before: string; src: string; after: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = srcPattern.exec(html)) !== null) {
    matches.push({ full: match[0], before: match[1], src: match[2], after: match[3] });
  }

  const replacements = await Promise.all(
    matches.map(async ({ full, before, src, after }) => {
      try {
        const absoluteSrc = src.startsWith("http") ? src : `${origin}${src.startsWith("/") ? "" : "/"}${src}`;
        // Only inline images hosted on the same Canvas origin
        if (!absoluteSrc.startsWith(origin)) {
          return { full, replacement: full };
        }
        const { data, contentType } = await requestBinary(absoluteSrc);
        const mimeType = contentType.split(";")[0].trim();
        if (!mimeType.startsWith("image/")) {
          return { full, replacement: full };
        }
        const dataUri = `data:${mimeType};base64,${arrayBufferToBase64(data)}`;
        return { full, replacement: `<img${before} src="${dataUri}"${after}>` };
      } catch {
        // Leave original src intact on failure
        return { full, replacement: full };
      }
    })
  );

  let result = html;
  for (const { full, replacement } of replacements) {
    if (full !== replacement) {
      result = result.replace(full, replacement);
    }
  }
  return result;
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

function isCanvasUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\/courses\/\d+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function scrapeCanvasFromPage(apiToken: string | null): Promise<CanvasSyncEnvelope> {
  const href = window.location.href;
  const match = window.location.pathname.match(/\/courses\/(\d+)/);
  if (!match) {
    throw new Error("Could not determine Canvas course ID from URL.");
  }

  const courseId = match[1];
  const courseName = document.querySelector(".course-title, #breadcrumbs span")?.textContent?.trim() || `Course ${courseId}`;
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
    courseName,
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
      const frontPage = await api(`/api/v1/courses/${id}/front_page`);
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
      const course = await api(`/api/v1/courses/${id}?include[]=syllabus_body`);
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
      if (!Array.isArray(list)) {
        throw new Error("Pages API returned a non-array payload.");
      }

      const result: CanvasPagePayload[] = [];
      for (const page of list) {
        if (!page?.url) {
          continue;
        }

        const slug = String(page.url);
        const moduleNames = memberships.get(slug);
        const retrieved = await getPageBySlug(id, slug, page.title || slug, page.updated_at, moduleNames);
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
      const detail = await api(`/api/v1/courses/${id}/pages/${encodeURIComponent(slug)}`);
      let html = typeof detail?.body === "string" ? detail.body : "";
      if (!html) {
        html = await fetchPageHtml(routeUrl);
      }

      if (!html) {
        return null;
      }

      return {
        title: detail?.title || fallbackTitle,
        html,
        url: routeUrl,
        slug,
        updatedAt: detail?.updated_at || fallbackUpdatedAt || undefined,
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
      if (!Array.isArray(apiModules)) {
        return { modules, pagesBySlug, assignmentsById, discussionsById };
      }

      for (let moduleIndex = 0; moduleIndex < apiModules.length; moduleIndex += 1) {
        const module = apiModules[moduleIndex];
        const moduleName =
          typeof module?.name === "string" && module.name.trim() !== "" ? module.name.trim() : "Uncategorized Module";

        const items: CanvasModuleItemPayload[] = [];
        if (Array.isArray(module?.items)) {
          for (let itemIndex = 0; itemIndex < module.items.length; itemIndex += 1) {
            const item = module.items[itemIndex];
            const normalizedType = normalizeModuleItemType(item?.type);
            const normalizedItem: CanvasModuleItemPayload = {
              id: String(item?.id ?? `${moduleIndex}-${itemIndex}`),
              position: Number.isFinite(item?.position) ? Number(item.position) : itemIndex + 1,
              title: String(item?.title || `Untitled Item ${itemIndex + 1}`),
              type: normalizedType,
              indent: Number.isFinite(item?.indent) ? Number(item.indent) : undefined
            };

            if (normalizedType === "WikiPage") {
              const slug =
                typeof item?.page_url === "string" && item.page_url.trim() !== "" ? item.page_url.trim() : undefined;
              if (slug) {
                normalizedItem.pageSlug = slug;
                addModuleMembership(pagesBySlug, slug, moduleName);
              }
            }

            if (normalizedType === "Assignment" && item?.content_id != null) {
              const assignmentId = String(item.content_id);
              normalizedItem.assignmentId = assignmentId;
              addModuleMembership(assignmentsById, assignmentId, moduleName);
            }

            if (normalizedType === "DiscussionTopic" && item?.content_id != null) {
              const discussionId = String(item.content_id);
              normalizedItem.discussionId = discussionId;
              addModuleMembership(discussionsById, discussionId, moduleName);
            }

            if (normalizedType === "ExternalUrl" || normalizedType === "ContextExternalTool") {
              if (typeof item?.external_url === "string" && item.external_url.trim() !== "") {
                normalizedItem.externalUrl = item.external_url;
              } else if (typeof item?.html_url === "string" && item.html_url.trim() !== "") {
                normalizedItem.externalUrl = item.html_url;
              } else if (typeof item?.url === "string" && item.url.trim() !== "") {
                normalizedItem.externalUrl = item.url;
              }
            }

            items.push(normalizedItem);
          }
        }

        modules.push({
          id: String(module?.id ?? moduleIndex + 1),
          name: moduleName,
          position: moduleIndex + 1,
          summaryHtml:
            typeof module?.description === "string" && module.description.trim() !== "" ? module.description : undefined,
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
      if (!Array.isArray(list)) {
        return [];
      }

      const assignments = list.map((item) => ({
        id: String(item.id),
        name: String(item.name || "Untitled assignment"),
        dueAt: item.due_at || null,
        pointsPossible: typeof item.points_possible === "number" ? item.points_possible : null,
        htmlUrl: item.html_url || undefined,
        descriptionHtml: typeof item.description === "string" ? item.description : undefined,
        submissionTypes: Array.isArray(item.submission_types) ? item.submission_types : undefined,
        moduleNames: memberships.get(String(item.id)),
        rubric: parseRubricCriteria(item)
      }));

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
      .map((criterion): CanvasAssignmentPayload["rubric"][number] | null => {
        if (!isRecord(criterion)) {
          return null;
        }

        const ratings = Array.isArray(criterion.ratings)
          ? criterion.ratings
              .map((rating): CanvasAssignmentPayload["rubric"][number]["ratings"][number] | null => {
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
      if (!Array.isArray(list)) {
        return [];
      }

      return list.map((item) => ({
        id: String(item.id),
        title: String(item.title || "Untitled discussion"),
        htmlUrl: item.html_url || undefined,
        messageHtml: typeof item.message === "string" ? item.message : undefined,
        postedAt: item.posted_at || null,
        updatedAt: item.updated_at || null,
        moduleNames: memberships.get(String(item.id))
      }));
    } catch {
      return [];
    }
  }

  async function getEvents(id: string): Promise<CanvasEventPayload[]> {
    try {
      const list = await api(`/api/v1/calendar_events?context_codes[]=course_${id}&per_page=100`);
      if (!Array.isArray(list)) {
        return [];
      }

      return list.map((item) => ({
        id: String(item.id),
        title: String(item.title || "Untitled event"),
        startAt: item.start_at || null,
        endAt: item.end_at || null,
        htmlUrl: item.html_url || undefined,
        description: typeof item.description === "string" ? item.description : undefined
      }));
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
