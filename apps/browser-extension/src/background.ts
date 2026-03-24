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

async function postToLocalBridge(envelope: CanvasSyncEnvelope, port: number): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}/canvas-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof json?.message === "string" ? json.message : `HTTP ${res.status}`;
    throw new Error(`Bridge rejected payload: ${message}`);
  }

  return json;
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

  const payload: CanvasCoursePayload = {
    courseId,
    courseName,
    fetchedAt: new Date().toISOString(),
    courseHomePageHtml: courseHomePageHtml || undefined,
    syllabusHtml: syllabusHtml || undefined,
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

      const fallbackHtml = document.querySelector(".user_content, .show-content")?.innerHTML || "";
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
    const type = String(typeValue || "").toLowerCase();
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
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Page HTML fetch failed: ${response.status}`);
    }

    const htmlDoc = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlDoc, "text/html");
    const content =
      doc.querySelector(".user_content")?.innerHTML ||
      doc.querySelector(".show-content")?.innerHTML ||
      doc.querySelector(".user_content.enhanced")?.innerHTML ||
      doc.querySelector(".ic-Layout-contentMain .user_content")?.innerHTML ||
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
      console.info("Canvas assignment rubric debug", {
        courseId: id,
        assignmentCount: assignments.length,
        assignmentsWithRubric: rubricCount
      });

      return assignments;
    } catch {
      return [];
    }
  }

  function parseRubricCriteria(item: any): CanvasAssignmentPayload["rubric"] {
    if (!Array.isArray(item?.rubric)) {
      return undefined;
    }

    const criteria = item.rubric
      .map((criterion: any) => {
        const ratings = Array.isArray(criterion?.ratings)
          ? criterion.ratings
              .map((rating: any) => {
                if (typeof rating?.points !== "number") {
                  return null;
                }

                return {
                  description: String(rating?.description || "Unnamed Rating"),
                  longDescription:
                    typeof rating?.long_description === "string" && rating.long_description.trim() !== ""
                      ? rating.long_description
                      : undefined,
                  points: Number(rating.points)
                };
              })
              .filter((rating: any): rating is NonNullable<typeof rating> => rating !== null)
          : [];

        if (typeof criterion?.points !== "number") {
          return null;
        }

        return {
          id: String(criterion?.id ?? "unknown"),
          description: String(criterion?.description || "Unnamed Criterion"),
          longDescription:
            typeof criterion?.long_description === "string" && criterion.long_description.trim() !== ""
              ? criterion.long_description
              : undefined,
          points: Number(criterion.points),
          ratings
        };
      })
      .filter((criterion: any): criterion is NonNullable<typeof criterion> => criterion !== null);

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

  async function api(path: string): Promise<any> {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (apiToken && apiToken.trim() !== "") {
      headers.Authorization = `Bearer ${apiToken.trim()}`;
    }

    const response = await fetch(`${window.location.origin}${path}`, {
      credentials: "include",
      headers
    });

    if (!response.ok) {
      throw new Error(`Canvas API error: ${response.status}`);
    }

    return response.json();
  }
}
