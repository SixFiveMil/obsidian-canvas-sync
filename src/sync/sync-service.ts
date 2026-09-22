/**
 * @module sync/sync-service
 * @description Core synchronization engine that orchestrates fetching course data from Canvas,
 * downloading static assets, rewriting cross-links, rendering Markdown notes, and writing files
 * atomically into the Obsidian vault storage.
 */

import { App, Notice, TFile, normalizePath } from "obsidian";
import type { CanvasApiClient } from "../api";
import {
  renderAnnouncementDoc,
  renderAnnouncementsHub,
  renderAssignments,
  renderCourseIndex,
  renderDiscussions,
  renderEvents,
  renderGradesPage,
  renderHtmlDoc,
  renderModuleAssignmentDoc,
  renderModuleDiscussionDoc,
  renderModuleFileDoc,
  renderModuleLinkDoc,
  renderModulePageDoc,
  renderRecentAnnouncementsCallout,
  renderSubHeaderDoc
} from "../renderers";
import type {
  AssetSyncDiagnostics,
  CanvasAssignmentPayload,
  CanvasCoursePayload,
  CanvasDiscussionPayload,
  CanvasFileAssetPayload,
  CanvasModulePayload,
  CanvasPagePayload,
  CanvasSyncSettings,
  CourseSyncResult
} from "../types";
import {
  cleanFileName,
  createConfiguredTurndown,
  createCourseManifest,
  extractFileExtension,
  formatCourseFolderName,
  formatIsoDate,
  formatIsoTimestamp,
  formatSyncTimestamp,
  mergePreservedContent,
  mimeToExtension,
  parseContentDispositionFilename,
  sanitizeFileName,
  shouldDownloadAsset,
  type LinkRewriteContext
} from "../utils";

/**
 * Service responsible for executing synchronization of Canvas courses into the Obsidian vault.
 */
export class CanvasSyncService {
  private app: App;
  private settings: CanvasSyncSettings;
  private getApiClient: () => CanvasApiClient;

  /**
   * Creates a new CanvasSyncService instance.
   *
   * @param app - The Obsidian App instance.
   * @param settings - The current plugin settings.
   * @param getApiClient - Factory or getter returning the configured CanvasApiClient.
   */
  constructor(app: App, settings: CanvasSyncSettings, getApiClient: () => CanvasApiClient) {
    this.app = app;
    this.settings = settings;
    this.getApiClient = getApiClient;
  }

  /**
   * Updates settings references used during synchronization.
   *
   * @param settings - The updated plugin settings.
   */
  public updateSettings(settings: CanvasSyncSettings): void {
    this.settings = settings;
  }

  /**
   * Recursively ensures that a folder path exists in the Obsidian vault.
   *
   * @param path - Normalized relative folder path to ensure.
   */
  public async ensureFolder(path: string): Promise<void> {
    const cleanPath = normalizePath(path);
    if (!cleanPath || cleanPath === "/" || cleanPath === ".") {
      return;
    }

    const segments = cleanPath.split("/");
    let cursor = "";
    for (const segment of segments) {
      cursor = cursor ? `${cursor}/${segment}` : segment;
      const normalizedCursor = normalizePath(cursor);
      const existing =
        this.app.vault.getAbstractFileByPath(normalizedCursor) ||
        this.app.vault.getAllLoadedFiles().find((f) => f.path.toLowerCase() === normalizedCursor.toLowerCase());
      if (!existing) {
        try {
          await this.app.vault.createFolder(normalizedCursor);
        } catch (err) {
          if (!String(err).toLowerCase().includes("already exists")) {
            console.warn("Failed to create folder", normalizedCursor, err);
          }
        }
      }
    }
  }

