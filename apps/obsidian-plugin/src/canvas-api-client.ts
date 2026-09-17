import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian";
import type {
  CanvasAssignmentPayload,
  CanvasCoursePayload,
  CanvasCourseSummary,
  CanvasDiscussionPayload,
  CanvasEventPayload,
  CanvasFileAssetPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasPagePayload,
  CanvasRubricCriterionPayload,
  CanvasRubricRatingPayload,
  CanvasUserSummary
} from "./types";

export interface BinaryDownloadResult {
  arrayBuffer: ArrayBuffer;
  contentType?: string;
  contentDisposition?: string;
}

export class CanvasApiClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(baseUrl: string, apiToken: string) {
    this.baseUrl = this.cleanBaseUrl(baseUrl);
    this.apiToken = (apiToken || "").trim();
  }

  private cleanBaseUrl(url: string): string {
    let clean = (url || "").trim();
    if (!clean) {
      return "";
    }
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    return clean.replace(/\/+$/, "");
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      Authorization: `Bearer ${this.apiToken}`
    };
  }

  private parseNextLink(linkHeader?: string | null): string | null {
    if (!linkHeader || typeof linkHeader !== "string") {
      return null;
    }
    // Canvas Link header format: <https://...page=2>; rel="next", <https://...>; rel="last"
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/i);
    return match ? match[1] : null;
  }

  public async request<T>(pathOrUrl: string, method = "GET"): Promise<T> {
    if (!this.baseUrl) {
      throw new Error("Canvas Base URL is not configured. Please enter your Canvas institution URL in settings.");
    }
    if (!this.apiToken) {
      throw new Error("Canvas API Token is not configured. Please enter your Canvas API token in settings.");
    }

    const fullUrl = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    const param: RequestUrlParam = {
      url: fullUrl,
      method,
      headers: this.getAuthHeaders()
    };

    let response: RequestUrlResponse;
    try {
      response = await requestUrl(param);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Canvas request failed for ${pathOrUrl}: ${msg}`);
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Canvas API returned status ${response.status}: ${response.text}`);
    }

    return response.json as T;
  }

  public async requestPaged<T>(pathOrUrl: string, maxPages = 30): Promise<T[]> {
    let nextUrl: string | null = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    const results: T[] = [];
    let pageCount = 0;

    while (nextUrl && pageCount < maxPages) {
      pageCount++;
      const param: RequestUrlParam = {
        url: nextUrl,
        method: "GET",
        headers: this.getAuthHeaders()
      };

      const response = await requestUrl(param);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Canvas API returned status ${response.status} on page ${pageCount}`);
      }

      if (Array.isArray(response.json)) {
        results.push(...(response.json as T[]));
      }

      const linkHeader = response.headers?.["link"] || response.headers?.["Link"];
      nextUrl = this.parseNextLink(linkHeader);
    }

    return results;
  }

  public async testConnection(): Promise<CanvasUserSummary> {
    return await this.request<CanvasUserSummary>("/api/v1/users/self");
  }

  public async listCourses(options?: { includeInactive?: boolean }): Promise<CanvasCourseSummary[]> {
    const includeInactive = options?.includeInactive ?? true;
    let courses: CanvasCourseSummary[] = [];
    try {
      const endpoint = includeInactive
        ? "/api/v1/courses?include[]=term&include[]=concluded&include[]=total_students&per_page=100"
        : "/api/v1/courses?enrollment_state=active&include[]=term&include[]=total_students&per_page=100";
      courses = await this.requestPaged<CanvasCourseSummary>(endpoint);
    } catch {
      // Fallback endpoint
      courses = await this.requestPaged<CanvasCourseSummary>(
        "/api/v1/courses?include[]=term&include[]=concluded&per_page=100"
      );
    }

    // Filter out entries that aren't valid courses (e.g. missing name or access denied placeholders)
    return courses.filter((c) => c && typeof c.id === "number" && typeof c.name === "string" && c.name.trim() !== "");
  }

  public async getCourseSummary(courseId: string | number): Promise<CanvasCourseSummary & { syllabus_body?: string }> {
    return await this.request<CanvasCourseSummary & { syllabus_body?: string }>(
      `/api/v1/courses/${courseId}?include[]=syllabus_body&include[]=term`
    );
  }

  public async getCourseFrontPage(courseId: string | number): Promise<string> {
    try {
      const page = await this.request<{ body?: string }>(`/api/v1/courses/${courseId}/front_page`);
      return typeof page?.body === "string" ? page.body : "";
    } catch {
      return "";
    }
  }

  public async getModules(courseId: string | number): Promise<{
    modules: CanvasModulePayload[];
    pagesBySlug: Map<string, string[]>;
    assignmentsById: Map<string, string[]>;
    discussionsById: Map<string, string[]>;
    filesById: Map<string, string[]>;
    discoveredFiles: CanvasFileAssetPayload[];
  }> {
    const pagesBySlug = new Map<string, string[]>();
    const assignmentsById = new Map<string, string[]>();
    const discussionsById = new Map<string, string[]>();
    const filesById = new Map<string, string[]>();
    const discoveredFiles: CanvasFileAssetPayload[] = [];
    const modules: CanvasModulePayload[] = [];

    const addMembership = (map: Map<string, string[]>, key: string, name: string): void => {
      const existing = map.get(key) ?? [];
      if (!existing.includes(name)) {
        existing.push(name);
        map.set(key, existing);
      }
    };

    try {
      const apiModules = await this.requestPaged<Record<string, unknown>>(
        `/api/v1/courses/${courseId}/modules?include[]=items&per_page=100`
      );

      for (let mIdx = 0; mIdx < apiModules.length; mIdx++) {
        const mod = apiModules[mIdx];
        if (!mod || typeof mod !== "object") continue;

        const mId = String(mod.id ?? mIdx + 1);
        const mName = typeof mod.name === "string" && mod.name.trim() ? mod.name.trim() : `Module ${mIdx + 1}`;
        const items: CanvasModuleItemPayload[] = [];

        if (Array.isArray(mod.items)) {
          for (let iIdx = 0; iIdx < mod.items.length; iIdx++) {
            const item = mod.items[iIdx] as Record<string, unknown>;
            if (!item || typeof item !== "object") continue;

            const itemId = String(item.id ?? `${mId}-${iIdx + 1}`);
            const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : `Item ${iIdx + 1}`;
            const rawType = String(item.type ?? "").toLowerCase();
            const normalizedType = this.normalizeModuleItemType(rawType);
            const position = typeof item.position === "number" ? item.position : iIdx + 1;
            const indent = typeof item.indent === "number" ? item.indent : undefined;

            const modItem: CanvasModuleItemPayload = {
              id: itemId,
              position,
              title,
              type: normalizedType,
              indent
            };

            if (normalizedType === "WikiPage") {
              const rawPageUrl = typeof item.page_url === "string" ? item.page_url.trim() : "";
              const rawUrl = typeof item.url === "string" ? item.url.trim() : "";
              let slug = rawPageUrl;
              if (!slug && rawUrl) {
                const pageMatch = rawUrl.match(/\/pages\/([^/?#]+)/i);
                if (pageMatch) {
                  slug = decodeURIComponent(pageMatch[1]);
                }
              }
              if (slug) {
                modItem.pageSlug = slug;
                addMembership(pagesBySlug, slug, mName);
              }
            } else if (normalizedType === "Assignment" && item.content_id != null) {
              const assignId = String(item.content_id);
              modItem.assignmentId = assignId;
              addMembership(assignmentsById, assignId, mName);
            } else if (normalizedType === "DiscussionTopic" && item.content_id != null) {
              const discId = String(item.content_id);
              modItem.discussionId = discId;
              addMembership(discussionsById, discId, mName);
            } else if (normalizedType === "File" && item.content_id != null) {
              const fId = String(item.content_id);
              modItem.fileId = fId;
              addMembership(filesById, fId, mName);
              discoveredFiles.push({
                id: fId,
                displayName: title,
                url: `${this.baseUrl}/courses/${courseId}/files/${fId}/download`,
                moduleNames: [mName]
              });
            } else if (normalizedType === "ExternalUrl") {
              modItem.externalUrl = typeof item.external_url === "string" ? item.external_url : undefined;
            }

            items.push(modItem);
          }
        }

        modules.push({
          id: mId,
          name: mName,
          position: typeof mod.position === "number" ? mod.position : mIdx + 1,
          items
        });
      }
    } catch {
      // Modules may be disabled or empty for some courses
    }

    return {
      modules,
      pagesBySlug,
      assignmentsById,
      discussionsById,
      filesById,
      discoveredFiles
    };
  }

  public async getPages(courseId: string | number, memberships: Map<string, string[]>): Promise<CanvasPagePayload[]> {
    const pages: CanvasPagePayload[] = [];
    const fetchedSlugs = new Set<string>();

    try {
      const pageList = await this.requestPaged<Record<string, unknown>>(`/api/v1/courses/${courseId}/pages?per_page=100`);

      for (const p of pageList) {
        if (!p || typeof p.url !== "string" || !p.url.trim()) continue;
        const slug = p.url.trim();
        fetchedSlugs.add(slug.toLowerCase());
        const moduleNames = memberships.get(slug);
        const title = typeof p.title === "string" && p.title.trim() ? p.title.trim() : slug;
        const updatedAt = typeof p.updated_at === "string" ? p.updated_at : undefined;

        try {
          const detail = await this.request<Record<string, unknown>>(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(slug)}`);
          const html = typeof detail?.body === "string" ? detail.body : "";
          if (html) {
            pages.push({
              title: typeof detail?.title === "string" && detail.title.trim() ? detail.title.trim() : title,
              html,
              url: `${this.baseUrl}/courses/${courseId}/pages/${encodeURIComponent(slug)}`,
              slug,
              updatedAt: typeof detail?.updated_at === "string" ? detail.updated_at : updatedAt,
              moduleNames
            });
          }
        } catch {
          // Page detail fetch failed; skip
        }
      }
    } catch {
      // Pages endpoint may be restricted by course settings
    }

    // Fallback: Fetch any module-discovered pages that were not in pageList
    for (const [slug, moduleNames] of memberships.entries()) {
      if (fetchedSlugs.has(slug.toLowerCase())) continue;
      try {
        const detail = await this.request<Record<string, unknown>>(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(slug)}`);
        const html = typeof detail?.body === "string" ? detail.body : "";
        if (html) {
          const rawTitle = typeof detail?.title === "string" && detail.title.trim() ? detail.title.trim() : slug;
          pages.push({
            title: rawTitle,
            html,
            url: `${this.baseUrl}/courses/${courseId}/pages/${encodeURIComponent(slug)}`,
            slug,
            updatedAt: typeof detail?.updated_at === "string" ? detail.updated_at : undefined,
            moduleNames
          });
          fetchedSlugs.add(slug.toLowerCase());
        }
      } catch {
        // Page detail fetch failed; skip
      }
    }

    return pages;
  }

  public async getAssignments(courseId: string | number, memberships: Map<string, string[]>): Promise<CanvasAssignmentPayload[]> {
    const assignments: CanvasAssignmentPayload[] = [];
    try {
      const list = await this.requestPaged<Record<string, unknown>>(
        `/api/v1/courses/${courseId}/assignments?include[]=rubric_criteria&per_page=100`
      );

      for (const item of list) {
        if (!item || item.id == null) continue;
        const id = String(item.id);
        const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : `Assignment ${id}`;
        const dueAt = typeof item.due_at === "string" ? item.due_at : null;
        const pointsPossible = typeof item.points_possible === "number" ? item.points_possible : null;
        const htmlUrl = typeof item.html_url === "string" ? item.html_url : `${this.baseUrl}/courses/${courseId}/assignments/${id}`;
        const descriptionHtml = typeof item.description === "string" ? item.description : undefined;
        const submissionTypes = Array.isArray(item.submission_types) ? (item.submission_types as string[]) : undefined;
        const rubric = this.parseRubric(item.rubric);

        assignments.push({
          id,
          name,
          dueAt,
          pointsPossible,
          htmlUrl,
          descriptionHtml,
          submissionTypes,
          moduleNames: memberships.get(id),
          rubric
        });
      }
    } catch {
      // Assignments endpoint may be restricted
    }

    return assignments;
  }

  public async getDiscussions(courseId: string | number, memberships: Map<string, string[]>): Promise<CanvasDiscussionPayload[]> {
    const discussions: CanvasDiscussionPayload[] = [];
    try {
      const list = await this.requestPaged<Record<string, unknown>>(
        `/api/v1/courses/${courseId}/discussion_topics?per_page=100`
      );

      for (const item of list) {
        if (!item || item.id == null) continue;
        const id = String(item.id);
        const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : `Discussion ${id}`;
        const htmlUrl = typeof item.html_url === "string" ? item.html_url : `${this.baseUrl}/courses/${courseId}/discussion_topics/${id}`;
        const messageHtml = typeof item.message === "string" ? item.message : undefined;
        const postedAt = typeof item.posted_at === "string" ? item.posted_at : null;
        const updatedAt = typeof item.updated_at === "string" ? item.updated_at : null;

        discussions.push({
          id,
          title,
          htmlUrl,
          messageHtml,
          postedAt,
          updatedAt,
          moduleNames: memberships.get(id)
        });
      }
    } catch {
      // Discussions endpoint may be restricted
    }

    return discussions;
  }

  public async getCalendarEvents(courseId: string | number): Promise<CanvasEventPayload[]> {
    const events: CanvasEventPayload[] = [];
    try {
      const list = await this.requestPaged<Record<string, unknown>>(
        `/api/v1/calendar_events?context_codes[]=course_${courseId}&all_events=true&per_page=100`
      );

      for (const item of list) {
        if (!item || item.id == null) continue;
        const id = String(item.id);
        const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : `Event ${id}`;
        const startAt = typeof item.start_at === "string" ? item.start_at : null;
        const endAt = typeof item.end_at === "string" ? item.end_at : null;
        const htmlUrl = typeof item.html_url === "string" ? item.html_url : undefined;
        const description = typeof item.description === "string" ? item.description : undefined;

        events.push({
          id,
          title,
          startAt,
          endAt,
          htmlUrl,
          description
        });
      }
    } catch {
      // Calendar endpoint may be restricted
    }

    return events;
  }

  public async getFiles(courseId: string | number): Promise<{ files: CanvasFileAssetPayload[]; apiRestricted: boolean }> {
    try {
      const list = await this.requestPaged<Record<string, unknown>>(`/api/v1/courses/${courseId}/files?per_page=100`);
      const files: CanvasFileAssetPayload[] = [];

      for (const item of list) {
        if (!item || item.id == null) continue;
        const id = String(item.id);
        const displayName =
          typeof item.display_name === "string" && item.display_name.trim()
            ? item.display_name.trim()
            : typeof item.filename === "string" && item.filename.trim()
              ? item.filename.trim()
              : `file_${id}`;
        const url =
          typeof item.url === "string" && item.url.trim()
            ? item.url.trim()
            : `${this.baseUrl}/courses/${courseId}/files/${id}/download`;
        const size = typeof item.size === "number" ? item.size : undefined;
        const contentType = typeof item["content-type"] === "string" ? item["content-type"] : undefined;

        files.push({
          id,
          displayName,
          url,
          size,
          contentType
        });
      }

      return { files, apiRestricted: false };
    } catch {
      return { files: [], apiRestricted: true };
    }
  }

  public async downloadBinary(url: string): Promise<BinaryDownloadResult> {
    const fullUrl = url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;

    // For file downloads, provide auth header unless it's a pre-signed S3 URL
    const headers: Record<string, string> = {};
    if (!fullUrl.includes("X-Amz-Signature") && !fullUrl.includes("Signature=")) {
      headers["Authorization"] = `Bearer ${this.apiToken}`;
    }

    const res = await requestUrl({
      url: fullUrl,
      method: "GET",
      headers
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Failed to download binary file: ${res.status}`);
    }

    const contentType = res.headers?.["content-type"] || res.headers?.["Content-Type"];
    const contentDisposition = res.headers?.["content-disposition"] || res.headers?.["Content-Disposition"];

    return {
      arrayBuffer: res.arrayBuffer,
      contentType,
      contentDisposition
    };
  }

  public async fetchCompleteCoursePayload(
    courseId: string | number,
    onProgress?: (step: string, current: number, total: number) => void
  ): Promise<CanvasCoursePayload> {
    const cId = String(courseId);

    onProgress?.("Fetching course details...", 1, 8);
    const details = await this.getCourseSummary(cId);
    const courseName = details.name || `Course ${cId}`;
    const courseCode = details.course_code || undefined;
    const syllabusHtml = details.syllabus_body || undefined;

    onProgress?.("Fetching home page...", 2, 8);
    const courseHomePageHtml = (await this.getCourseFrontPage(cId)) || undefined;

    onProgress?.("Fetching course modules...", 3, 8);
    const moduleIndex = await this.getModules(cId);

    onProgress?.("Fetching pages...", 4, 8);
    const pages = await this.getPages(cId, moduleIndex.pagesBySlug);

    onProgress?.("Fetching assignments & rubrics...", 5, 8);
    const assignments = await this.getAssignments(cId, moduleIndex.assignmentsById);

    onProgress?.("Fetching discussions...", 6, 8);
    const discussions = await this.getDiscussions(cId, moduleIndex.discussionsById);

    onProgress?.("Fetching calendar events...", 7, 8);
    const events = await this.getCalendarEvents(cId);

    onProgress?.("Discovering course files...", 8, 8);
    const filesResult = await this.getFiles(cId);

    // Merge discovered files from modules and API files endpoint
    const fileMapById = new Map<string, CanvasFileAssetPayload>();
    for (const f of filesResult.files) {
      fileMapById.set(f.id, f);
    }
    for (const f of moduleIndex.discoveredFiles) {
      if (!fileMapById.has(f.id)) {
        fileMapById.set(f.id, f);
      }
    }
    for (const [fId, modNames] of moduleIndex.filesById.entries()) {
      if (!fileMapById.has(fId)) {
        fileMapById.set(fId, {
          id: fId,
          displayName: `file_${fId}`,
          url: `${this.baseUrl}/courses/${cId}/files/${fId}/download`,
          moduleNames: modNames
        });
      }
    }

    // Scan HTML content for embedded image & document links
    const allHtml = [
      courseHomePageHtml || "",
      syllabusHtml || "",
      ...pages.map((p) => p.html),
      ...assignments.map((a) => a.descriptionHtml || ""),
      ...discussions.map((d) => d.messageHtml || "")
    ];

    for (const html of allHtml) {
      if (!html) continue;

      // Extract image tags
      const imgMatches = html.matchAll(/<img[^>]+src=["']((?:https?:\/\/[^"'\s]+)?(?:\/courses\/\d+)?\/files\/(\d+)[^"']*)["'][^>]*>/gi);
      for (const m of imgMatches) {
        const rawSrc = m[1];
        const fid = m[2];
        const altMatch = m[0].match(/alt=["']([^"']*)["']/i);
        const alt = altMatch ? altMatch[1].trim() : "";
        const initialName = alt && !alt.startsWith("http") ? alt : `image_${fid}`;
        let downloadUrl = rawSrc.startsWith("http") ? rawSrc : `${this.baseUrl}${rawSrc}`;
        if (!downloadUrl.includes("/download") && !downloadUrl.includes("/preview")) {
          downloadUrl = downloadUrl.replace(`/files/${fid}`, `/files/${fid}/download`);
        }

        if (fid && !fileMapById.has(fid)) {
          fileMapById.set(fid, {
            id: fid,
            displayName: initialName,
            url: downloadUrl,
            contentType: "image/png"
          });
        }
      }

      // Extract file links
      const linkMatches = html.matchAll(/(?:href|src)=["']((?:https?:\/\/[^"'\s]+)?(?:\/courses\/\d+)?\/files\/(\d+)(?:[^\s"']*))["']/gi);
      for (const m of linkMatches) {
        const rawUrl = m[1];
        const fid = m[2];
        let downloadUrl = rawUrl.startsWith("http") ? rawUrl : `${this.baseUrl}${rawUrl}`;
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

    return {
      courseId: cId,
      courseName,
      courseCode,
      fetchedAt: new Date().toISOString(),
      courseHomePageHtml,
      syllabusHtml,
      modules: moduleIndex.modules,
      pages,
      assignments,
      discussions,
      events,
      files,
      assetDiagnostics: {
        apiRestricted: filesResult.apiRestricted,
        totalDiscovered: files.length,
        totalDownloaded: 0,
        totalSkippedSize: 0,
        totalFilteredExtension: 0,
        skippedFiles: []
      }
    };
  }

  private normalizeModuleItemType(typeValue: string): CanvasModuleItemPayload["type"] {
    const type = (typeValue || "").toLowerCase();
    if (type === "page" || type === "wikipage") return "WikiPage";
    if (type === "assignment") return "Assignment";
    if (type === "discussion" || type === "discussiontopic") return "DiscussionTopic";
    if (type === "file" || type === "attachment") return "File";
    if (type === "externalurl") return "ExternalUrl";
    if (type === "subheader" || type === "contextmodulesubheader") return "ContextModuleSubHeader";
    return "ContextExternalTool";
  }

  private parseRubric(rawRubric: unknown): CanvasRubricCriterionPayload[] | undefined {
    if (!Array.isArray(rawRubric)) return undefined;

    const criteria: CanvasRubricCriterionPayload[] = [];
    for (const item of rawRubric) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;

      const ratings: CanvasRubricRatingPayload[] = [];
      if (Array.isArray(r.ratings)) {
        for (const rating of r.ratings) {
          if (!rating || typeof rating !== "object" || typeof (rating as Record<string, unknown>).points !== "number") continue;
          const rat = rating as Record<string, unknown>;
          ratings.push({
            description: String(rat.description ?? "Unnamed Rating"),
            longDescription: typeof rat.long_description === "string" && rat.long_description.trim() ? rat.long_description : undefined,
            points: Number(rat.points)
          });
        }
      }

      if (typeof r.points !== "number") continue;

      criteria.push({
        id: String(r.id ?? "unknown"),
        description: String(r.description ?? "Unnamed Criterion"),
        longDescription: typeof r.long_description === "string" && r.long_description.trim() ? r.long_description : undefined,
        points: Number(r.points),
        ratings
      });
    }

    return criteria.length > 0 ? criteria : undefined;
  }
}

