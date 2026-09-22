import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian";
import type {
  CanvasAssignmentPayload,
  CanvasCourseGrades,
  CanvasCoursePayload,
  CanvasCourseSummary,
  CanvasDiscussionEntryPayload,
  CanvasDiscussionPayload,
  CanvasEventPayload,
  CanvasFileAssetPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasPagePayload,
  CanvasRubricAssessmentEntry,
  CanvasRubricCriterionPayload,
  CanvasRubricRatingPayload,
  CanvasSubmissionAttachment,
  CanvasSubmissionComment,
  CanvasSubmissionPayload,
  CanvasUserSummary,
  CourseCapabilityReport,
  DataCategoryCapability
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

  public async probeCourseCapabilities(courseId: string | number): Promise<CourseCapabilityReport> {
    const cId = String(courseId);
    const endpoints: Array<{ key: string; label: string; path: string }> = [
      {
        key: "course_info",
        label: "Course Info & Syllabus",
        path: `/api/v1/courses/${cId}?include[]=syllabus_body`
      },
      {
        key: "modules",
        label: "Modules",
        path: `/api/v1/courses/${cId}/modules?per_page=1`
      },
      {
        key: "pages",
        label: "Pages",
        path: `/api/v1/courses/${cId}/pages?per_page=1`
      },
      {
        key: "assignments",
        label: "Assignments",
        path: `/api/v1/courses/${cId}/assignments?per_page=1`
      },
      {
        key: "submissions",
        label: "Submissions & Grades",
        path: `/api/v1/courses/${cId}/assignments?include[]=submission&per_page=1`
      },
      {
        key: "announcements",
        label: "Announcements",
        path: `/api/v1/announcements?context_codes[]=course_${cId}&per_page=1`
      },
      {
        key: "discussions",
        label: "Discussions",
        path: `/api/v1/courses/${cId}/discussion_topics?per_page=1`
      },
      {
        key: "quizzes",
        label: "Quizzes",
        path: `/api/v1/courses/${cId}/quizzes?per_page=1`
      },
      {
        key: "assignment_groups",
        label: "Assignment Groups",
        path: `/api/v1/courses/${cId}/assignment_groups?per_page=1`
      },
      {
        key: "files",
        label: "Files & Attachments",
        path: `/api/v1/courses/${cId}/files?per_page=1`
      },
      {
        key: "calendar_events",
        label: "Calendar Events",
        path: `/api/v1/calendar_events?context_codes[]=course_${cId}&per_page=1`
      },
      {
        key: "staff_contacts",
        label: "Staff Contacts",
        path: `/api/v1/courses/${cId}/users?enrollment_type[]=teacher&per_page=1`
      },
      {
        key: "todo_items",
        label: "To-Do Items",
        path: `/api/v1/users/self/todo?per_page=1`
      }
    ];

    let detectedCourseName: string | undefined;

    const probeEndpoint = async (key: string, label: string, path: string): Promise<DataCategoryCapability> => {
      if (!this.baseUrl || !this.apiToken) {
        return {
          key,
          label,
          status: "error",
          errorMessage: "Canvas base URL or API token is not configured.",
          endpoint: path
        };
      }

      const fullUrl = path.startsWith("http://") || path.startsWith("https://")
        ? path
        : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

      try {
        const response = await requestUrl({
          url: fullUrl,
          method: "GET",
          headers: this.getAuthHeaders()
        });

        const statusCode = response.status;
        if (statusCode >= 200 && statusCode < 300) {
          const json = response.json;
          if (Array.isArray(json)) {
            if (json.length > 0) {
              return {
                key,
                label,
                status: "available",
                count: json.length,
                statusCode,
                endpoint: path
              };
            } else {
              return {
                key,
                label,
                status: "empty",
                count: 0,
                statusCode,
                endpoint: path
              };
            }
          } else if (json && typeof json === "object" && Object.keys(json).length > 0) {
            if (key === "course_info" && typeof (json as Record<string, unknown>).name === "string") {
              detectedCourseName = (json as Record<string, unknown>).name as string;
            }
            return {
              key,
              label,
              status: "available",
              count: 1,
              statusCode,
              endpoint: path
            };
          } else {
            return {
              key,
              label,
              status: "empty",
              count: 0,
              statusCode,
              endpoint: path
            };
          }
        }

        return this.mapStatusToCapability(key, label, path, statusCode, response.text);
      } catch (err: unknown) {
        const errorObj = err as { status?: number; message?: string; response?: { status?: number; text?: string } };
        let statusCode = typeof errorObj?.status === "number"
          ? errorObj.status
          : typeof errorObj?.response?.status === "number"
            ? errorObj.response.status
            : undefined;
        const msg = errorObj?.message || String(err);

        if (!statusCode) {
          const match = msg.match(/\b(?:status|returned|code)\s*:?\s*(\d{3})\b/i) || msg.match(/\b(40[0-9]|41[0-9]|42[0-9]|43[0-9]|44[0-9]|49[0-9]|50[0-9]|51[0-9]|52[0-9]|53[0-9]|54[0-9]|59[0-9])\b/);
          if (match) {
            const parsed = Number.parseInt(match[1] || match[0], 10);
            if (parsed >= 100 && parsed <= 599) {
              statusCode = parsed;
            }
          }
        }

        return this.mapStatusToCapability(key, label, path, statusCode, msg);
      }
    };

    const results = await Promise.all(
      endpoints.map((ep) => probeEndpoint(ep.key, ep.label, ep.path))
    );

    const capabilities: Record<string, DataCategoryCapability> = {};
    for (const res of results) {
      capabilities[res.key] = res;
    }

    return {
      courseId: cId,
      courseName: detectedCourseName || `Course ${cId}`,
      testedAt: new Date().toISOString(),
      capabilities
    };
  }

  private mapStatusToCapability(
    key: string,
    label: string,
    endpoint: string,
    statusCode?: number,
    rawMessage?: string
  ): DataCategoryCapability {
    if (statusCode === 401 || statusCode === 403) {
      return {
        key,
        label,
        status: "restricted",
        statusCode,
        errorMessage: rawMessage || "Access restricted or unauthorized by Canvas permission policies.",
        endpoint
      };
    }
    if (statusCode === 404 || statusCode === 501) {
      return {
        key,
        label,
        status: "unsupported",
        statusCode,
        errorMessage: rawMessage || "Endpoint not supported or not found on this Canvas instance.",
        endpoint
      };
    }
    return {
      key,
      label,
      status: "error",
      statusCode,
      errorMessage: rawMessage || "Error occurred while testing endpoint.",
      endpoint
    };
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
    const raw = await this.request<Record<string, unknown>>(
      `/api/v1/courses/${courseId}?include[]=syllabus_body&include[]=term&include[]=total_scores`
    );

    let parsedGrades: CanvasCourseGrades | undefined = undefined;
    const enrollments = Array.isArray(raw.enrollments) ? (raw.enrollments as Array<Record<string, unknown>>) : [];
    const firstEnrollment = enrollments[0];
    const rawGrades = (
      firstEnrollment && typeof firstEnrollment.grades === "object" && firstEnrollment.grades !== null
        ? firstEnrollment.grades
        : raw.grades
    ) as Record<string, unknown> | undefined;

    if (rawGrades && typeof rawGrades === "object") {
      parsedGrades = {
        currentScore: typeof rawGrades.current_score === "number" ? rawGrades.current_score : null,
        currentGrade: typeof rawGrades.current_grade === "string" ? rawGrades.current_grade : null,
        finalScore: typeof rawGrades.final_score === "number" ? rawGrades.final_score : null,
        finalGrade: typeof rawGrades.final_grade === "string" ? rawGrades.final_grade : null
      };
    }

    return {
      ...(raw as unknown as CanvasCourseSummary),
      grades: parsedGrades,
      syllabus_body: typeof raw.syllabus_body === "string" ? raw.syllabus_body : undefined
    };
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

  public async getAssignments(
    courseId: string | number,
    memberships: Map<string, string[]>,
    options?: { syncSubmissions?: boolean }
  ): Promise<CanvasAssignmentPayload[]> {
    const assignments: CanvasAssignmentPayload[] = [];
    const syncSubmissions = options?.syncSubmissions ?? true;
    try {
      const endpoint = syncSubmissions
        ? `/api/v1/courses/${courseId}/assignments?include[]=rubric_criteria&include[]=submission&include[]=submission_comments&include[]=rubric_assessment&per_page=100`
        : `/api/v1/courses/${courseId}/assignments?include[]=rubric_criteria&per_page=100`;

      const list = await this.requestPaged<Record<string, unknown>>(endpoint);

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

        let submission: CanvasSubmissionPayload | undefined = undefined;
        if (syncSubmissions && item.submission && typeof item.submission === "object") {
          const sub = item.submission as Record<string, unknown>;

          let comments: CanvasSubmissionComment[] | undefined = undefined;
          if (Array.isArray(sub.submission_comments)) {
            comments = (sub.submission_comments as Array<Record<string, unknown>>)
              .map((c) => ({
                authorName: typeof c.author_name === "string" && c.author_name.trim() ? c.author_name.trim() : "Instructor / Peer",
                comment: typeof c.comment === "string" ? c.comment : "",
                createdAt: typeof c.created_at === "string" ? c.created_at : ""
              }))
              .filter((c) => c.comment.trim() !== "");
          }

          let rubricAssessment: Record<string, CanvasRubricAssessmentEntry> | undefined = undefined;
          if (sub.rubric_assessment && typeof sub.rubric_assessment === "object") {
            rubricAssessment = {};
            for (const [critId, val] of Object.entries(sub.rubric_assessment as Record<string, unknown>)) {
              if (val && typeof val === "object") {
                const rVal = val as Record<string, unknown>;
                rubricAssessment[critId] = {
                  criterionId: critId,
                  points: typeof rVal.points === "number" ? rVal.points : null,
                  comments: typeof rVal.comments === "string" && rVal.comments.trim() ? rVal.comments.trim() : null
                };
              }
            }
          }

          let attachments: CanvasSubmissionAttachment[] | undefined = undefined;
          if (Array.isArray(sub.attachments)) {
            attachments = (sub.attachments as Array<Record<string, unknown>>).map((att) => ({
              id: String(att.id ?? ""),
              displayName:
                typeof att.display_name === "string" && att.display_name.trim()
                  ? att.display_name.trim()
                  : typeof att.filename === "string" && att.filename.trim()
                    ? att.filename.trim()
                    : `submission_attachment_${att.id}`,
              url: typeof att.url === "string" ? att.url : `${this.baseUrl}/files/${att.id}/download`,
              size: typeof att.size === "number" ? att.size : undefined,
              contentType: typeof att["content-type"] === "string" ? att["content-type"] : undefined
            }));
          }

          submission = {
            id: sub.id != null ? String(sub.id) : undefined,
            submittedAt: typeof sub.submitted_at === "string" ? sub.submitted_at : null,
            workflowState: typeof sub.workflow_state === "string" ? sub.workflow_state : undefined,
            score: typeof sub.score === "number" ? sub.score : null,
            grade: sub.grade != null ? String(sub.grade) : null,
            body: typeof sub.body === "string" ? sub.body : null,
            url: typeof sub.url === "string" ? sub.url : null,
            submissionType: typeof sub.submission_type === "string" ? sub.submission_type : null,
            late: typeof sub.late === "boolean" ? sub.late : undefined,
            missing: typeof sub.missing === "boolean" ? sub.missing : undefined,
            excused: typeof sub.excused === "boolean" ? sub.excused : undefined,
            comments: comments && comments.length > 0 ? comments : undefined,
            rubricAssessment: rubricAssessment && Object.keys(rubricAssessment).length > 0 ? rubricAssessment : undefined,
            attachments: attachments && attachments.length > 0 ? attachments : undefined
          };
        }

        assignments.push({
          id,
          name,
          dueAt,
          pointsPossible,
          htmlUrl,
          descriptionHtml,
          submissionTypes,
          moduleNames: memberships.get(id),
          rubric,
          submission
        });
      }
    } catch {
      // Assignments endpoint may be restricted
    }

    return assignments;
  }

  public async getDiscussionEntries(
    courseId: string | number,
    topicId: string | number
  ): Promise<CanvasDiscussionEntryPayload[]> {
    try {
      const viewData = await this.request<{
        participants?: Array<{ id: number; display_name?: string }>;
        view?: Array<Record<string, unknown>>;
      }>(`/api/v1/courses/${courseId}/discussion_topics/${topicId}/view`);

      const participantMap = new Map<number, string>();
      if (Array.isArray(viewData?.participants)) {
        for (const p of viewData.participants) {
          if (p && typeof p.id === "number" && typeof p.display_name === "string") {
            participantMap.set(p.id, p.display_name.trim());
          }
        }
      }

      const parseEntryList = (entries?: Array<Record<string, unknown>>): CanvasDiscussionEntryPayload[] => {
        if (!Array.isArray(entries)) return [];
        const result: CanvasDiscussionEntryPayload[] = [];
        for (const entry of entries) {
          if (!entry || entry.id == null) continue;
          const id = String(entry.id);
          const userId = entry.user_id != null ? String(entry.user_id) : undefined;
          const numUserId = entry.user_id != null ? Number(entry.user_id) : undefined;
          const userName =
            (numUserId != null && participantMap.get(numUserId)) ||
            (typeof entry.user_name === "string" && entry.user_name.trim()) ||
            (userId ? `User ${userId}` : "Participant");
          const messageHtml = typeof entry.message === "string" ? entry.message : "";
          const createdAt = typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString();
          const updatedAt = typeof entry.updated_at === "string" ? entry.updated_at : undefined;
          const replies = Array.isArray(entry.replies) && entry.replies.length > 0
            ? parseEntryList(entry.replies as Array<Record<string, unknown>>)
            : undefined;

          result.push({
            id,
            userId,
            userName,
            messageHtml,
            createdAt,
            updatedAt,
            replies
          });
        }
        return result;
      };

      return parseEntryList(viewData?.view);
    } catch {
      return [];
    }
  }

  public async getDiscussions(
    courseId: string | number,
    memberships: Map<string, string[]>,
    options?: { syncReplies?: boolean }
  ): Promise<CanvasDiscussionPayload[]> {
    const discussions: CanvasDiscussionPayload[] = [];
    const syncReplies = options?.syncReplies ?? true;
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
        const rawAssignmentId =
          item.assignment_id != null
            ? String(item.assignment_id)
            : item.assignment && typeof item.assignment === "object" && (item.assignment as Record<string, unknown>).id != null
              ? String((item.assignment as Record<string, unknown>).id)
              : undefined;

        let entries: CanvasDiscussionEntryPayload[] | undefined = undefined;
        if (syncReplies) {
          try {
            const fetchedEntries = await this.getDiscussionEntries(courseId, id);
            if (fetchedEntries.length > 0) {
              entries = fetchedEntries;
            }
          } catch {
            // Ignore entries fetch error for individual topic
          }
        }

        discussions.push({
          id,
          title,
          assignmentId: rawAssignmentId,
          htmlUrl,
          messageHtml,
          postedAt,
          updatedAt,
          moduleNames: memberships.get(id),
          entries
        });
      }
    } catch {
      // Discussions endpoint may be restricted
    }

    return discussions;
  }

  public async getAnnouncements(
    courseId: string | number,
    options?: { syncReplies?: boolean }
  ): Promise<CanvasDiscussionPayload[]> {
    const announcements: CanvasDiscussionPayload[] = [];
    const syncReplies = options?.syncReplies ?? true;
    const cId = String(courseId);

    let list: Array<Record<string, unknown>> = [];
    try {
      list = await this.requestPaged<Record<string, unknown>>(
        `/api/v1/announcements?context_codes[]=course_${cId}&per_page=100`
      );
    } catch {
      try {
        list = await this.requestPaged<Record<string, unknown>>(
          `/api/v1/courses/${cId}/discussion_topics?only_announcements=true&per_page=100`
        );
      } catch {
        return [];
      }
    }

    if (!Array.isArray(list)) {
      return [];
    }

    for (const item of list) {
      if (!item || item.id == null) continue;
      const id = String(item.id);
      const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : `Announcement ${id}`;
      const htmlUrl =
        typeof item.html_url === "string" && item.html_url.trim()
          ? item.html_url.trim()
          : `${this.baseUrl}/courses/${cId}/announcements/${id}`;
      const messageHtml = typeof item.message === "string" ? item.message : undefined;
      const postedAt = typeof item.posted_at === "string" ? item.posted_at : typeof item.created_at === "string" ? item.created_at : null;
      const updatedAt = typeof item.updated_at === "string" ? item.updated_at : null;

      let authorName: string | undefined = undefined;
      if (typeof item.user_name === "string" && item.user_name.trim()) {
        authorName = item.user_name.trim();
      } else if (item.author && typeof item.author === "object" && typeof (item.author as Record<string, unknown>).display_name === "string") {
        authorName = ((item.author as Record<string, unknown>).display_name as string).trim();
      } else if (item.user && typeof item.user === "object" && typeof (item.user as Record<string, unknown>).display_name === "string") {
        authorName = ((item.user as Record<string, unknown>).display_name as string).trim();
      }

      let attachments: CanvasSubmissionAttachment[] | undefined = undefined;
      const rawAttachments = Array.isArray(item.attachments)
        ? (item.attachments as Array<Record<string, unknown>>)
        : item.attachment && typeof item.attachment === "object"
          ? [item.attachment as Record<string, unknown>]
          : [];

      if (rawAttachments.length > 0) {
        attachments = rawAttachments
          .filter((att) => att && (att.id != null || att.url != null || att.display_name != null || att.filename != null))
          .map((att) => ({
            id: String(att.id ?? ""),
            displayName:
              typeof att.display_name === "string" && att.display_name.trim()
                ? att.display_name.trim()
                : typeof att.filename === "string" && att.filename.trim()
                  ? att.filename.trim()
                  : `attachment_${att.id || "file"}`,
            url:
              typeof att.url === "string"
                ? att.url
                : `${this.baseUrl}/files/${att.id}/download`,
            size: typeof att.size === "number" ? att.size : undefined,
            contentType: typeof att["content-type"] === "string" ? att["content-type"] : undefined
          }));
      }

      let entries: CanvasDiscussionEntryPayload[] | undefined = undefined;
      if (syncReplies) {
        try {
          const fetchedEntries = await this.getDiscussionEntries(cId, id);
          if (fetchedEntries.length > 0) {
            entries = fetchedEntries;
          }
        } catch {
          // Ignore entries fetch error for individual announcement
        }
      }

      announcements.push({
        id,
        title,
        htmlUrl,
        messageHtml,
        postedAt,
        updatedAt,
        author: authorName,
        authorName,
        userName: authorName,
        attachments,
        unreadCount: typeof item.unread_count === "number" ? item.unread_count : null,
        discussionSubentryCount: typeof item.discussion_subentry_count === "number" ? item.discussion_subentry_count : null,
        entries
      });
    }

    return announcements;
  }

  public async getCalendarEvents(
    courseId: string | number,
    assignments?: CanvasAssignmentPayload[]
  ): Promise<CanvasEventPayload[]> {
    const events: CanvasEventPayload[] = [];
    const seenEventKeys = new Set<string>();

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
        const assignmentId = item.assignment_id != null ? String(item.assignment_id) : undefined;
        const eventType = assignmentId ? "assignment" : "event";

        const key = assignmentId ? `assign-${assignmentId}` : `event-${id}-${startAt ?? ""}`;
        seenEventKeys.add(key);

        events.push({
          id,
          title,
          startAt,
          endAt,
          htmlUrl,
          description,
          eventType,
          assignmentId
        });
      }
    } catch {
      // Calendar endpoint may be restricted
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

    // Sort chronologically
    events.sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));

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
    onProgress?: (step: string, current: number, total: number) => void,
    options?: { syncDiscussionReplies?: boolean; syncStudentSubmissions?: boolean; syncAnnouncements?: boolean }
  ): Promise<CanvasCoursePayload> {
    const cId = String(courseId);
    const syncDiscussionReplies = options?.syncDiscussionReplies ?? true;
    const syncStudentSubmissions = options?.syncStudentSubmissions ?? true;
    const syncAnnouncements = options?.syncAnnouncements ?? true;
    const totalSteps = 9;

    onProgress?.("Fetching course details & grades...", 1, totalSteps);
    const details = await this.getCourseSummary(cId);
    const courseName = details.name || `Course ${cId}`;
    const courseCode = details.course_code || undefined;
    const syllabusHtml = details.syllabus_body || undefined;
    const grades = details.grades;

    onProgress?.("Fetching home page...", 2, totalSteps);
    const courseHomePageHtml = (await this.getCourseFrontPage(cId)) || undefined;

    onProgress?.("Fetching course modules...", 3, totalSteps);
    const moduleIndex = await this.getModules(cId);

    onProgress?.("Fetching pages...", 4, totalSteps);
    const pages = await this.getPages(cId, moduleIndex.pagesBySlug);

    onProgress?.("Fetching assignments, submissions & rubrics...", 5, totalSteps);
    const assignments = await this.getAssignments(cId, moduleIndex.assignmentsById, {
      syncSubmissions: syncStudentSubmissions
    });

    onProgress?.("Fetching discussions & replies...", 6, totalSteps);
    const discussions = await this.getDiscussions(cId, moduleIndex.discussionsById, {
      syncReplies: syncDiscussionReplies
    });

    onProgress?.("Fetching announcements...", 7, totalSteps);
    let announcements: CanvasDiscussionPayload[] = [];
    if (syncAnnouncements) {
      announcements = await this.getAnnouncements(cId, {
        syncReplies: syncDiscussionReplies
      });
    }

    onProgress?.("Fetching calendar events & milestones...", 8, totalSteps);
    const events = await this.getCalendarEvents(cId, assignments);

    onProgress?.("Discovering course files & attachments...", 9, totalSteps);
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

    // Also include submission attachments if available
    for (const assignment of assignments) {
      if (assignment.submission?.attachments) {
        for (const att of assignment.submission.attachments) {
          if (att.id && !fileMapById.has(att.id)) {
            fileMapById.set(att.id, {
              id: att.id,
              displayName: att.displayName,
              url: att.url,
              size: att.size,
              contentType: att.contentType
            });
          }
        }
      }
    }

    // Also include announcement attachments if available
    for (const ann of announcements) {
      if (ann.attachments) {
        for (const att of ann.attachments) {
          if (att.id && !fileMapById.has(att.id)) {
            fileMapById.set(att.id, {
              id: att.id,
              displayName: att.displayName,
              url: att.url,
              size: att.size,
              contentType: att.contentType
            });
          }
        }
      }
    }

    // Scan HTML content for embedded image & document links
    const allHtml = [
      courseHomePageHtml || "",
      syllabusHtml || "",
      ...pages.map((p) => p.html),
      ...assignments.map((a) => a.descriptionHtml || ""),
      ...discussions.map((d) => d.messageHtml || ""),
      ...announcements.map((a) => a.messageHtml || "")
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
      grades,
      courseHomePageHtml,
      syllabusHtml,
      modules: moduleIndex.modules,
      pages,
      assignments,
      discussions,
      announcements,
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