  /**
   * Creates or updates a Markdown text file atomically in the Obsidian vault using `vault.process()`.
   * Preserves personal student notes under `## 📝 Personal Notes` if enabled in settings.
   *
   * @param path - Vault relative path for the target file.
   * @param content - Text content to write.
   * @param preserveUserNotes - Whether to merge existing personal notes into the new content.
   */
  public async upsertFile(
    path: string,
    content: string,
    preserveUserNotes = this.settings.preservePersonalNotes
  ): Promise<void> {
    const normPath = normalizePath(path);
    const parent = normPath.split("/").slice(0, -1).join("/");
    await this.ensureFolder(parent);

    const existing =
      this.app.vault.getAbstractFileByPath(normPath) ||
      this.app.vault.getAllLoadedFiles().find((f) => f.path.toLowerCase() === normPath.toLowerCase());
    let finalContent = content;

    if (preserveUserNotes && normPath.endsWith(".md")) {
      if (existing instanceof TFile) {
        try {
          const existingContent = await this.app.vault.read(existing);
          finalContent = mergePreservedContent(content, existingContent);
        } catch {
          finalContent = mergePreservedContent(content, null);
        }
      } else {
        finalContent = mergePreservedContent(content, null);
      }
    }

    if (existing instanceof TFile) {
      await this.app.vault.process(existing, () => finalContent);
      return;
    }

    try {
      await this.app.vault.create(normPath, finalContent);
    } catch (err) {
      if (String(err).toLowerCase().includes("already exists")) {
        const retryFile =
          this.app.vault.getAbstractFileByPath(normPath) ||
          this.app.vault.getAllLoadedFiles().find((f) => f.path.toLowerCase() === normPath.toLowerCase());
        if (retryFile instanceof TFile) {
          await this.app.vault.process(retryFile, () => finalContent);
          return;
        }
        console.warn(`File ${normPath} already exists on disk but is not indexed as TFile in vault.`);
        return;
      }
      throw err;
    }
  }

