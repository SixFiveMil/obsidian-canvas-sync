/**
 * @module api/capability-probe
 * @description Probes individual Canvas REST API endpoints to determine permission status,
 * endpoint support, item counts, and error states.
 */

import { requestUrl } from "obsidian";
import type { CourseCapabilityReport, DataCategoryCapability } from "../types";

/**
 * Maps an HTTP status code or error message to a normalized DataCategoryCapability object.
 */
export function mapStatusToCapability(
  key: string,
  label: string,
  endpoint: string,
  statusCode?: number,
  rawMessage?: string
): DataCategoryCapability {
  if (statusCode === 401 || statusCode === 403) {
    let customMsg = rawMessage || "Access restricted or unauthorized by Canvas permission policies.";
    if (key === "files") {
      customMsg = "Root Files tab is locked by instructor. Individual module documents & assignment attachments will still download normally.";
    } else if (key === "staff_contacts") {
      customMsg = "People/Roster list is hidden by instructor for student privacy.";
    }
    return {
      key,
      label,
      status: "restricted",
      statusCode,
      errorMessage: customMsg,
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

/**
 * Probes all primary course endpoints to evaluate institution API capabilities and user permissions.
 *
 * @param baseUrl - Normalized Canvas base URL.
 * @param apiToken - Bearer API token.
 * @param courseId - Numeric or string course ID.
 */
export async function probeCourseEndpoints(
  baseUrl: string,
  apiToken: string,
  courseId: string | number
): Promise<CourseCapabilityReport> {
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
      key: "module_files",
      label: "Module Files & Downloads",
      path: `/api/v1/courses/${cId}/modules?include[]=items&per_page=10`
    },
    {
      key: "files",
      label: "Root Files Tab",
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
    if (!baseUrl || !apiToken) {
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
      : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

    try {
      const response = await requestUrl({
        url: fullUrl,
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiToken}`
        }
      });

      const statusCode = response.status;
      if (statusCode >= 200 && statusCode < 300) {
        const json = response.json;

        // Custom inspection for module files discovery
        if (key === "module_files" && Array.isArray(json)) {
          let fileCount = 0;
          for (const mod of json) {
            if (mod && Array.isArray((mod as Record<string, unknown>).items)) {
              for (const item of (mod as Record<string, unknown>).items as Array<Record<string, unknown>>) {
                if (item && String(item.type).toLowerCase() === "file") {
                  fileCount++;
                }
              }
            }
          }

          if (fileCount > 0) {
            return {
              key,
              label,
              status: "available",
              count: fileCount,
              statusCode,
              errorMessage: `Verified ${fileCount} downloadable file(s) in course modules.`,
              endpoint: "/api/v1/courses/:id/modules (items: file)"
            };
          } else {
            return {
              key,
              label,
              status: "empty",
              count: 0,
              statusCode,
              errorMessage: "No file attachments found in probed modules.",
              endpoint: "/api/v1/courses/:id/modules"
            };
          }
        }

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

      return mapStatusToCapability(key, label, path, statusCode, response.text);
    } catch (err: unknown) {
      // Fallback for staff contacts if /users endpoint is 403 Forbidden
      if (key === "staff_contacts") {
        try {
          const fallbackCourseUrl = `${baseUrl}/api/v1/courses/${cId}?include[]=teachers`;
          const fbResp = await requestUrl({
            url: fallbackCourseUrl,
            method: "GET",
            headers: { Accept: "application/json", Authorization: `Bearer ${apiToken}` }
          });
          if (fbResp.status >= 200 && fbResp.status < 300) {
            const teachers = (fbResp.json as Record<string, unknown>)?.teachers;
            if (Array.isArray(teachers) && teachers.length > 0) {
              return {
                key,
                label,
                status: "available",
                count: teachers.length,
                statusCode: fbResp.status,
                errorMessage: `Discovered ${teachers.length} teacher(s) via course summary payload.`,
                endpoint: "/api/v1/courses/:id?include[]=teachers"
              };
            }
          }
        } catch {
          // Fallback failed; try conversations recipient search
          try {
            const inboxUrl = `${baseUrl}/api/v1/conversations/find_recipients?context=course_${cId}&types[]=teacher`;
            const inboxResp = await requestUrl({
              url: inboxUrl,
              method: "GET",
              headers: { Accept: "application/json", Authorization: `Bearer ${apiToken}` }
            });
            if (inboxResp.status >= 200 && inboxResp.status < 300 && Array.isArray(inboxResp.json) && inboxResp.json.length > 0) {
              return {
                key,
                label,
                status: "available",
                count: inboxResp.json.length,
                statusCode: inboxResp.status,
                errorMessage: `Discovered ${inboxResp.json.length} staff contact(s) via Canvas Inbox directory.`,
                endpoint: "/api/v1/conversations/find_recipients"
              };
            }
          } catch {
            // All fallbacks exhausted
          }
        }
      }

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

      return mapStatusToCapability(key, label, path, statusCode, msg);
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
