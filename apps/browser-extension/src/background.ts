import type {
  BrowserSyncOptions,
  CanvasAssignmentPayload,
  CanvasCourseGrades,
  CanvasCoursePayload,
  CanvasDiscussionEntryPayload,
  CanvasDiscussionPayload,
  CanvasEventPayload,
  CanvasFileAssetPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasPagePayload,
  CanvasRubricCriterionPayload,
  CanvasRubricRatingPayload,
  CanvasSubmissionAttachment,
  CanvasSubmissionComment,
  CanvasSubmissionPayload,
  CanvasSyncEnvelope
} from "./types";
import { DEFAULT_BROWSER_OPTIONS } from "./types";
import {
  cleanCourseName,
  extractCourseCode,
  isCanvasUrl,
  normalizeModuleItemType,
  parseCourseInfo,
  parseRubricCriteria
} from "./sync-utils";

declare const browser: {
  tabs?: {
    executeScript?: (tabId: number, details: { code?: string; allFrames?: boolean }) => Promise<unknown[]>;
  };
  scripting?: {
    executeScript?: (options: {
      target: { tabId: number };
      func: (...args: unknown[]) => unknown;
      args?: unknown[];
    }) => Promise<Array<{ result?: unknown }>>;
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
  courseCode?: string;
  courseName?: string;
  options?: BrowserSyncOptions;
  tabId?: number;
}

interface DetectCourseInfoMessage {
  type: "detectCourseInfo";
  tabId?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

chrome.runtime.onMessage.addListener((rawMessage: unknown, _sender, sendResponse) => {
  if (!isRecord(rawMessage)) {
    return;
  }

  if (rawMessage.type === "detectCourseInfo") {
    const detectMessage = rawMessage as unknown as DetectCourseInfoMessage;
    void (async () => {
      try {
        const info = await detectCourseFromActiveTab(detectMessage.tabId);
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
        syncMessage.options || DEFAULT_BROWSER_OPTIONS,
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

  const result = await executeScriptInTab(tabId, detectCanvasCourseInPage, []);

  if (!result) {
    throw new Error(
      "Canvas course detection returned no result. The page may be blocked from script execution or may not be a valid Canvas course page."
    );
  }

  return result;
}

async function extractFromActiveCanvasTab(
  options: BrowserSyncOptions,
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

  const payload = await executeScriptInTab(tabId, extractCoursePayloadInPage, [
    options,
    customCourseName || null,
    customCourseCode || null
  ]);

  if (!payload || !payload.courseId || !payload.courseName) {
    throw new Error("Failed to extract course data from active Canvas tab.");
  }

  return {
    source: "canvas-browser-extension",
    version: "1",
    payload
  };
}

async function postToLocalBridge(envelope: CanvasSyncEnvelope, port: number): Promise<unknown> {
  const url = `http://127.0.0.1:${port}/canvas-sync`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Canvas-Sync-Client": "canvas-browser-extension"
    },
    body: JSON.stringify(envelope)
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Obsidian bridge returned status ${res.status}: ${errorText || res.statusText}`);
  }

  return res.json().catch(() => ({ ok: true }));
}

async function ensureCanvasOriginPermission(tabUrl: string): Promise<void> {
  let originPattern: string;
  try {
    const parsed = new URL(tabUrl);
    originPattern = `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return;
  }

  const browserPermissions = typeof browser !== "undefined" ? browser?.permissions : undefined;
  const permissionsApi = chrome.permissions ?? browserPermissions;

  if (!permissionsApi) {
    return;
  }

  try {
    const hasPermission = await permissionsApi.contains?.({ origins: [originPattern] }).catch(() => false);
    if (hasPermission) {
      return;
    }

    await permissionsApi.request?.({ origins: [originPattern] }).catch(() => false);
  } catch {
    // Best-effort permission request
  }
}

async function probeCanvasScriptExecution(tabId: number): Promise<void> {
  try {
    const ping = await executeScriptInTab(tabId, () => 1, []);
    if (ping !== 1) {
      throw new Error("Probe check returned unexpected value.");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot execute scripts on this tab: ${msg}`);
  }
}

async function executeScriptInTab<Args extends unknown[], ReturnType>(
  tabId: number,
  func: (...args: Args) => ReturnType | Promise<ReturnType>,
  args: Args
): Promise<ReturnType> {
  const isFirefox = typeof browser !== "undefined" && Boolean(browser?.tabs?.executeScript);

  if (chrome.scripting?.executeScript) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args
      });
      return results?.[0]?.result as ReturnType;
    } catch (chromeError) {
      if (!isFirefox || !browser?.tabs?.executeScript) {
        throw chromeError;
      }
    }
  }

  if (isFirefox && browser?.tabs?.executeScript) {
    const serializedArgs = JSON.stringify(args);
    const code = `(${func.toString()})(...${serializedArgs})`;
    const results = await browser.tabs.executeScript(tabId, { code });
    return results?.[0] as ReturnType;
  }

  throw new Error("No compatible script execution API available.");
}

// ---------------------------------------------------------------------------
// In-Page Content Extraction Routines (Run directly in Canvas DOM context)
// ---------------------------------------------------------------------------

function detectCanvasCourseInPage(): { courseId: string; courseCode: string; courseName: string } {
  const match = window.location.pathname.match(/\/courses\/(\d+)/);
  if (!match) {
    throw new Error("Could not determine Canvas course ID from active URL.");
  }
  const courseId = match[1];

  let detectedCourseCode = "";
  let detectedCourseName = "";

  const breadcrumbCourseEl = document.querySelector('#breadcrumbs a[href*="/courses/"]');
  const breadcrumbText = breadcrumbCourseEl?.textContent?.trim() || "";

  const courseTitleEl = document.querySelector(".course-title");
  const courseTitleText = courseTitleEl?.textContent?.trim() || "";

  const docTitle = document.title || "";

  const COURSE_CODE_REGEX = /\b([A-Z]{2,5}[-\s]?\d{3,4}[A-Z]?)\b/i;

  for (const text of [breadcrumbText, courseTitleText, docTitle]) {
    const m = text.match(COURSE_CODE_REGEX);
    if (m) {
      detectedCourseCode = m[1].trim();
      break;
    }
  }

  function cleanTitle(raw: string, code?: string): string {
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
    return s.replace(/\s+/g, " ").trim();
  }

  for (const text of [breadcrumbText, courseTitleText, docTitle]) {
    const cleaned = cleanTitle(text, detectedCourseCode);
    if (cleaned && !cleaned.toLowerCase().startsWith("dashboard")) {
      detectedCourseName = cleaned;
      break;
    }
  }

  return {
    courseId,
    courseCode: detectedCourseCode,
    courseName: detectedCourseName || `Course ${courseId}`
  };
}

async function extractCoursePayloadInPage(
  options: BrowserSyncOptions,
  customCourseName: string | null,
  customCourseCode: string | null
): Promise<CanvasCoursePayload> {
  const match = window.location.pathname.match(/\/courses\/(\d+)/);
  if (!match) {
    throw new Error("Could not determine Canvas course ID from active URL.");
  }
  const courseId = match[1];

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function isUnknownArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  function requestJson(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader("Accept", "application/json");

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({});
          }
        } else {
          reject(new Error(`HTTP ${xhr.status} for ${url}`));
        }
      };

      xhr.onerror = () => reject(new Error(`Network request failed for ${url}`));
      xhr.send();
    });
  }

  async function api(path: string): Promise<unknown> {
    return requestJson(`${window.location.origin}${path}`);
  }

  // 1. Fetch Course details & Syllabus
  let fetchedCourseCode = customCourseCode || "";
  let fetchedCourseName = customCourseName || "";
  let syllabusHtml: string | undefined;

  try {
    const courseDetail = (await api(
      `/api/v1/courses/${courseId}?include[]=syllabus_body&include[]=term&include[]=total_scores`
    )) as Record<string, unknown> | null;

    if (isRecord(courseDetail)) {
      if (!fetchedCourseCode && typeof courseDetail.course_code === "string" && courseDetail.course_code.trim()) {
        fetchedCourseCode = courseDetail.course_code.trim();
      }
      if (!fetchedCourseName && typeof courseDetail.name === "string" && courseDetail.name.trim()) {
        fetchedCourseName = courseDetail.name.trim();
      }
      if (typeof courseDetail.syllabus_body === "string" && courseDetail.syllabus_body.trim()) {
        syllabusHtml = courseDetail.syllabus_body.trim();
      }
    }
  } catch {
    // API failure fallback
  }

  if (!fetchedCourseName) {
    const detected = detectCanvasCourseInPage();
    fetchedCourseName = detected.courseName;
    if (!fetchedCourseCode) {
      fetchedCourseCode = detected.courseCode;
    }
  }

  // 2. Front page / Course Home HTML
  let courseHomePageHtml: string | undefined;
  try {
    const frontPage = (await api(`/api/v1/courses/${courseId}/front_page`)) as Record<string, unknown> | null;
    if (isRecord(frontPage) && typeof frontPage.body === "string" && frontPage.body.trim()) {
      courseHomePageHtml = frontPage.body.trim();
    }
  } catch {
    // Front page not configured
  }

  // 3. User Grades
  let grades: CanvasCourseGrades | undefined;
  if (options.extractGrades) {
    try {
      const enrollments = (await api(`/api/v1/courses/${courseId}/enrollments?user_id=self`)) as unknown[];
      if (isUnknownArray(enrollments) && enrollments.length > 0 && isRecord(enrollments[0])) {
        const rawGrades = enrollments[0].grades as Record<string, unknown> | undefined;
        if (isRecord(rawGrades)) {
          grades = {
            currentScore: typeof rawGrades.current_score === "number" ? rawGrades.current_score : null,
            currentGrade: typeof rawGrades.current_grade === "string" ? rawGrades.current_grade : null,
            finalScore: typeof rawGrades.final_score === "number" ? rawGrades.final_score : null,
            finalGrade: typeof rawGrades.final_grade === "string" ? rawGrades.final_grade : null
          };
        }
      }
    } catch {
      // Grades not accessible
    }
  }

  const pagesBySlug = new Map<string, string[]>();
  const assignmentsById = new Map<string, string[]>();
  const discussionsById = new Map<string, string[]>();
  const filesById = new Map<string, string[]>();

  function addMembership(map: Map<string, string[]>, key: string, name: string): void {
    const existing = map.get(key) ?? [];
    if (!existing.includes(name)) {
      existing.push(name);
      map.set(key, existing);
    }
  }

  // 4. Modules & Items
  const modules: CanvasModulePayload[] = [];
  if (options.extractModules) {
    try {
      const rawModules = (await api(
        `/api/v1/courses/${courseId}/modules?include[]=items&include[]=content_details&per_page=100`
      )) as unknown[];

      if (isUnknownArray(rawModules)) {
        for (let mIdx = 0; mIdx < rawModules.length; mIdx++) {
          const mod = rawModules[mIdx];
          if (!isRecord(mod)) continue;

          const mName =
            typeof mod.name === "string" && mod.name.trim() ? mod.name.trim() : `Module ${mIdx + 1}`;
          const mPosition = typeof mod.position === "number" ? mod.position : mIdx + 1;
          const items: CanvasModuleItemPayload[] = [];

          if (isUnknownArray(mod.items)) {
            for (let iIdx = 0; iIdx < mod.items.length; iIdx++) {
              const it = mod.items[iIdx];
              if (!isRecord(it)) continue;

              const title =
                typeof it.title === "string" && it.title.trim() ? it.title.trim() : `Item ${iIdx + 1}`;
              const rawType = String(it.type ?? "").toLowerCase();
              let normalizedType: CanvasModuleItemPayload["type"] = "ContextExternalTool";

              if (rawType === "page" || rawType === "wikipage") normalizedType = "WikiPage";
              else if (rawType === "assignment") normalizedType = "Assignment";
              else if (rawType === "discussion" || rawType === "discussiontopic") normalizedType = "DiscussionTopic";
              else if (rawType === "file" || rawType === "attachment") normalizedType = "File";
              else if (rawType === "externalurl") normalizedType = "ExternalUrl";
              else if (rawType === "subheader" || rawType === "contextmodulesubheader")
                normalizedType = "ContextModuleSubHeader";

              const modItem: CanvasModuleItemPayload = {
                id: it.id != null ? String(it.id) : `item-${mIdx}-${iIdx}`,
                position: typeof it.position === "number" ? it.position : iIdx + 1,
                title,
                type: normalizedType,
                indent: typeof it.indent === "number" ? it.indent : undefined
              };

              if (normalizedType === "WikiPage") {
                const slug =
                  typeof it.page_url === "string" && it.page_url.trim() ? it.page_url.trim() : undefined;
                if (slug) {
                  modItem.pageSlug = slug;
                  addMembership(pagesBySlug, slug, mName);
                }
              } else if (normalizedType === "Assignment" && it.content_id != null) {
                const aId = String(it.content_id);
                modItem.assignmentId = aId;
                addMembership(assignmentsById, aId, mName);
              } else if (normalizedType === "DiscussionTopic" && it.content_id != null) {
                const dId = String(it.content_id);
                modItem.discussionId = dId;
                addMembership(discussionsById, dId, mName);
              } else if (normalizedType === "File" && it.content_id != null) {
                const fId = String(it.content_id);
                modItem.fileId = fId;
                addMembership(filesById, fId, mName);
              } else if (normalizedType === "ExternalUrl" && typeof it.external_url === "string") {
                modItem.externalUrl = it.external_url;
              }

              items.push(modItem);
            }
          }

          modules.push({
            id: mod.id != null ? String(mod.id) : `module-${mIdx}`,
            name: mName,
            position: mPosition,
            items
          });
        }
      }
    } catch {
      // Modules API failed
    }
  }

  // 5. Wiki Pages
  const pages: CanvasPagePayload[] = [];
  const fetchedSlugs = new Set<string>();
  if (options.extractPages) {
    try {
      const pageList = (await api(`/api/v1/courses/${courseId}/pages?per_page=100`)) as unknown[];
      if (isUnknownArray(pageList)) {
        for (const p of pageList) {
          if (!isRecord(p) || typeof p.url !== "string") continue;
          const slug = p.url;
          const title =
            typeof p.title === "string" && p.title.trim() ? p.title.trim() : slug;
          const updatedAt = typeof p.updated_at === "string" ? p.updated_at : undefined;

          let html = "";
          try {
            const pageDetail = (await api(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(slug)}`)) as Record<
              string,
              unknown
            >;
            if (isRecord(pageDetail) && typeof pageDetail.body === "string") {
              html = pageDetail.body;
            }
          } catch {
            // Page body fetch error
          }

          pages.push({
            title,
            html,
            url: `${window.location.origin}/courses/${courseId}/pages/${encodeURIComponent(slug)}`,
            slug,
            updatedAt,
            moduleNames: pagesBySlug.get(slug)
          });
          fetchedSlugs.add(slug.toLowerCase());
        }
      }
    } catch {
      // Pages API error
    }

    // Fallback: Fetch any module-discovered pages that were not in pageList (e.g. if Pages tab is hidden)
    for (const [slug, moduleNames] of pagesBySlug.entries()) {
      if (fetchedSlugs.has(slug.toLowerCase())) continue;
      try {
        const pageDetail = (await api(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(slug)}`)) as Record<
          string,
          unknown
        >;
        const html = typeof pageDetail?.body === "string" ? pageDetail.body : "";
        if (html) {
          const rawTitle =
            typeof pageDetail?.title === "string" && pageDetail.title.trim() ? pageDetail.title.trim() : slug;
          pages.push({
            title: rawTitle,
            html,
            url: `${window.location.origin}/courses/${courseId}/pages/${encodeURIComponent(slug)}`,
            slug,
            updatedAt: typeof pageDetail?.updated_at === "string" ? pageDetail.updated_at : undefined,
            moduleNames
          });
          fetchedSlugs.add(slug.toLowerCase());
        }
      } catch {
        // Page fetch error
      }
    }
  }

  // 6. Assignments, Rubrics & Submissions
  const assignments: CanvasAssignmentPayload[] = [];
  if (options.extractAssignments) {
    try {
      const rawAssignments = (await api(
        `/api/v1/courses/${courseId}/assignments?include[]=rubric_assessment&include[]=submission&per_page=100`
      )) as unknown[];

      if (isUnknownArray(rawAssignments)) {
        for (const a of rawAssignments) {
          if (!isRecord(a) || a.id == null) continue;
          const aId = String(a.id);
          const name = typeof a.name === "string" && a.name.trim() ? a.name.trim() : `Assignment ${aId}`;
          const dueAt = typeof a.due_at === "string" ? a.due_at : null;
          const pointsPossible = typeof a.points_possible === "number" ? a.points_possible : null;
          const htmlUrl =
            typeof a.html_url === "string" && a.html_url.trim() ? a.html_url.trim() : undefined;
          const descriptionHtml = typeof a.description === "string" ? a.description : undefined;
          const submissionTypes = Array.isArray(a.submission_types)
            ? (a.submission_types as string[])
            : undefined;

          // Rubrics
          let rubric: CanvasRubricCriterionPayload[] | undefined;
          if (Array.isArray(a.rubric)) {
            rubric = [];
            for (const r of a.rubric) {
              if (!isRecord(r) || typeof r.points !== "number") continue;
              const ratings: CanvasRubricRatingPayload[] = [];
              if (Array.isArray(r.ratings)) {
                for (const rat of r.ratings) {
                  if (isRecord(rat) && typeof rat.points === "number") {
                    ratings.push({
                      description: String(rat.description ?? "Rating"),
                      longDescription: typeof rat.long_description === "string" ? rat.long_description : undefined,
                      points: rat.points
                    });
                  }
                }
              }
              rubric.push({
                id: String(r.id ?? "criterion"),
                description: String(r.description ?? "Criterion"),
                longDescription: typeof r.long_description === "string" ? r.long_description : undefined,
                points: r.points,
                ratings
              });
            }
          }

          // Submission data
          let submission: CanvasSubmissionPayload | undefined;
          if (isRecord(a.submission)) {
            const s = a.submission;
            const comments: CanvasSubmissionComment[] = [];
            if (Array.isArray(s.submission_comments)) {
              for (const c of s.submission_comments) {
                if (isRecord(c) && typeof c.comment === "string") {
                  comments.push({
                    authorName: typeof c.author_name === "string" ? c.author_name : "Instructor",
                    comment: c.comment,
                    createdAt: typeof c.created_at === "string" ? c.created_at : new Date().toISOString()
                  });
                }
              }
            }

            const attachments: CanvasSubmissionAttachment[] = [];
            if (Array.isArray(s.attachments)) {
              for (const att of s.attachments) {
                if (isRecord(att) && typeof att.url === "string") {
                  attachments.push({
                    id: String(att.id ?? "att"),
                    displayName: typeof att.display_name === "string" ? att.display_name : "attachment",
                    url: att.url,
                    size: typeof att.size === "number" ? att.size : undefined,
                    contentType: typeof att["content-type"] === "string" ? (att["content-type"] as string) : undefined
                  });
                }
              }
            }

            submission = {
              id: s.id != null ? String(s.id) : undefined,
              submittedAt: typeof s.submitted_at === "string" ? s.submitted_at : null,
              workflowState: typeof s.workflow_state === "string" ? s.workflow_state : undefined,
              score: typeof s.score === "number" ? s.score : null,
              grade: typeof s.grade === "string" ? s.grade : null,
              body: typeof s.body === "string" ? s.body : null,
              url: typeof s.url === "string" ? s.url : null,
              late: Boolean(s.late),
              missing: Boolean(s.missing),
              excused: Boolean(s.excused),
              comments: comments.length > 0 ? comments : undefined,
              attachments: attachments.length > 0 ? attachments : undefined
            };
          }

          assignments.push({
            id: aId,
            name,
            dueAt,
            pointsPossible,
            htmlUrl,
            descriptionHtml,
            submissionTypes,
            moduleNames: assignmentsById.get(aId),
            rubric: rubric && rubric.length > 0 ? rubric : undefined,
            submission
          });
        }
      }
    } catch {
      // Assignments API error
    }
  }

  // 7. Discussions & Replies
  const discussions: CanvasDiscussionPayload[] = [];
  if (options.extractDiscussions) {
    try {
      const rawDiscussions = (await api(`/api/v1/courses/${courseId}/discussion_topics?per_page=100`)) as unknown[];
      if (isUnknownArray(rawDiscussions)) {
        for (const d of rawDiscussions) {
          if (!isRecord(d) || d.id == null) continue;
          const dId = String(d.id);
          const title = typeof d.title === "string" && d.title.trim() ? d.title.trim() : `Discussion ${dId}`;
          const htmlUrl = typeof d.html_url === "string" ? d.html_url : undefined;
          const messageHtml = typeof d.message === "string" ? d.message : undefined;
          const postedAt = typeof d.posted_at === "string" ? d.posted_at : null;
          const updatedAt = typeof d.updated_at === "string" ? d.updated_at : null;

          // Discussion Replies
          const entries: CanvasDiscussionEntryPayload[] = [];
          if (options.includeDiscussionReplies) {
            try {
              const viewData = (await api(
                `/api/v1/courses/${courseId}/discussion_topics/${dId}/view`
              )) as Record<string, unknown>;

              if (isRecord(viewData) && Array.isArray(viewData.view)) {
                const participants = new Map<string, string>();
                if (Array.isArray(viewData.participants)) {
                  for (const p of viewData.participants) {
                    if (isRecord(p) && p.id != null && typeof p.display_name === "string") {
                      participants.set(String(p.id), p.display_name);
                    }
                  }
                }

                function parseReplies(rawList: unknown[]): CanvasDiscussionEntryPayload[] {
                  const res: CanvasDiscussionEntryPayload[] = [];
                  for (const r of rawList) {
                    if (!isRecord(r) || r.id == null) continue;
                    const uId = r.user_id != null ? String(r.user_id) : undefined;
                    const uName = (uId ? participants.get(uId) : null) || (typeof r.user_name === "string" ? r.user_name : "Anonymous");
                    const msg = typeof r.message === "string" ? r.message : "";
                    const created = typeof r.created_at === "string" ? r.created_at : new Date().toISOString();
                    const updated = typeof r.updated_at === "string" ? r.updated_at : undefined;

                    const childReplies = Array.isArray(r.replies) ? parseReplies(r.replies) : undefined;

                    res.push({
                      id: String(r.id),
                      userId: uId,
                      userName: uName,
                      messageHtml: msg,
                      createdAt: created,
                      updatedAt: updated,
                      replies: childReplies && childReplies.length > 0 ? childReplies : undefined
                    });
                  }
                  return res;
                }

                entries.push(...parseReplies(viewData.view));
              }
            } catch {
              // Replies fetch failed
            }
          }

          discussions.push({
            id: dId,
            title,
            htmlUrl,
            messageHtml,
            postedAt,
            updatedAt,
            moduleNames: discussionsById.get(dId),
            entries: entries.length > 0 ? entries : undefined
          });
        }
      }
    } catch {
      // Discussions API error
    }
  }

  // 8. Calendar Events
  const events: CanvasEventPayload[] = [];
  const seenEventKeys = new Set<string>();
  if (options.extractEvents) {
    try {
      const rawEvents = (await api(
        `/api/v1/calendar_events?context_codes[]=course_${courseId}&all_events=true&per_page=100`
      )) as unknown[];

      if (isUnknownArray(rawEvents)) {
        for (const ev of rawEvents) {
          if (!isRecord(ev) || ev.id == null) continue;
          const eId = String(ev.id);
          const title = typeof ev.title === "string" && ev.title.trim() ? ev.title.trim() : `Event ${eId}`;
          const startAt = typeof ev.start_at === "string" ? ev.start_at : null;
          const endAt = typeof ev.end_at === "string" ? ev.end_at : null;
          const htmlUrl = typeof ev.html_url === "string" ? ev.html_url : undefined;
          const description = typeof ev.description === "string" ? ev.description : undefined;
          const assignmentId = ev.assignment_id != null ? String(ev.assignment_id) : undefined;
          const eventType = assignmentId ? "assignment" : "event";

          const key = assignmentId ? `assign-${assignmentId}` : `event-${eId}-${startAt ?? ""}`;
          seenEventKeys.add(key);

          events.push({
            id: eId,
            title,
            startAt,
            endAt,
            htmlUrl,
            description,
            eventType,
            assignmentId
          });
        }
      }
    } catch {
      // Events API error
    }

    // Auto-synthesize milestone events for assignments with due dates if not already present
    if (Array.isArray(assignments)) {
      for (const assignment of assignments) {
        if (!assignment.dueAt) continue;
        const key = `assign-${assignment.id}`;
        if (!seenEventKeys.has(key)) {
          seenEventKeys.add(key);
          events.push({
            id: `assignment-${assignment.id}`,
            title: `Due: ${assignment.name}`,
            startAt: assignment.dueAt,
            endAt: assignment.dueAt,
            htmlUrl: assignment.htmlUrl,
            description: `Assignment due date for ${assignment.name} (${assignment.pointsPossible ?? "?"} points)`,
            eventType: "assignment",
            assignmentId: assignment.id
          });
        }
      }
    }
  }

  // 9. Course Files & Document Assets Metadata
  const files: CanvasFileAssetPayload[] = [];
  if (options.extractFiles) {
    try {
      const rawFiles = (await api(`/api/v1/courses/${courseId}/files?per_page=100`)) as unknown[];
      if (isUnknownArray(rawFiles)) {
        for (const f of rawFiles) {
          if (!isRecord(f) || f.id == null) continue;
          const fId = String(f.id);
          const displayName =
            typeof f.display_name === "string" && f.display_name.trim()
              ? f.display_name.trim()
              : typeof f.filename === "string"
                ? f.filename
                : `file_${fId}`;
          const url =
            typeof f.url === "string" && f.url.trim()
              ? f.url.trim()
              : `${window.location.origin}/courses/${courseId}/files/${fId}/download`;
          const size = typeof f.size === "number" ? f.size : undefined;
          const contentType = typeof f["content-type"] === "string" ? (f["content-type"] as string) : undefined;

          files.push({
            id: fId,
            displayName,
            url,
            size,
            contentType,
            moduleNames: filesById.get(fId)
          });
        }
      }
    } catch {
      // Files API error
    }
  }

  return {
    courseId,
    courseName: fetchedCourseName,
    courseCode: fetchedCourseCode,
    fetchedAt: new Date().toISOString(),
    grades,
    courseHomePageHtml,
    syllabusHtml,
    modules,
    pages,
    assignments,
    discussions,
    events,
    files: files.length > 0 ? files : undefined
  };
}