  /**
   * Creates or updates a binary file in the vault (e.g. PDF documents, slide decks, images).
   *
   * @param path - Vault relative path for the target file.
   * @param arrayBuffer - Raw binary buffer of the file.
   */
  public async upsertArrayBufferFile(path: string, arrayBuffer: ArrayBuffer): Promise<void> {
    const normPath = normalizePath(path);
    const parent = normPath.split("/").slice(0, -1).join("/");
    await this.ensureFolder(parent);

    const existing =
      this.app.vault.getAbstractFileByPath(normPath) ||
      this.app.vault.getAllLoadedFiles().find((f) => f.path.toLowerCase() === normPath.toLowerCase());
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, arrayBuffer);
      return;
    }

    try {
      await this.app.vault.createBinary(normPath, arrayBuffer);
    } catch (err) {
      if (String(err).toLowerCase().includes("already exists")) {
        const retryFile =
          this.app.vault.getAbstractFileByPath(normPath) ||
          this.app.vault.getAllLoadedFiles().find((f) => f.path.toLowerCase() === normPath.toLowerCase());
        if (retryFile instanceof TFile) {
          await this.app.vault.modifyBinary(retryFile, arrayBuffer);
          return;
        }
        console.warn(`Binary file ${normPath} already exists on disk but is not indexed as TFile in vault.`);
        return;
      }
      throw err;
    }
  }

  /**
   * Pads a numeric position with leading zero for tidy alphabetic folder sorting (e.g. 1 -> "01").
   */
  private padPosition(position: number): string {
    return String(position).padStart(2, "0");
  }

  /**
   * Sanitizes a title string for safe filesystem usage capped at 100 characters.
   */
  private sanitizeFileName(input: string): string {
    return sanitizeFileName(input, 100);
  }

  /**
   * Synchronizes all active Canvas courses available to the authenticated account.
   */
  public async syncAllCourses(): Promise<void> {
    if (!this.settings.canvasBaseUrl || !this.settings.canvasApiToken) {
      new Notice("Please configure your Canvas URL and API token in settings first.");
      return;
    }

    const client = this.getApiClient();
    new Notice("Fetching Canvas courses...");
    let courses;
    try {
      courses = await client.listCourses({ includeInactive: this.settings.includeInactiveCourses });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to fetch courses: ${msg}`);
      return;
    }

    if (!courses || courses.length === 0) {
      new Notice("No courses found on Canvas.");
      return;
    }

    new Notice(`Starting sync for ${courses.length} course(s)...`);
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      try {
        new Notice(`[${i + 1}/${courses.length}] Syncing: ${course.name}...`);
        const result = await this.syncCourseById(course.id);
        const actionText = result?.isNew ? "Created course" : "Updated course";
        new Notice(`${actionText}: ${course.name}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        new Notice(`Failed to sync ${course.name}: ${msg}`, 8000);
      }
    }
    new Notice(`Completed sync for ${courses.length} course(s)!`);
  }

  /**
   * Fetches full payload for a single course via Canvas API and processes it into the vault.
   *
   * @param courseId - Canvas numeric or string course ID.
   * @param onProgress - Optional callback for reporting step-by-step progress to UI modals.
   */
  public async syncCourseById(
    courseId: string | number,
    onProgress?: (step: string, current: number, total: number) => void
  ): Promise<CourseSyncResult> {
    const client = this.getApiClient();
    const payload = await client.fetchCompleteCoursePayload(courseId, onProgress, {
      syncAnnouncements: this.settings.syncAnnouncements,
      syncDiscussionReplies: this.settings.syncDiscussionReplies,
      syncStudentSubmissions: this.settings.syncStudentSubmissions
    });
    return await this.syncCoursePayload(payload, onProgress, "api");
  }

  /**
   * Main course payload ingestion pipeline.
   * Handles asset downloading, link mapping, GFM conversion, and file generation.
   *
   * @param payload - Complete CanvasCoursePayload object.
   * @param onProgress - Optional progress reporting callback.
   * @param syncSource - Ingestion pathway ("api" or "browser-extension").
   */
  public async syncCoursePayload(
    payload: CanvasCoursePayload,
    onProgress?: (step: string, current: number, total: number) => void,
    syncSource: "api" | "browser-extension" = "api"
  ): Promise<CourseSyncResult> {
    const subfolder = formatCourseFolderName(this.settings.courseFolderTemplate, payload);
    const courseFolder = normalizePath(`${this.settings.rootFolder}/${subfolder}`);

    const existingFolder =
      this.app.vault.getAbstractFileByPath(courseFolder) ||
      this.app.vault.getAllLoadedFiles().find((f) => f.path.toLowerCase() === courseFolder.toLowerCase());
    const isNew = !existingFolder;

    await this.ensureFolder(courseFolder);

    const documentsSubfolder = this.settings.documentsSubfolder || "Files";
    const attachmentsSubfolder = this.settings.attachmentsSubfolder || "Attachments";
    const filesFolder = normalizePath(`${courseFolder}/${documentsSubfolder}`);
    const attachmentsFolder = normalizePath(`${courseFolder}/${attachmentsSubfolder}`);

    const syncedFiles: string[] = [];

    if (this.settings.downloadAssets) {
      await this.ensureFolder(filesFolder);
      await this.ensureFolder(attachmentsFolder);
    }

    // Step 1: Download allowed static assets if enabled
    if (this.settings.downloadAssets && Array.isArray(payload.files) && payload.files.length > 0) {
      const client = this.getApiClient();
      const filesToDownload: CanvasFileAssetPayload[] = [];
      const diagnostics: AssetSyncDiagnostics = payload.assetDiagnostics || {
        apiRestricted: false,
        totalDiscovered: payload.files.length,
        totalDownloaded: 0,
        totalSkippedSize: 0,
        totalFilteredExtension: 0,
        skippedFiles: []
      };

      for (const file of payload.files) {
        const decision = shouldDownloadAsset(file.displayName, file.size, this.settings);
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

      for (let i = 0; i < filesToDownload.length; i++) {
        const file = filesToDownload[i];
        onProgress?.(`Downloading asset: ${file.displayName}`, i + 1, filesToDownload.length);

        try {
          const downloadResult = await client.downloadBinary(file.url);
          const arrayBuffer = downloadResult.arrayBuffer;
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            diagnostics.skippedFiles.push({
              name: file.displayName,
              reason: "error",
              message: "Empty download payload"
            });
            continue;
          }

          const headerFilename = downloadResult.contentDisposition
            ? parseContentDispositionFilename(downloadResult.contentDisposition)
            : null;
          const inferredExt = downloadResult.contentType ? mimeToExtension(downloadResult.contentType) : "";

          let finalFileName = headerFilename || file.displayName;
          if (!extractFileExtension(finalFileName) && inferredExt) {
            finalFileName = `${finalFileName}.${inferredExt}`;
          }

          const isImage =
            /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(finalFileName) ||
            (downloadResult.contentType?.startsWith("image/") ?? false) ||
            (file.contentType?.startsWith("image/") ?? false);
          const targetSubfolder = isImage ? attachmentsSubfolder : documentsSubfolder;
          const targetRelativePath = `${targetSubfolder}/${cleanFileName(finalFileName)}`;
          const targetVaultPath = normalizePath(`${courseFolder}/${targetRelativePath}`);

          await this.upsertArrayBufferFile(targetVaultPath, arrayBuffer);
          syncedFiles.push(targetVaultPath);

          file.displayName = finalFileName;
          file.downloaded = true;
          file.savedRelativePath = targetRelativePath;
          file.size = arrayBuffer.byteLength;
          if (downloadResult.contentType) {
            file.contentType = downloadResult.contentType;
          }
          diagnostics.totalDownloaded++;
        } catch (error) {
          console.warn("Failed to download course asset", file.displayName, error);
          diagnostics.skippedFiles.push({
            name: file.displayName,
            reason: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }

      payload.assetDiagnostics = diagnostics;
    }

    // Step 2: Build Lookup Maps for Link Rewriting & Cross-linking
    const pageBySlug = new Map<string, CanvasPagePayload>();
    const pageByTitle = new Map<string, CanvasPagePayload>();
    const pageMap = new Map<string, { relativePath: string; title: string }>();
    const assignmentMap = new Map<string, { relativePath: string; title: string }>();
    const discussionMap = new Map<string, { relativePath: string; title: string }>();
    const moduleMap = new Map<string, { relativePath: string; title: string }>();
    const moduleByName = new Map<string, { relativePath: string; title: string }>();

    // 1. Map all items organized inside Modules to their exact folder and file names
    for (const module of payload.modules) {
      const safeModuleName = this.sanitizeFileName(module.name || `Module ${module.id}`);
      const moduleFolderName = `${this.padPosition(module.position)} - ${safeModuleName}`;
      const modObj = { relativePath: `Modules/${moduleFolderName}/00 - Module Overview.md`, title: module.name };
      moduleMap.set(module.id, modObj);
      moduleByName.set(module.name.trim().toLowerCase(), modObj);

      for (const item of module.items) {
        const filePrefix = this.padPosition(item.position);
        const safeTitle = this.sanitizeFileName(item.title || `${item.type} Item`);

        if (item.type === "WikiPage") {
          const relPath = `Modules/${moduleFolderName}/${filePrefix} - Page - ${safeTitle}.md`;
          if (item.pageSlug) {
            pageMap.set(item.pageSlug, { relativePath: relPath, title: item.title });
          }
          const key = item.title.trim().toLowerCase();
          if (key) {
            pageMap.set(key, { relativePath: relPath, title: item.title });
          }
        } else if (item.type === "Assignment" && item.assignmentId) {
          const relPath = `Modules/${moduleFolderName}/${filePrefix} - Assignment - ${safeTitle}.md`;
          assignmentMap.set(item.assignmentId, { relativePath: relPath, title: item.title });
        } else if (item.type === "DiscussionTopic" && item.discussionId) {
          const relPath = `Modules/${moduleFolderName}/${filePrefix} - Discussion - ${safeTitle}.md`;
          discussionMap.set(item.discussionId, { relativePath: relPath, title: item.title });
        }
      }
    }

    // 2. Cross-reference discussions with assignments for graded discussions
    const assignmentById = new Map<string, CanvasAssignmentPayload>(payload.assignments.map((a) => [a.id, a]));
    const assignmentByTitle = new Map<string, CanvasAssignmentPayload>(
      payload.assignments.map((a) => [a.name.trim().toLowerCase(), a])
    );
    const discussionById = new Map<string, CanvasDiscussionPayload>(payload.discussions.map((d) => [d.id, d]));

    for (const discussion of payload.discussions) {
      let matchedAssignment: CanvasAssignmentPayload | undefined = undefined;
      if (discussion.assignmentId) {
        matchedAssignment = assignmentById.get(discussion.assignmentId);
      }
      if (!matchedAssignment) {
        matchedAssignment = assignmentByTitle.get(discussion.title.trim().toLowerCase());
      }
      if (matchedAssignment) {
        discussion.assignment = matchedAssignment;
        if (matchedAssignment.submission) {
          discussion.submission = matchedAssignment.submission;
        }
        if (!discussion.assignmentId) {
          discussion.assignmentId = matchedAssignment.id;
        }
      }
    }

    // 3. Cross-link assignmentMap and discussionMap so URLs pointing to either ID resolve cleanly to module notes
    for (const discussion of payload.discussions) {
      if (discussion.assignmentId) {
        if (
          discussionMap.has(discussion.id) &&
          (!assignmentMap.has(discussion.assignmentId) ||
            assignmentMap.get(discussion.assignmentId)!.relativePath.startsWith("Tasks.md"))
        ) {
          assignmentMap.set(discussion.assignmentId, discussionMap.get(discussion.id)!);
        }
        if (
          assignmentMap.has(discussion.assignmentId) &&
          (!discussionMap.has(discussion.id) ||
            discussionMap.get(discussion.id)!.relativePath.startsWith("Discussions.md"))
        ) {
          discussionMap.set(discussion.id, assignmentMap.get(discussion.assignmentId)!);
        }
      }
    }

    // 4. Add fallback paths for unparented pages/assignments/discussions
    for (const page of payload.pages) {
      const safeTitle = this.sanitizeFileName(page.title || "Untitled Page");
      const relativePagePath = `Pages/${safeTitle}.md`;
      if (page.slug && !pageMap.has(page.slug)) {
        pageMap.set(page.slug, { relativePath: relativePagePath, title: page.title });
      }
      const key = page.title.trim().toLowerCase();
      if (key && !pageMap.has(key)) {
        pageMap.set(key, { relativePath: relativePagePath, title: page.title });
      }
      if (page.slug) pageBySlug.set(page.slug, page);
      if (key && !pageByTitle.has(key)) pageByTitle.set(key, page);
    }

    for (const assignment of payload.assignments) {
      if (!assignmentMap.has(assignment.id)) {
        const safeTitle = this.sanitizeFileName(assignment.name || "Untitled Assignment");
        assignmentMap.set(assignment.id, { relativePath: `Tasks.md#${safeTitle}`, title: assignment.name });
      }
    }

    // Defensive Handling for announcements
    const announcements = Array.isArray(payload.announcements) ? payload.announcements : [];
    const announcementMap = new Map<string, { relativePath: string; title: string }>();
    for (const ann of announcements) {
      const datePrefix = formatIsoDate(ann.postedAt);
      const safeTitle = this.sanitizeFileName(ann.title || `Announcement ${ann.id}`);
      const fileName = datePrefix ? `${datePrefix} - ${safeTitle}.md` : `${safeTitle}.md`;
      const relPath = `Announcements/${fileName}`;
      announcementMap.set(ann.id, { relativePath: relPath, title: ann.title });
      if (!discussionMap.has(ann.id)) {
        discussionMap.set(ann.id, { relativePath: relPath, title: ann.title });
      }
    }

    for (const discussion of payload.discussions) {
      if (!discussionMap.has(discussion.id)) {
        const safeTitle = this.sanitizeFileName(discussion.title || "Untitled Discussion");
        discussionMap.set(discussion.id, { relativePath: `Discussions.md#${safeTitle}`, title: discussion.title });
      }
    }

    const fileById = new Map<string, CanvasFileAssetPayload>();
    const fileMap = new Map<string, { relativePath: string; displayName: string }>();
    const imageMap = new Map<string, { relativePath: string; displayName?: string }>();

    if (Array.isArray(payload.files)) {
      for (const file of payload.files) {
        fileById.set(file.id, file);
        if (file.downloaded && file.savedRelativePath) {
          fileMap.set(file.id, { relativePath: file.savedRelativePath, displayName: file.displayName });
          imageMap.set(file.id, { relativePath: file.savedRelativePath, displayName: file.displayName });
          if (file.url) {
            imageMap.set(file.url, { relativePath: file.savedRelativePath, displayName: file.displayName });
            imageMap.set(file.url.split("?")[0], { relativePath: file.savedRelativePath, displayName: file.displayName });
          }
        }
      }
    }

    const specialRouteMap = new Map<string, { relativePath: string; title: string }>([
      ["syllabus", { relativePath: "Syllabus.md", title: "Syllabus" }],
      ["grades", { relativePath: "Grades.md", title: "Grades" }],
      ["assignments", { relativePath: "Tasks.md", title: "Assignments" }],
      ["discussions", { relativePath: "Discussions.md", title: "Discussions" }],
      ["announcements", { relativePath: "Announcements.md", title: "Announcements" }],
      ["calendar", { relativePath: "Calendar.md", title: "Calendar" }],
      ["home", { relativePath: "Home.md", title: "Course Home" }],
      ["modules", { relativePath: "Course.md", title: "Modules" }]
    ]);

    const linkContext: LinkRewriteContext = {
      fileMap,
      moduleMap,
      pageMap,
      assignmentMap,
      discussionMap,
      imageMap,
      specialRouteMap
    };
    const turndown = createConfiguredTurndown(linkContext);

    // Step 3: Write Markdown Notes to Vault
    if (payload.courseHomePageHtml) {
      const homePath = normalizePath(`${courseFolder}/Home.md`);
      const homeProps: Record<string, unknown> = {
        canvas_type: "course_home",
        course_id: payload.courseId ? Number(payload.courseId) || payload.courseId : undefined,
        course_name: payload.courseName,
        course_code: payload.courseCode || null,
        current_score: payload.grades?.currentScore ?? null,
        current_grade: payload.grades?.currentGrade ?? null,
        final_score: payload.grades?.finalScore ?? null,
        final_grade: payload.grades?.finalGrade ?? null,
        last_synced: formatIsoTimestamp(payload.fetchedAt),
        tags: ["canvas/course", "canvas/home", `canvas/course/${payload.courseId}`].filter(Boolean)
      };
      const recentAnnouncementsCallout = renderRecentAnnouncementsCallout(announcements, announcementMap);
      await this.upsertFile(
        homePath,
        renderHtmlDoc(turndown, "Course Home", payload.courseHomePageHtml, payload.fetchedAt, homeProps, recentAnnouncementsCallout, this.settings.enableYamlFrontmatter) + "\n"
      );
      syncedFiles.push(homePath);
    }

    if (payload.syllabusHtml) {
      const syllabusPath = normalizePath(`${courseFolder}/Syllabus.md`);
      const syllabusProps: Record<string, unknown> = {
        canvas_type: "syllabus",
        course_id: payload.courseId ? Number(payload.courseId) || payload.courseId : undefined,
        course_name: payload.courseName,
        course_code: payload.courseCode || null,
        current_score: payload.grades?.currentScore ?? null,
        current_grade: payload.grades?.currentGrade ?? null,
        final_score: payload.grades?.finalScore ?? null,
        final_grade: payload.grades?.finalGrade ?? null,
        last_synced: formatIsoTimestamp(payload.fetchedAt),
        tags: ["canvas/course", "canvas/syllabus", `canvas/course/${payload.courseId}`].filter(Boolean)
      };
      await this.upsertFile(
        syllabusPath,
        renderHtmlDoc(turndown, "Syllabus", payload.syllabusHtml, payload.fetchedAt, syllabusProps, undefined, this.settings.enableYamlFrontmatter) + "\n"
      );
      syncedFiles.push(syllabusPath);
    }

    const modulesFolder = normalizePath(`${courseFolder}/Modules`);
    await this.ensureFolder(modulesFolder);

    const modules = [...payload.modules].sort((a, b) => a.position - b.position);
    for (const module of modules) {
      await this.writeModuleFolder(
        turndown,
        modulesFolder,
        module,
        pageBySlug,
        pageByTitle,
        assignmentById,
        discussionById,
        fileById,
        fileMap,
        moduleByName,
        syncedFiles,
        payload.fetchedAt,
        payload
      );
    }

    const tasksPath = normalizePath(`${courseFolder}/Tasks.md`);
    await this.upsertFile(
      tasksPath,
      renderAssignments(payload, assignmentMap, moduleByName, fileMap, payload.fetchedAt, payload, this.settings.enableYamlFrontmatter)
    );
    syncedFiles.push(tasksPath);

    const gradesPath = normalizePath(`${courseFolder}/Grades.md`);
    await this.upsertFile(
      gradesPath,
      renderGradesPage(payload, assignmentMap, moduleByName, this.settings.enableYamlFrontmatter)
    );
    syncedFiles.push(gradesPath);

    if (announcements.length > 0) {
      const announcementsFolder = normalizePath(`${courseFolder}/Announcements`);
      await this.ensureFolder(announcementsFolder);

      for (const announcement of announcements) {
        const annInfo = announcementMap.get(announcement.id);
        if (annInfo) {
          const annPath = normalizePath(`${courseFolder}/${annInfo.relativePath}`);
          await this.upsertFile(
            annPath,
            renderAnnouncementDoc(turndown, announcement, payload.fetchedAt, payload, fileMap, this.settings.enableYamlFrontmatter)
          );
          syncedFiles.push(annPath);
        }
      }
    }

    const announcementsPath = normalizePath(`${courseFolder}/Announcements.md`);
    await this.upsertFile(
      announcementsPath,
      renderAnnouncementsHub(announcements, payload.fetchedAt, payload, announcementMap, this.settings.enableYamlFrontmatter)
    );
    syncedFiles.push(announcementsPath);

    const discussionsPath = normalizePath(`${courseFolder}/Discussions.md`);
    await this.upsertFile(
      discussionsPath,
      renderDiscussions(payload, discussionMap, moduleByName, payload.fetchedAt, payload, this.settings.enableYamlFrontmatter)
    );
    syncedFiles.push(discussionsPath);

    // Ensure events include synthesized milestones from assignments if not already present
    const finalEvents = Array.isArray(payload.events) ? [...payload.events] : [];
    const seenEventKeys = new Set<string>();
    for (const ev of finalEvents) {
      if (ev.assignmentId) {
        seenEventKeys.add(`assign-${ev.assignmentId}`);
      } else {
        seenEventKeys.add(`event-${ev.id}-${ev.startAt ?? ""}`);
      }
    }
    if (Array.isArray(payload.assignments)) {
      for (const assignment of payload.assignments) {
        if (!assignment.dueAt) continue;
        const key = `assign-${assignment.id}`;
        if (!seenEventKeys.has(key)) {
          seenEventKeys.add(key);
          finalEvents.push({
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
    payload.events = finalEvents;

    const eventsPath = normalizePath(`${courseFolder}/Calendar.md`);
    await this.upsertFile(
      eventsPath,
      renderEvents(turndown, payload, assignmentMap, payload.fetchedAt, payload, this.settings.enableYamlFrontmatter)
    );
    syncedFiles.push(eventsPath);

    const courseIndexPath = normalizePath(`${courseFolder}/Course.md`);
    const indexDoc = renderCourseIndex(payload, this.settings, announcementMap);
    await this.upsertFile(courseIndexPath, indexDoc + "\n");
    syncedFiles.push(courseIndexPath);

    if (this.settings.includeRawPayload) {
      const rawPath = normalizePath(`${courseFolder}/Raw Payload.json`);
      await this.upsertFile(rawPath, JSON.stringify(payload, null, 2) + "\n", false);
      syncedFiles.push(rawPath);
    }

    // Step 4: Record sync manifest for history and location tracking
    const manifest = createCourseManifest(payload, syncedFiles, syncSource);
    const manifestPath = normalizePath(`${courseFolder}/_canvas-sync-manifest.json`);
    await this.upsertFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", false);

    return { isNew, courseFolder };
  }

  /**
   * Writes all items belonging to a module into its corresponding module subfolder.
   */
  private async writeModuleFolder(
    turndown: import("turndown"),
    modulesFolder: string,
    module: CanvasModulePayload,
    pageBySlug: Map<string, CanvasPagePayload>,
    pageByTitle: Map<string, CanvasPagePayload>,
    assignmentById: Map<string, CanvasAssignmentPayload>,
    discussionById: Map<string, CanvasDiscussionPayload>,
    fileById: Map<string, CanvasFileAssetPayload>,
    fileMap: Map<string, { relativePath: string; displayName: string }>,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    syncedFiles?: string[],
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): Promise<void> {
    const moduleFolder = normalizePath(
      `${modulesFolder}/${this.padPosition(module.position)} - ${this.sanitizeFileName(module.name)}`
    );
    const moduleOverviewPath = normalizePath(`${moduleFolder}/00 - Module Overview.md`);
    const items = [...module.items].sort((a, b) => a.position - b.position);

    const overviewProps: Record<string, unknown> = {
      canvas_id: module.id ? Number(module.id) || module.id : null,
      canvas_type: "module",
      title: module.name,
      course: coursePayload?.courseName,
      course_id: coursePayload?.courseId ? Number(coursePayload.courseId) || coursePayload.courseId : undefined,
      position: module.position,
      last_synced: formatIsoTimestamp(lastSynced),
      tags: ["canvas/module", `canvas/course/${coursePayload?.courseId}`].filter(Boolean)
    };

    if (module.summaryHtml) {
      await this.upsertFile(
        moduleOverviewPath,
        renderHtmlDoc(turndown, module.name, module.summaryHtml, lastSynced, overviewProps, undefined, this.settings.enableYamlFrontmatter) + "\n"
      );
      syncedFiles?.push(moduleOverviewPath);
    } else {
      const itemLinks: string[] = [];
      for (const item of items) {
        const filePrefix = this.padPosition(item.position);
        const safeTitle = this.sanitizeFileName(item.title || `${item.type} Item`);
        let targetFileName = "";
        if (item.type === "WikiPage") targetFileName = `${filePrefix} - Page - ${safeTitle}.md`;
        else if (item.type === "Assignment") targetFileName = `${filePrefix} - Assignment - ${safeTitle}.md`;
        else if (item.type === "DiscussionTopic") targetFileName = `${filePrefix} - Discussion - ${safeTitle}.md`;
        else if (item.type === "File") targetFileName = `${filePrefix} - File - ${safeTitle}.md`;
        else if (item.type === "ExternalUrl" || item.type === "ContextExternalTool")
          targetFileName = `${filePrefix} - Link - ${safeTitle}.md`;
        else if (item.type === "ContextModuleSubHeader") targetFileName = `${filePrefix} - Section - ${safeTitle}.md`;

        if (targetFileName) {
          itemLinks.push(`- [[${targetFileName}|${item.title || safeTitle}]]`);
        }
      }

      const overviewDoc = [
        `# ${module.name}`,
        "",
        `> [!INFO] **Last Synced**: ${formatSyncTimestamp(lastSynced)}`,
        "",
        "## Module Items",
        "",
        itemLinks.length > 0 ? itemLinks.join("\n") : "_No items in this module._",
        ""
      ].join("\n");
      await this.upsertFile(moduleOverviewPath, overviewDoc, this.settings.preservePersonalNotes);
      syncedFiles?.push(moduleOverviewPath);
    }

    for (const item of items) {
      const filePrefix = this.padPosition(item.position);
      const safeTitle = this.sanitizeFileName(item.title || `${item.type} Item`);

      if (item.type === "WikiPage") {
        const page =
          (item.pageSlug ? pageBySlug.get(item.pageSlug) : undefined) ||
          pageByTitle.get(item.title.trim().toLowerCase());
        const pagePath = normalizePath(`${moduleFolder}/${filePrefix} - Page - ${safeTitle}.md`);
        await this.upsertFile(
          pagePath,
          renderModulePageDoc(turndown, item, page, moduleByName, lastSynced, coursePayload, this.settings.enableYamlFrontmatter)
        );
        syncedFiles?.push(pagePath);
        continue;
      }

      if (item.type === "Assignment") {
        const assignment = item.assignmentId ? assignmentById.get(item.assignmentId) : undefined;
        const assignmentPath = normalizePath(`${moduleFolder}/${filePrefix} - Assignment - ${safeTitle}.md`);
        await this.upsertFile(
          assignmentPath,
          renderModuleAssignmentDoc(turndown, item, assignment, moduleByName, fileMap, lastSynced, coursePayload, this.settings.enableYamlFrontmatter)
        );
        syncedFiles?.push(assignmentPath);
        continue;
      }

      if (item.type === "DiscussionTopic") {
        const discussion = item.discussionId ? discussionById.get(item.discussionId) : undefined;
        const discussionPath = normalizePath(`${moduleFolder}/${filePrefix} - Discussion - ${safeTitle}.md`);
        await this.upsertFile(
          discussionPath,
          renderModuleDiscussionDoc(turndown, item, discussion, moduleByName, fileMap, lastSynced, coursePayload, this.settings.enableYamlFrontmatter)
        );
        syncedFiles?.push(discussionPath);
        continue;
      }

      if (item.type === "File") {
        const file = item.fileId ? fileById.get(item.fileId) : undefined;
        const filePath = normalizePath(`${moduleFolder}/${filePrefix} - File - ${safeTitle}.md`);
        await this.upsertFile(
          filePath,
          renderModuleFileDoc(item, file, lastSynced, coursePayload, this.settings.enableYamlFrontmatter)
        );
        syncedFiles?.push(filePath);
        continue;
      }

      if (item.type === "ExternalUrl" || item.type === "ContextExternalTool") {
        const linkPath = normalizePath(`${moduleFolder}/${filePrefix} - Link - ${safeTitle}.md`);
        await this.upsertFile(
          linkPath,
          renderModuleLinkDoc(item, lastSynced, coursePayload, this.settings.enableYamlFrontmatter)
        );
        syncedFiles?.push(linkPath);
        continue;
      }

      if (item.type === "ContextModuleSubHeader") {
        const subHeaderPath = normalizePath(`${moduleFolder}/${filePrefix} - Section - ${safeTitle}.md`);
        await this.upsertFile(
          subHeaderPath,
          renderSubHeaderDoc(item, lastSynced, coursePayload, this.settings.enableYamlFrontmatter)
        );
        syncedFiles?.push(subHeaderPath);
        continue;
      }
    }
  }
}
