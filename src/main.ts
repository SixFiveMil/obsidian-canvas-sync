import { App, Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";
import type TurndownService from "turndown";
import { CanvasApiClient } from "./canvas-api-client";
import { CourseSelectModal } from "./course-select-modal";
import {
  cleanFileName,
  createConfiguredTurndown,
  extractFileExtension,
  mimeToExtension,
  parseContentDispositionFilename,
  shouldDownloadAsset,
  type LinkRewriteContext
} from "./link-utils";
import { createCourseManifest, mergePreservedContent } from "./note-utils";
import { isAllowedOrigin, sanitizeFileName, validateEnvelopeShape } from "./security-utils";
import { formatCourseFolderName } from "./template-utils";
import type {
  AssetSyncDiagnostics,
  CanvasAssignmentPayload,
  CanvasCoursePayload,
  CanvasDiscussionPayload,
  CanvasEventPayload,
  CanvasFileAssetPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasPagePayload,
  CanvasRubricCriterionPayload,
  CanvasSyncSettings
} from "./types";

type HttpServer = import("http").Server;
type HttpIncomingMessage = import("http").IncomingMessage;
type HttpServerResponse = import("http").ServerResponse;

export const DEFAULT_SETTINGS: CanvasSyncSettings = {
  canvasBaseUrl: "",
  canvasApiToken: "",
  includeInactiveCourses: true,
  syncDiscussionReplies: true,
  syncStudentSubmissions: true,
  enableBridgeServer: false,
  listenPort: 27125,
  rootFolder: "Canvas",
  courseFolderTemplate: "{{courseCode}} - {{courseName}}",
  includeRawPayload: false,
  downloadAssets: true,
  downloadDocuments: true,
  downloadImages: true,
  downloadArchivesAndCode: false,
  downloadMedia: false,
  allowedExtensions: "pdf, docx, pptx, xlsx, png, jpg, jpeg, svg, zip",
  maxAssetSizeMb: 50,
  documentsSubfolder: "Files",
  attachmentsSubfolder: "Attachments",
  preservePersonalNotes: true,
  enableScheduledSync: false,
  scheduledSyncIntervalMinutes: 60,
  scheduledSyncSelectionMode: "all_active",
  scheduledCourseIds: [],
  silentScheduledSync: true
};

export default class CanvasSyncBridgePlugin extends Plugin {
  private static readonly TRUSTED_CLIENT_HEADER = "x-canvas-sync-client";
  private settings: CanvasSyncSettings = DEFAULT_SETTINGS;
  private apiClient: CanvasApiClient | null = null;
  private server: HttpServer | null = null;
  private turndown: TurndownService = createConfiguredTurndown();
  private syncIntervalTimer: number | null = null;
  private isSyncing = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.initApiClient();

    if (this.settings.enableBridgeServer) {
      await this.startServer();
    }

    this.initBackgroundSyncScheduler();

    this.addSettingTab(new CanvasSyncSettingTab(this.app, this));

    // Ribbon icon for quick access to course picker modal
    this.addRibbonIcon("graduation-cap", "Canvas Sync: Select & Sync Courses", () => {
      new CourseSelectModal(this.app, this).open();
    });

    // Command palette actions
    this.addCommand({
      id: "canvas-sync-open-course-picker",
      name: "Select & sync courses",
      callback: () => {
        new CourseSelectModal(this.app, this).open();
      }
    });

    this.addCommand({
      id: "canvas-sync-all-courses",
      name: "Sync all courses",
      callback: () => {
        void this.syncAllCourses();
      }
    });

    this.addCommand({
      id: "canvas-sync-run-scheduled-sync",
      name: "Run scheduled background sync now",
      callback: () => {
        void this.runScheduledSync(true);
      }
    });

    this.addCommand({
      id: "canvas-sync-restart-bridge-server",
      name: "Restart browser bridge listener",
      callback: () => {
        void this.restartServer().then(() => {
          if (this.settings.enableBridgeServer) {
            new Notice(`Canvas Sync Bridge listening on localhost:${this.settings.listenPort}`);
          } else {
            new Notice("Canvas Sync Bridge is currently disabled in settings.");
          }
        });
      }
    });
  }

  onunload(): void {
    this.apiClient = null;
    this.stopBackgroundSyncScheduler();
    void this.stopServer();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as unknown;
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      typeof data === "object" && data !== null ? (data as Partial<CanvasSyncSettings>) : {}
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.initApiClient();
  }

  getSettings(): CanvasSyncSettings {
    return this.settings;
  }

  async updateSettings(patch: Partial<CanvasSyncSettings>): Promise<void> {
    const prevBridgeEnabled = this.settings.enableBridgeServer;
    const prevBridgePort = this.settings.listenPort;
    const prevScheduledEnabled = this.settings.enableScheduledSync;
    const prevScheduledInterval = this.settings.scheduledSyncIntervalMinutes;
    this.settings = { ...this.settings, ...patch };
    await this.saveSettings();

    if (patch.enableBridgeServer !== undefined && patch.enableBridgeServer !== prevBridgeEnabled) {
      if (this.settings.enableBridgeServer) {
        await this.startServer();
      } else {
        await this.stopServer();
      }
    } else if (patch.listenPort !== undefined && patch.listenPort !== prevBridgePort && this.settings.enableBridgeServer) {
      await this.restartServer();
    }

    if (
      patch.enableScheduledSync !== undefined ||
      patch.scheduledSyncIntervalMinutes !== undefined
    ) {
      if (
        patch.enableScheduledSync !== prevScheduledEnabled ||
        patch.scheduledSyncIntervalMinutes !== prevScheduledInterval
      ) {
        this.restartBackgroundSyncScheduler();
      }
    }
  }

  private getHttpModule(): typeof import("http") | null {
    if (!Platform.isDesktop) {
      return null;
    }
    try {
      const nodeRequire = (window as unknown as { require?: (moduleName: string) => typeof import("http") }).require;
      if (typeof nodeRequire === "function") {
        return nodeRequire("http");
      }
    } catch {
      // Platform fallback
    }
    return null;
  }

  public async startServer(): Promise<void> {
    if (!Platform.isDesktop) {
      return;
    }
    if (this.server) {
      return;
    }

    const http = this.getHttpModule();
    if (!http) {
      new Notice("Canvas Sync Bridge: HTTP module unavailable on this platform.");
      return;
    }

    try {
      this.server = http.createServer((req, res) => {
        void this.handleBridgeRequest(req, res);
      });
    } catch (err) {
      new Notice(`Canvas Sync Bridge: Failed to initialize listener: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    return new Promise<void>((resolve) => {
      this.server?.once("error", (err: Error) => {
        new Notice(`Canvas Sync Bridge: Failed to bind port ${this.settings.listenPort}: ${err.message}`);
        this.server = null;
        resolve();
      });
      this.server?.listen(this.settings.listenPort, "127.0.0.1", () => {
        resolve();
      });
    });
  }

  public async stopServer(): Promise<void> {
    if (!this.server) {
      return;
    }

    const current = this.server;
    this.server = null;

    return new Promise<void>((resolve) => {
      current.close(() => {
        resolve();
      });
    });
  }

  public async restartServer(): Promise<void> {
    await this.stopServer();
    if (this.settings.enableBridgeServer) {
      await this.startServer();
    }
  }

  private async handleBridgeRequest(req: HttpIncomingMessage, res: HttpServerResponse): Promise<void> {
    const originHeader = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
    const allowed = isAllowedOrigin(originHeader);

    if (!allowed) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Origin not allowed." }));
      return;
    }

    const corsOrigin = originHeader && isAllowedOrigin(originHeader) ? originHeader : "*";

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Access-Control-Allow-Headers": "Content-Type, X-Canvas-Sync-Client",
        "Vary": "Origin"
      });
      res.end();
      return;
    }

    if (req.method === "GET" && (req.url === "/health" || req.url === "/status")) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin
      });
      res.end(JSON.stringify({ ok: true, status: "healthy", plugin: "canvas-sync-bridge" }));
      return;
    }

    if (req.method !== "POST" || (req.url !== "/canvas-sync" && req.url !== "/sync")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Not found" }));
      return;
    }

    const clientHeaderRaw = req.headers[CanvasSyncBridgePlugin.TRUSTED_CLIENT_HEADER];
    const clientHeader = (typeof clientHeaderRaw === "string" ? clientHeaderRaw : undefined)?.toLowerCase();
    if (clientHeader !== "canvas-browser-extension" && clientHeader !== "canvas-to-obsidian-sync") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Untrusted client header." }));
      return;
    }

    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      raw += chunk;
      if (raw.length > 50 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on("end", () => {
      void (async () => {
        try {
          const envelope: unknown = JSON.parse(raw);
          validateEnvelopeShape(envelope);
          const payload = (envelope as { payload: CanvasCoursePayload }).payload;
          const result = await this.syncCoursePayload(payload, undefined, "browser-extension");
          const actionText = result.isNew ? "Created course" : "Updated course";
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": corsOrigin
          });
          res.end(JSON.stringify({ ok: true, message: `${actionText}: ${payload.courseName}` }));
          new Notice(`Canvas Sync: ${actionText} "${payload.courseName}" from browser extension!`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": corsOrigin
          });
          res.end(JSON.stringify({ ok: false, message: msg }));
          new Notice(`Canvas Sync error: ${msg}`);
        }
      })();
    });
  }

  public initApiClient(): void {
    this.apiClient = new CanvasApiClient(this.settings.canvasBaseUrl, this.settings.canvasApiToken);
  }

  public getApiClient(): CanvasApiClient {
    if (!this.apiClient) {
      this.initApiClient();
    }
    return this.apiClient!;
  }

  public async syncAllCourses(): Promise<void> {
    if (!this.settings.canvasBaseUrl || !this.settings.canvasApiToken) {
      new Notice("Please configure your Canvas URL and API Token in settings first.");
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

  public async syncCourseById(
    courseId: string | number,
    onProgress?: (step: string, current: number, total: number) => void
  ): Promise<{ isNew: boolean; courseFolder: string }> {
    const client = this.getApiClient();
    const payload = await client.fetchCompleteCoursePayload(courseId, onProgress, {
      syncDiscussionReplies: this.settings.syncDiscussionReplies,
      syncStudentSubmissions: this.settings.syncStudentSubmissions
    });
    return await this.syncCoursePayload(payload, onProgress, "api");
  }

  public async syncCoursePayload(
    payload: CanvasCoursePayload,
    onProgress?: (step: string, current: number, total: number) => void,
    syncSource: "api" | "browser-extension" = "api"
  ): Promise<{ isNew: boolean; courseFolder: string }> {
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
    this.turndown = createConfiguredTurndown(linkContext);

    // Step 3: Write Markdown Notes to Vault
    if (payload.courseHomePageHtml) {
      const homePath = normalizePath(`${courseFolder}/Home.md`);
      await this.upsertFile(homePath, this.renderHtmlDoc("Course Home", payload.courseHomePageHtml) + "\n");
      syncedFiles.push(homePath);
    }

    if (payload.syllabusHtml) {
      const syllabusPath = normalizePath(`${courseFolder}/Syllabus.md`);
      await this.upsertFile(syllabusPath, this.renderHtmlDoc("Syllabus", payload.syllabusHtml) + "\n");
      syncedFiles.push(syllabusPath);
    }

    const modulesFolder = normalizePath(`${courseFolder}/Modules`);
    await this.ensureFolder(modulesFolder);

    const modules = [...payload.modules].sort((a, b) => a.position - b.position);
    for (const module of modules) {
      await this.writeModuleFolder(
        modulesFolder,
        module,
        pageBySlug,
        pageByTitle,
        assignmentById,
        discussionById,
        fileById,
        fileMap,
        moduleByName,
        syncedFiles
      );
    }

    const tasksPath = normalizePath(`${courseFolder}/Tasks.md`);
    await this.upsertFile(tasksPath, this.renderAssignments(payload.assignments, assignmentMap, moduleByName, fileMap));
    syncedFiles.push(tasksPath);

    const gradesPath = normalizePath(`${courseFolder}/Grades.md`);
    await this.upsertFile(gradesPath, this.renderGradesPage(payload, assignmentMap, moduleByName));
    syncedFiles.push(gradesPath);

    const discussionsPath = normalizePath(`${courseFolder}/Discussions.md`);
    await this.upsertFile(discussionsPath, this.renderDiscussions(payload.discussions, discussionMap, moduleByName));
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
    await this.upsertFile(eventsPath, this.renderEvents(payload.events, assignmentMap));
    syncedFiles.push(eventsPath);

    const courseIndexPath = normalizePath(`${courseFolder}/Course.md`);
    const indexDoc = this.renderCourseIndex(payload);
    await this.upsertFile(courseIndexPath, indexDoc + "\n");
    syncedFiles.push(courseIndexPath);

    if (this.settings.includeRawPayload) {
      const rawPath = normalizePath(`${courseFolder}/Raw Payload.json`);
      await this.upsertFile(rawPath, JSON.stringify(payload, null, 2) + "\n", false);
      syncedFiles.push(rawPath);
    }

    // Step 4: Record sync manifest for history and location tracking
    const manifest = createCourseManifest(payload, syncedFiles, syncSource);
    const manifestPath = normalizePath(`${courseFolder}/.canvas-sync-manifest.json`);
    await this.upsertFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", false);

    return { isNew, courseFolder };
  }

  private renderCourseIndex(payload: CanvasCoursePayload): string {
    const lines = [
      `# ${payload.courseName}`,
      "",
      `Course ID: ${payload.courseId}`,
      `Last Synced: ${payload.fetchedAt}`,
      "",
      "## Notes",
      "",
      "- Module-ordered content is in ./Modules",
      "- Course home page is in ./Home.md (if available)",
      "- Syllabus is in ./Syllabus.md (if available)",
      "- Overall grade report & gradebook is in ./Grades.md",
      "- Assignment checklist is in ./Tasks.md",
      "- Discussion summary is in ./Discussions.md",
      "- Events are in ./Calendar.md",
      `- Downloaded static documents are in ./${this.settings.documentsSubfolder || "Files"}`
    ];

    if (payload.grades && (payload.grades.currentScore != null || payload.grades.currentGrade != null || payload.grades.finalScore != null || payload.grades.finalGrade != null)) {
      lines.push("", "## Course Grades", "");
      const g = payload.grades;
      const currentScoreText = g.currentScore != null ? `${g.currentScore}%` : "No score recorded";
      const currentGradeText = g.currentGrade ? ` (Grade: ${g.currentGrade})` : "";
      lines.push(`> [!INFO] **Current Course Grade**: ${currentScoreText}${currentGradeText}`);

      if (g.finalScore != null || g.finalGrade != null) {
        const finalScoreText = g.finalScore != null ? `${g.finalScore}%` : "No score recorded";
        const finalGradeText = g.finalGrade ? ` (Grade: ${g.finalGrade})` : "";
        lines.push(`> - **Final Calculated Grade**: ${finalScoreText}${finalGradeText}`);
      }
    }

    if (payload.assetDiagnostics || (payload.files && payload.files.length > 0)) {
      lines.push("", "## Asset Sync Diagnostics", "");
      const diag: AssetSyncDiagnostics = payload.assetDiagnostics || {
        apiRestricted: false,
        totalDiscovered: payload.files?.length || 0,
        totalDownloaded: payload.files?.filter((f) => f.downloaded).length || 0,
        totalSkippedSize: 0,
        totalFilteredExtension: 0,
        skippedFiles: []
      };

      lines.push(`- **Status**: ${diag.apiRestricted ? "⚠️ API Restricted by Institution" : "✅ Available"}`);
      lines.push(`- **Total Files Discovered**: ${diag.totalDiscovered}`);
      lines.push(`- **Total Files Downloaded**: ${diag.totalDownloaded}`);

      if (diag.totalFilteredExtension > 0) {
        lines.push(`- **Files Filtered by Extension**: ${diag.totalFilteredExtension}`);
      }
      if (diag.totalSkippedSize > 0) {
        lines.push(`- **Files Skipped (> ${this.settings.maxAssetSizeMb || 50} MB)**: ${diag.totalSkippedSize}`);
      }

      if (diag.skippedFiles && diag.skippedFiles.length > 0) {
        lines.push("", "### Skipped Files", "");
        lines.push("| File Name | Reason | Size |");
        lines.push("| :--- | :--- | :--- |");
        for (const file of diag.skippedFiles) {
          const sizeStr = typeof file.size === "number" ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : "N/A";
          const reasonStr =
            file.reason === "size_limit"
              ? "Exceeds size limit"
              : file.reason === "extension_filtered"
                ? "Extension filtered"
                : file.reason === "auth_restricted"
                  ? "Restricted by Canvas"
                  : "Error downloading";
          lines.push(`| ${file.name} | ${reasonStr} | ${sizeStr} |`);
        }
      }
    }

    return lines.join("\n");
  }

  private async writeModuleFolder(
    modulesFolder: string,
    module: CanvasModulePayload,
    pageBySlug: Map<string, CanvasPagePayload>,
    pageByTitle: Map<string, CanvasPagePayload>,
    assignmentById: Map<string, CanvasAssignmentPayload>,
    discussionById: Map<string, CanvasDiscussionPayload>,
    fileById: Map<string, CanvasFileAssetPayload>,
    fileMap: Map<string, { relativePath: string; displayName: string }>,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    syncedFiles?: string[]
  ): Promise<void> {
    const moduleFolder = normalizePath(
      `${modulesFolder}/${this.padPosition(module.position)} - ${this.sanitizeFileName(module.name)}`
    );
    const moduleOverviewPath = normalizePath(`${moduleFolder}/00 - Module Overview.md`);
    const items = [...module.items].sort((a, b) => a.position - b.position);

    if (module.summaryHtml) {
      await this.upsertFile(moduleOverviewPath, this.renderHtmlDoc(module.name, module.summaryHtml) + "\n");
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
        "## Module Items",
        "",
        itemLinks.length > 0 ? itemLinks.join("\n") : "_No items in this module._",
        ""
      ].join("\n");
      await this.upsertFile(moduleOverviewPath, overviewDoc);
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
        await this.upsertFile(pagePath, this.renderModulePageDoc(item, page, moduleByName));
        syncedFiles?.push(pagePath);
        continue;
      }

      if (item.type === "Assignment") {
        const assignment = item.assignmentId ? assignmentById.get(item.assignmentId) : undefined;
        const assignmentPath = normalizePath(`${moduleFolder}/${filePrefix} - Assignment - ${safeTitle}.md`);
        await this.upsertFile(assignmentPath, this.renderModuleAssignmentDoc(item, assignment, moduleByName, fileMap));
        syncedFiles?.push(assignmentPath);
        continue;
      }

      if (item.type === "DiscussionTopic") {
        const discussion = item.discussionId ? discussionById.get(item.discussionId) : undefined;
        const discussionPath = normalizePath(`${moduleFolder}/${filePrefix} - Discussion - ${safeTitle}.md`);
        await this.upsertFile(discussionPath, this.renderModuleDiscussionDoc(item, discussion, moduleByName, fileMap));
        syncedFiles?.push(discussionPath);
        continue;
      }

      if (item.type === "File") {
        const file = item.fileId ? fileById.get(item.fileId) : undefined;
        const filePath = normalizePath(`${moduleFolder}/${filePrefix} - File - ${safeTitle}.md`);
        await this.upsertFile(filePath, this.renderModuleFileDoc(item, file));
        syncedFiles?.push(filePath);
        continue;
      }

      if (item.type === "ExternalUrl" || item.type === "ContextExternalTool") {
        const linkPath = normalizePath(`${moduleFolder}/${filePrefix} - Link - ${safeTitle}.md`);
        await this.upsertFile(linkPath, this.renderModuleLinkDoc(item));
        syncedFiles?.push(linkPath);
        continue;
      }

      if (item.type === "ContextModuleSubHeader") {
        const subHeaderPath = normalizePath(`${moduleFolder}/${filePrefix} - Section - ${safeTitle}.md`);
        await this.upsertFile(subHeaderPath, this.renderSubHeaderDoc(item));
        syncedFiles?.push(subHeaderPath);
        continue;
      }
    }
  }

  private renderHtmlDoc(title: string, html: string): string {
    const markdown = this.turndown.turndown(html).trim();
    return [`# ${title}`, "", markdown || "No content available."].join("\n");
  }

  private formatModuleLinks(
    moduleNames?: string[],
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    inTable = false
  ): string[] {
    if (!moduleNames || moduleNames.length === 0) return [];
    const pipe = inTable ? "\\|" : "|";
    return moduleNames.map((mName) => {
      const modInfo = moduleByName?.get(mName.trim().toLowerCase());
      const cleanName = mName.replace(/\|/g, "\\|");
      return modInfo ? `[[${modInfo.relativePath}${pipe}${cleanName}]]` : cleanName;
    });
  }

  private renderModulePageDoc(
    item: CanvasModuleItemPayload,
    page?: CanvasPagePayload,
    moduleByName?: Map<string, { relativePath: string; title: string }>
  ): string {
    if (!page) {
      return [
        `# ${item.title}`,
        "",
        `Type: ${item.type}`,
        item.pageSlug ? `Page Slug: ${item.pageSlug}` : null,
        "",
        "Page content could not be retrieved in this sync."
      ]
        .filter((line): line is string => line !== null)
        .join("\n")
        .trim() + "\n";
    }

    const pageBody = this.turndown.turndown(page.html).trim();
    const modLinks = this.formatModuleLinks(page.moduleNames, moduleByName);
    return [
      `# ${page.title}`,
      "",
      `Source: ${page.url}`,
      page.updatedAt ? `Updated: ${page.updatedAt}` : null,
      modLinks.length > 0 ? `Modules: ${modLinks.join(", ")}` : null,
      "",
      pageBody || "No page body available."
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim() + "\n";
  }

  private renderModuleFileDoc(item: CanvasModuleItemPayload, file?: CanvasFileAssetPayload): string {
    const lines = [`# ${item.title}`, "", `Type: File`];

    if (file?.downloaded && file.savedRelativePath) {
      lines.push(`File: [[${file.savedRelativePath}|${file.displayName}]]`);
    }

    if (file?.size) {
      lines.push(`Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
    }

    if (file?.url) {
      lines.push(`Source: ${file.url}`);
    } else if (item.externalUrl) {
      lines.push(`Source: ${item.externalUrl}`);
    }

    return lines.join("\n") + "\n";
  }

  private renderModuleAssignmentDoc(
    item: CanvasModuleItemPayload,
    assignment?: CanvasAssignmentPayload,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    fileMap?: Map<string, { relativePath: string; displayName: string }>
  ): string {
    if (!assignment) {
      return [
        `# ${item.title}`,
        "",
        `Type: ${item.type}`,
        item.assignmentId ? `Assignment ID: ${item.assignmentId}` : null,
        "",
        "Assignment details could not be retrieved in this sync."
      ]
        .filter((line): line is string => line !== null)
        .join("\n")
        .trim() + "\n";
    }

    const due = assignment.dueAt ? new Date(assignment.dueAt).toISOString() : "No due date";
    const points = assignment.pointsPossible ?? "?";
    const description = this.renderAssignmentDescription(assignment.descriptionHtml);
    const submissionBlock = this.renderAssignmentSubmission(assignment.submission, fileMap);
    const structuredRubric = this.renderStructuredRubric(assignment.rubric, assignment.submission?.rubricAssessment);
    const hasRubricTableInHtml =
      typeof assignment.descriptionHtml === "string" &&
      /class=["'][^"']*\brubric_table\b/.test(assignment.descriptionHtml);
    const modLinks = this.formatModuleLinks(assignment.moduleNames, moduleByName);

    return [
      `# ${assignment.name}`,
      "",
      `Assignment ID: ${assignment.id}`,
      `Due: ${due}`,
      `Points: ${points}`,
      modLinks.length > 0 ? `Modules: ${modLinks.join(", ")}` : null,
      assignment.htmlUrl ? `Source: ${assignment.htmlUrl}` : null,
      "",
      submissionBlock ? submissionBlock : null,
      submissionBlock ? "" : null,
      "## Instructions & Description",
      "",
      description || "No assignment description available.",
      structuredRubric ? "" : null,
      structuredRubric || null,
      !structuredRubric && !hasRubricTableInHtml
        ? "_Rubric debug: No rubric_table HTML or structured rubric array was present in this assignment payload._"
        : null
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim() + "\n";
  }

  private renderAssignmentSubmission(
    submission?: CanvasAssignmentPayload["submission"],
    fileMap?: Map<string, { relativePath: string; displayName: string }>
  ): string | null {
    if (!submission) return null;

    const lines: string[] = ["## Student Submission & Feedback", ""];
    const state = submission.workflowState || "unsubmitted";
    const scoreStr = submission.score != null ? `${submission.score}` : "Not graded";
    const gradeStr = submission.grade ? ` (Grade: ${submission.grade})` : "";
    const submittedDate = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : "N/A";

    const calloutType = state === "graded" ? "SUCCESS" : state === "submitted" ? "INFO" : "WARNING";
    lines.push(`> [!${calloutType}] **Status: ${state.toUpperCase()}**`);
    lines.push(`> - **Score**: ${scoreStr}${gradeStr}`);
    lines.push(`> - **Submitted**: ${submittedDate}`);
    if (submission.late) lines.push(`> - ⚠️ **Late Submission**`);
    if (submission.missing) lines.push(`> - ⚠️ **Marked Missing**`);
    if (submission.excused) lines.push(`> - ℹ️ **Excused**`);

    lines.push("");

    if (submission.body) {
      lines.push("### Submitted Text Content", "");
      lines.push(this.turndown.turndown(submission.body).trim());
      lines.push("");
    }

    if (submission.url) {
      lines.push("### Submitted URL", "");
      lines.push(`[${submission.url}](${submission.url})`);
      lines.push("");
    }

    if (submission.attachments && submission.attachments.length > 0) {
      lines.push("### Submitted Attachments", "");
      for (const att of submission.attachments) {
        const fileInfo = att.id ? fileMap?.get(att.id) : undefined;
        const relativePath = fileInfo?.relativePath || att.savedRelativePath;
        const displayName = fileInfo?.displayName || att.displayName;
        if (relativePath) {
          lines.push(`- [[${relativePath}|${displayName}]]`);
        } else {
          lines.push(`- [${displayName}](${att.url})`);
        }
      }
      lines.push("");
    }

    if (submission.comments && submission.comments.length > 0) {
      lines.push("### Instructor & Peer Comments", "");
      for (const c of submission.comments) {
        const cDate = c.createdAt ? new Date(c.createdAt).toLocaleString() : "";
        lines.push(`> [!QUOTE] **${c.authorName}** ${cDate ? `_(${cDate})_` : ""}`);
        lines.push(`>`);
        const commentMarkdown = this.turndown.turndown(c.comment || "").trim();
        const commentLines = commentMarkdown.split("\n").map((l) => `> ${l}`).join("\n");
        lines.push(commentLines);
        lines.push("");
      }
    }

    return lines.join("\n").trim();
  }

  private renderAssignmentDescription(descriptionHtml?: string): string {
    if (!descriptionHtml) {
      return "";
    }

    const rubricTables = this.extractRubricTables(descriptionHtml);
    const htmlWithoutRubrics = this.stripRubricTables(descriptionHtml);
    const markdownDescription = this.turndown.turndown(htmlWithoutRubrics).trim();

    if (rubricTables.length === 0) {
      return markdownDescription;
    }

    const rubricBlocks = rubricTables
      .map((tableHtml, index) => {
        const title = rubricTables.length > 1 ? `### Rubric ${index + 1}` : "### Rubric";
        const converted = this.turndown.turndown(tableHtml).trim();
        return [title, "", converted || "No rubric content."].join("\n");
      })
      .join("\n\n");

    return [markdownDescription, rubricBlocks].filter((part) => part.trim() !== "").join("\n\n");
  }

  private extractRubricTables(html: string): string[] {
    const matches = html.match(/<table\b[^>]*class=["'][^"']*\brubric_table\b[^"']*["'][^>]*>[\s\S]*?<\/table>/gi);
    return matches ?? [];
  }

  private stripRubricTables(html: string): string {
    return html.replace(/<table\b[^>]*class=["'][^"']*\brubric_table\b[^"']*["'][^>]*>[\s\S]*?<\/table>/gi, "");
  }

  private renderStructuredRubric(
    rubric?: CanvasRubricCriterionPayload[],
    assessment?: Record<string, { points?: number | null; comments?: string | null }>
  ): string {
    if (!rubric || rubric.length === 0) {
      return "";
    }

    const lines: string[] = ["## Rubric (Structured API)", ""];
    for (const criterion of rubric) {
      const assessed = assessment ? assessment[criterion.id] : undefined;
      const scoreBadge = assessed?.points != null ? ` [Score: ${assessed.points} / ${criterion.points} pts]` : "";
      lines.push(`### ${criterion.description}${scoreBadge}`);
      lines.push("");
      lines.push(`- Criterion Points: ${criterion.points}`);
      if (assessed?.points != null) {
        lines.push(`- **Assessed Score**: ${assessed.points} / ${criterion.points}`);
      }
      if (assessed?.comments) {
        lines.push(`- **Evaluator Feedback**: ${assessed.comments}`);
      }
      if (criterion.longDescription) {
        lines.push(`- Notes: ${criterion.longDescription}`);
      }
      lines.push("");

      if (criterion.ratings.length > 0) {
        lines.push("| Rating | Points | Details |");
        lines.push("| --- | ---: | --- |");
        for (const rating of criterion.ratings) {
          const details = (rating.longDescription ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
          lines.push(`| ${rating.description} | ${rating.points} | ${details} |`);
        }
        lines.push("");
      }
    }

    return lines.join("\n").trim();
  }

  private countDiscussionReplies(entries: CanvasDiscussionPayload["entries"]): number {
    if (!Array.isArray(entries)) return 0;
    let count = entries.length;
    for (const e of entries) {
      if (e.replies) count += this.countDiscussionReplies(e.replies);
    }
    return count;
  }

  private renderDiscussionEntries(entries?: CanvasDiscussionPayload["entries"], depth = 0): string {
    if (!Array.isArray(entries) || entries.length === 0) return "";
    const indent = "> ".repeat(depth + 1);
    const blocks: string[] = [];

    for (const entry of entries) {
      const author = entry.userName || "Participant";
      const date = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "";
      const header = `${indent}[!NOTE] **${author}** ${date ? `_(${date})_` : ""}`;

      const messageMarkdown = this.turndown.turndown(entry.messageHtml || "").trim();
      const indentedMessage = messageMarkdown
        ? messageMarkdown.split("\n").map((l) => `${indent}${l}`).join("\n")
        : `${indent}_(No content)_`;

      let block = `${header}\n${indent}\n${indentedMessage}`;

      if (entry.replies && entry.replies.length > 0) {
        const nestedReplies = this.renderDiscussionEntries(entry.replies, depth + 1);
        block += `\n${indent}\n${nestedReplies}`;
      }

      blocks.push(block);
    }

    return blocks.join("\n\n");
  }

  private renderModuleDiscussionDoc(
    item: CanvasModuleItemPayload,
    discussion?: CanvasDiscussionPayload,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    fileMap?: Map<string, { relativePath: string; displayName: string }>
  ): string {
    if (!discussion) {
      return [
        `# ${item.title}`,
        "",
        `Type: ${item.type}`,
        item.discussionId ? `Discussion ID: ${item.discussionId}` : null,
        "",
        "Discussion details could not be retrieved in this sync."
      ]
        .filter((line): line is string => line !== null)
        .join("\n")
        .trim() + "\n";
    }

    const assignment = discussion.assignment;
    const submission = discussion.submission ?? assignment?.submission;
    const due = assignment?.dueAt ? new Date(assignment.dueAt).toISOString() : null;
    const points = assignment?.pointsPossible != null ? `${assignment.pointsPossible}` : null;

    const discussionBody = discussion.messageHtml ? this.turndown.turndown(discussion.messageHtml).trim() : "";
    const replyCount = this.countDiscussionReplies(discussion.entries);
    const repliesBlock =
      discussion.entries && discussion.entries.length > 0
        ? this.renderDiscussionEntries(discussion.entries)
        : null;

    const submissionBlock = this.renderAssignmentSubmission(submission, fileMap);
    const structuredRubric = assignment?.rubric
      ? this.renderStructuredRubric(assignment.rubric, submission?.rubricAssessment)
      : null;
    const modLinks = this.formatModuleLinks(discussion.moduleNames, moduleByName);

    return [
      `# ${discussion.title}`,
      "",
      `Discussion ID: ${discussion.id}`,
      discussion.assignmentId ? `Assignment ID: ${discussion.assignmentId}` : null,
      due ? `Due: ${due}` : null,
      points ? `Points: ${points}` : null,
      discussion.postedAt ? `Posted: ${discussion.postedAt}` : null,
      discussion.updatedAt ? `Updated: ${discussion.updatedAt}` : null,
      modLinks.length > 0 ? `Modules: ${modLinks.join(", ")}` : null,
      discussion.htmlUrl ? `Source: ${discussion.htmlUrl}` : null,
      "",
      submissionBlock ? submissionBlock : null,
      submissionBlock ? "" : null,
      "## Prompt & Instructions",
      "",
      discussionBody || "No discussion prompt available.",
      structuredRubric ? "" : null,
      structuredRubric || null,
      repliesBlock ? "" : null,
      repliesBlock ? `## Discussion Board Replies (${replyCount})` : null,
      repliesBlock ? "" : null,
      repliesBlock || null
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim() + "\n";
  }

  private renderModuleLinkDoc(item: CanvasModuleItemPayload): string {
    return [
      `# ${item.title}`,
      "",
      `Type: ${item.type}`,
      item.externalUrl ? `URL: ${item.externalUrl}` : "URL: Not provided by Canvas API"
    ].join("\n") + "\n";
  }

  private renderSubHeaderDoc(item: CanvasModuleItemPayload): string {
    return [`# ${item.title}`, "", "Module section header."].join("\n") + "\n";
  }

  private renderAssignments(
    assignments: CanvasAssignmentPayload[],
    assignmentMap?: Map<string, { relativePath: string; title: string }>,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    fileMap?: Map<string, { relativePath: string; displayName: string }>
  ): string {
    const lines: string[] = ["# Tasks & Assignments", ""];

    if (assignments.length === 0) {
      lines.push("No assignments were found in this sync.", "");
      return lines.join("\n");
    }

    const sorted = [...assignments].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    for (const assignment of sorted) {
      const due = assignment.dueAt ? new Date(assignment.dueAt).toISOString().slice(0, 10) : "No due date";
      const points = assignment.pointsPossible ?? "?";
      const sub = assignment.submission;
      const isDone = sub?.workflowState === "graded" || sub?.workflowState === "submitted";
      const check = isDone ? "x" : " ";
      let scoreInfo = "";
      if (sub?.score != null) {
        scoreInfo = `, score: ${sub.score}/${points}`;
      } else {
        scoreInfo = `, points: ${points}`;
      }
      if (sub?.grade) {
        scoreInfo += ` [Grade: ${sub.grade}]`;
      }

      const assignInfo = assignmentMap?.get(assignment.id);
      const titleDisplay =
        assignInfo?.relativePath && !assignInfo.relativePath.startsWith("Tasks.md")
          ? `[[${assignInfo.relativePath}|${assignment.name}]]`
          : assignment.name;

      lines.push(`- [${check}] ${titleDisplay} (due: ${due}${scoreInfo})`);
      
      const modLinks = this.formatModuleLinks(assignment.moduleNames, moduleByName);
      if (modLinks.length > 0) {
        lines.push(`  - Modules: ${modLinks.join(", ")}`);
      }
      if (sub?.attachments && sub.attachments.length > 0) {
        for (const att of sub.attachments) {
          const fileInfo = att.id ? fileMap?.get(att.id) : undefined;
          const relativePath = fileInfo?.relativePath || att.savedRelativePath;
          if (relativePath) {
            lines.push(`  - Submitted File: [[${relativePath}|${fileInfo?.displayName || att.displayName}]]`);
          }
        }
      }
      if (assignInfo?.relativePath && !assignInfo.relativePath.startsWith("Tasks.md")) {
        lines.push(`  - Note: [[${assignInfo.relativePath}|Open Assignment Note]]`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private renderGradesPage(
    payload: CanvasCoursePayload,
    assignmentMap?: Map<string, { relativePath: string; title: string }>,
    moduleByName?: Map<string, { relativePath: string; title: string }>
  ): string {
    const lines: string[] = [`# Grades - ${payload.courseName}`, ""];

    // 1. Overall Grade Banner
    const g = payload.grades;
    const currentScoreText = g?.currentScore != null ? `${g.currentScore}%` : "N/A";
    const currentGradeText = g?.currentGrade ? ` (${g.currentGrade})` : "";
    const finalScoreText = g?.finalScore != null ? `${g.finalScore}%` : "N/A";
    const finalGradeText = g?.finalGrade ? ` (${g.finalGrade})` : "";

    lines.push(`> [!INFO] **Overall Course Grade**`);
    lines.push(`> - **Current Score**: ${currentScoreText}${currentGradeText}`);
    lines.push(`> - **Final Calculated Score**: ${finalScoreText}${finalGradeText}`);
    lines.push("");

    // 2. Metrics & Summary
    const assignments = payload.assignments || [];
    let totalPointsPossible = 0;
    let totalPointsEarned = 0;
    let gradedCount = 0;
    let submittedCount = 0;
    let missingCount = 0;

    for (const a of assignments) {
      if (typeof a.pointsPossible === "number") {
        totalPointsPossible += a.pointsPossible;
      }
      const sub = a.submission;
      if (sub?.workflowState === "graded" && typeof sub.score === "number") {
        totalPointsEarned += sub.score;
        gradedCount++;
      } else if (sub?.workflowState === "submitted") {
        submittedCount++;
      }
      if (sub?.missing) {
        missingCount++;
      }
    }

    lines.push("## Summary Statistics", "");
    lines.push(`- **Graded Coursework**: ${gradedCount} / ${assignments.length}`);
    if (submittedCount > 0) {
      lines.push(`- **Pending Review**: ${submittedCount}`);
    }
    if (missingCount > 0) {
      lines.push(`- **Missing Assignments**: ⚠️ ${missingCount}`);
    }
    if (gradedCount > 0 && totalPointsPossible > 0) {
      lines.push(`- **Total Points Earned (Graded)**: ${totalPointsEarned.toFixed(1)} / ${totalPointsPossible.toFixed(1)} pts`);
    }
    lines.push("- **Quick Links**: [[Tasks.md|Tasks & Assignments]] | [[Discussions.md|Discussions]] | [[Calendar.md|Calendar]]");
    lines.push("");

    // 3. Assignment Gradebook Table
    lines.push("## Assignment Gradebook", "");
    lines.push("| Assignment | Module | Due Date | Status | Score | Grade | Submitted | Feedback |");
    lines.push("| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |");

    if (assignments.length === 0) {
      lines.push("| _No assignments found_ | - | - | - | - | - | - | - |");
    } else {
      const sorted = [...assignments].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
      for (const a of sorted) {
        const assignInfo = assignmentMap?.get(a.id);
        const rawName = a.name.replace(/\|/g, "\\|");
        const nameLink = assignInfo?.relativePath
          ? `[[${assignInfo.relativePath}\\|${rawName}]]`
          : rawName;
        
        const modLinks = this.formatModuleLinks(a.moduleNames, moduleByName, true);
        const moduleCol = modLinks.length > 0 ? modLinks.join(", ") : "-";

        const dueDate = a.dueAt ? new Date(a.dueAt).toISOString().slice(0, 10) : "-";
        const sub = a.submission;

        let statusStr = "⚪ Unsubmitted";
        if (sub?.workflowState === "graded") {
          statusStr = sub.late ? "🟡 Graded (Late)" : "🟢 Graded";
        } else if (sub?.workflowState === "submitted") {
          statusStr = "🔵 Submitted";
        } else if (sub?.missing) {
          statusStr = "🔴 Missing";
        } else if (sub?.excused) {
          statusStr = "🟣 Excused";
        }

        const maxPoints = a.pointsPossible != null ? `${a.pointsPossible}` : "?";
        const earnedPoints = sub?.score != null ? `${sub.score}` : "-";
        const scoreCol = `${earnedPoints} / ${maxPoints}`;
        const gradeCol = sub?.grade ? sub.grade.replace(/\|/g, "\\|") : "-";
        const submittedDate = sub?.submittedAt ? new Date(sub.submittedAt).toISOString().slice(0, 10) : "-";

        let feedbackSnippet = "-";
        if (sub?.comments && sub.comments.length > 0) {
          const firstComment = sub.comments[0].comment.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
          feedbackSnippet = firstComment.length > 80 ? `${firstComment.slice(0, 77)}...` : firstComment;
        }

        lines.push(`| ${nameLink} | ${moduleCol} | ${dueDate} | ${statusStr} | ${scoreCol} | ${gradeCol} | ${submittedDate} | ${feedbackSnippet} |`);
      }
    }

    lines.push("");
    return lines.join("\n");
  }

  private renderDiscussions(
    discussions: CanvasDiscussionPayload[],
    discussionMap?: Map<string, { relativePath: string; title: string }>,
    moduleByName?: Map<string, { relativePath: string; title: string }>
  ): string {
    const lines: string[] = ["# Discussions", ""];

    if (discussions.length === 0) {
      lines.push("No discussions were found in this sync.", "");
      return lines.join("\n");
    }

    const sorted = [...discussions].sort((a, b) => a.title.localeCompare(b.title));
    for (const discussion of sorted) {
      const replyCount = this.countDiscussionReplies(discussion.entries);
      const replyBadge = replyCount > 0 ? ` (${replyCount} replies)` : "";
      const discInfo = discussionMap?.get(discussion.id);

      const titleDisplay =
        discInfo?.relativePath && !discInfo.relativePath.startsWith("Discussions.md")
          ? `[[${discInfo.relativePath}|${discussion.title}]]`
          : discussion.title;

      lines.push(`- ${titleDisplay}${replyBadge}`);

      const modLinks = this.formatModuleLinks(discussion.moduleNames, moduleByName);
      if (modLinks.length > 0) {
        lines.push(`  - Modules: ${modLinks.join(", ")}`);
      }
      if (discInfo?.relativePath && !discInfo.relativePath.startsWith("Discussions.md")) {
        lines.push(`  - Note: [[${discInfo.relativePath}|Open Discussion Note]]`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private renderEvents(
    events: CanvasEventPayload[],
    assignmentMap?: Map<string, { relativePath: string; title: string }>
  ): string {
    if (events.length === 0) {
      return ["# Calendar & Milestones", "", "No events or milestones were found in this sync.", ""].join("\n");
    }

    const lines: string[] = [
      "# Calendar & Milestones",
      "",
      "| Date | Type | Event / Milestone | Details | Link |",
      "| :--- | :--- | :--- | :--- | :--- |"
    ];

    const sorted = [...events].sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
    for (const event of sorted) {
      const dateStr = event.startAt ? new Date(event.startAt).toISOString().slice(0, 10) : "N/A";
      const typeStr = event.eventType === "assignment" ? "📝 Assignment" : "📅 Event";
      const assignInfo = event.assignmentId ? assignmentMap?.get(event.assignmentId) : undefined;

      const cleanEventTitle = event.title.replace(/\|/g, "\\|");
      let titleStr = cleanEventTitle;
      let linkStr = "-";

      if (assignInfo?.relativePath && !assignInfo.relativePath.startsWith("Tasks.md")) {
        titleStr = `[[${assignInfo.relativePath}\\|${cleanEventTitle}]]`;
        linkStr = `[[${assignInfo.relativePath}\\|View Note]]`;
      } else if (assignInfo?.relativePath) {
        titleStr = `[[${assignInfo.relativePath}\\|${cleanEventTitle}]]`;
        linkStr = `[[${assignInfo.relativePath}\\|View Task]]`;
      } else if (event.htmlUrl) {
        linkStr = `[Canvas Link](${event.htmlUrl})`;
      }

      const descStr =
        (event.description
          ? this.turndown.turndown(event.description).replace(/\|/g, "\\|").replace(/\n+/g, " ")
          : ""
        ).trim() || "-";

      lines.push(`| ${dateStr} | ${typeStr} | ${titleStr} | ${descStr} | ${linkStr} |`);
    }

    lines.push("");
    return lines.join("\n");
  }

  private async ensureFolder(path: string): Promise<void> {
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

  private async upsertFile(
    path: string,
    content: string,
    preserveUserNotes = this.settings.preservePersonalNotes
  ): Promise<void> {
    const normPath = normalizePath(path);
    const parent = normPath.split("/").slice(0, -1).join("/");
    await this.ensureFolder(parent);

    const existing =
      this.app.vault.getAbstractFileByPath(normPath) ||
      this.app.vault.getFiles().find((f) => f.path.toLowerCase() === normPath.toLowerCase());
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
          this.app.vault.getFiles().find((f) => f.path.toLowerCase() === normPath.toLowerCase());
        if (retryFile instanceof TFile) {
          await this.app.vault.process(retryFile, () => finalContent);
          return;
        }
      }
      throw err;
    }
  }

  private async upsertArrayBufferFile(path: string, arrayBuffer: ArrayBuffer): Promise<void> {
    const normPath = normalizePath(path);
    const parent = normPath.split("/").slice(0, -1).join("/");
    await this.ensureFolder(parent);

    const existing =
      this.app.vault.getAbstractFileByPath(normPath) ||
      this.app.vault.getFiles().find((f) => f.path.toLowerCase() === normPath.toLowerCase());
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
          this.app.vault.getFiles().find((f) => f.path.toLowerCase() === normPath.toLowerCase());
        if (retryFile instanceof TFile) {
          await this.app.vault.modifyBinary(retryFile, arrayBuffer);
          return;
        }
      }
      throw err;
    }
  }

  private padPosition(position: number): string {
    return String(position).padStart(2, "0");
  }

  private sanitizeFileName(input: string): string {
    return sanitizeFileName(input, 100);
  }

  public initBackgroundSyncScheduler(): void {
    this.stopBackgroundSyncScheduler();

    if (!this.settings.enableScheduledSync) {
      return;
    }

    const intervalMs = Math.max(1, this.settings.scheduledSyncIntervalMinutes) * 60 * 1000;
    this.syncIntervalTimer = window.setInterval(() => {
      void this.runScheduledSync(false);
    }, intervalMs);

    this.registerInterval(this.syncIntervalTimer);
  }

  public stopBackgroundSyncScheduler(): void {
    if (this.syncIntervalTimer !== null) {
      window.clearInterval(this.syncIntervalTimer);
      this.syncIntervalTimer = null;
    }
  }

  public restartBackgroundSyncScheduler(): void {
    this.initBackgroundSyncScheduler();
  }

  public async runScheduledSync(isManual = false): Promise<void> {
    if (this.isSyncing) {
      if (isManual) {
        new Notice("Canvas Sync is already in progress.");
      }
      return;
    }

    if (!this.settings.canvasBaseUrl || !this.settings.canvasApiToken) {
      if (isManual) {
        new Notice("Canvas URL and API Token are not configured in settings.");
      }
      return;
    }

    this.isSyncing = true;
    const isSilent = this.settings.silentScheduledSync && !isManual;

    try {
      if (!isSilent) {
        new Notice("Canvas Sync: Starting scheduled course sync...");
      }

      const client = this.getApiClient();
      const courses = await client.listCourses({ includeInactive: this.settings.includeInactiveCourses });

      if (!courses || courses.length === 0) {
        if (!isSilent) {
          new Notice("Canvas Sync: No courses found to sync.");
        }
        return;
      }

      let targetCourses = courses;
      if (this.settings.scheduledSyncSelectionMode === "selected" && this.settings.scheduledCourseIds.length > 0) {
        const selectedSet = new Set(this.settings.scheduledCourseIds.map(Number));
        targetCourses = courses.filter((c) => selectedSet.has(Number(c.id)));
      }

      if (targetCourses.length === 0) {
        if (!isSilent) {
          new Notice("Canvas Sync: No matching courses selected for scheduled sync.");
        }
        return;
      }

      let successCount = 0;
      for (let i = 0; i < targetCourses.length; i++) {
        const course = targetCourses[i];
        try {
          if (!isSilent) {
            new Notice(`[${i + 1}/${targetCourses.length}] Syncing: ${course.name}...`);
          }
          const result = await this.syncCourseById(course.id);
          successCount++;
          if (!isSilent) {
            const actionText = result?.isNew ? "Created course" : "Updated course";
            new Notice(`${actionText}: ${course.name}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to sync course ${course.name}:`, err);
          new Notice(`Canvas Sync error on ${course.name}: ${msg}`, 10000);
        }
      }

      await this.updateSettings({ lastScheduledSyncTimestamp: Date.now() });

      if (!isSilent) {
        new Notice(`Canvas Sync: Successfully synced ${successCount}/${targetCourses.length} course(s).`);
      } else {
        console.log(`Canvas Sync: Background scheduled sync completed (${successCount}/${targetCourses.length} courses).`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Scheduled Canvas Sync error:", error);
      new Notice(`Canvas background sync failed: ${msg}`, 10000);
    } finally {
      this.isSyncing = false;
    }
  }
}

class CanvasSyncSettingTab extends PluginSettingTab {
  plugin: CanvasSyncBridgePlugin;

  constructor(app: App, plugin: CanvasSyncBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): unknown[] {
    return [
      {
        heading: "Canvas API integration"
      },
      {
        name: "Canvas base URL",
        desc: "The web address of your Canvas institution (e.g. 'https://canvas.institution.edu' or 'https://canvas.instructure.com').",
        control: {
          type: "text",
          key: "canvasBaseUrl",
          placeholder: "https://your-school.instructure.com"
        }
      },
      {
        name: "Canvas API token",
        desc: "Personal access token generated from your Canvas Profile (Settings > Approved Integrations > + New Access Token).",
        control: {
          type: "text",
          key: "canvasApiToken",
          placeholder: "Enter API token..."
        }
      },
      {
        name: "Include inactive & past courses",
        desc: "Fetch completed, concluded, and past term courses in addition to active courses.",
        control: {
          type: "toggle",
          key: "includeInactiveCourses"
        }
      },
      {
        name: "Sync discussion replies",
        desc: "Fetch threaded student and instructor replies for course discussion topics.",
        control: {
          type: "toggle",
          key: "syncDiscussionReplies"
        }
      },
      {
        name: "Sync student submissions & grades",
        desc: "Fetch submitted assignments, scores, feedback comments, and rubric grading details.",
        control: {
          type: "toggle",
          key: "syncStudentSubmissions"
        }
      },
      {
        heading: "Browser extension bridge (optional)"
      },
      {
        name: "Enable browser bridge listener",
        desc: "Open a local listener on 127.0.0.1 to receive course data from the companion browser extension (required for session-based sync).",
        control: {
          type: "toggle",
          key: "enableBridgeServer"
        }
      },
      {
        name: "Bridge listen port",
        desc: "Localhost port that receives data from the browser extension.",
        control: {
          type: "text",
          key: "listenPort",
          placeholder: "27125"
        }
      },
      {
        heading: "Vault & organization"
      },
      {
        name: "Root folder",
        desc: "Vault folder where course data should be written.",
        control: {
          type: "text",
          key: "rootFolder",
          placeholder: "Canvas"
        }
      },
      {
        name: "Course folder template",
        desc: "Folder template for synced courses. Placeholders: {{courseCode}}, {{courseName}}, {{courseId}}.",
        control: {
          type: "text",
          key: "courseFolderTemplate",
          placeholder: "{{courseCode}} - {{courseName}}"
        }
      },
      {
        heading: "Asset downloads & attachments"
      },
      {
        name: "Download static assets",
        desc: "Download course attachments, documents, and images locally into the vault.",
        control: {
          type: "toggle",
          key: "downloadAssets"
        }
      },
      {
        name: "Download documents",
        desc: "Preset for .pdf, .docx, .pptx, .xlsx, .txt, .csv, .rtf.",
        control: {
          type: "toggle",
          key: "downloadDocuments"
        }
      },
      {
        name: "Download images",
        desc: "Preset for .png, .jpg, .jpeg, .gif, .svg, .webp.",
        control: {
          type: "toggle",
          key: "downloadImages"
        }
      },
      {
        name: "Download archives & code",
        desc: "Preset for .zip, .tar, .py, .java, .cpp, .js, .ts, .ipynb.",
        control: {
          type: "toggle",
          key: "downloadArchivesAndCode"
        }
      },
      {
        name: "Download audio & video",
        desc: "Download audio and direct video files (can use significant vault storage).",
        control: {
          type: "toggle",
          key: "downloadMedia"
        }
      },
      {
        name: "Custom allowed extensions",
        desc: "Comma-separated list of allowed file extensions (e.g. 'pdf, docx, pptx, zip').",
        control: {
          type: "text",
          key: "allowedExtensions",
          placeholder: "pdf, docx, pptx, xlsx, png, jpg, zip"
        }
      },
      {
        name: "Max file size limit (MB)",
        desc: "Maximum size in megabytes for any single downloaded asset (prevents vault bloat).",
        control: {
          type: "text",
          key: "maxAssetSizeMb",
          placeholder: "50"
        }
      },
      {
        name: "Store raw payload",
        desc: "Save incoming JSON payload for debugging.",
        control: {
          type: "toggle",
          key: "includeRawPayload"
        }
      }
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Canvas API integration").setHeading();

    new Setting(containerEl)
      .setName("Canvas base URL")
      .setDesc("The web address of your Canvas institution (e.g. 'https://canvas.institution.edu' or 'https://canvas.instructure.com').")
      .addText((text) =>
        text
          .setPlaceholder("https://your-school.instructure.com")
          .setValue(this.plugin.getSettings().canvasBaseUrl)
          .onChange((value) => {
            void this.plugin.updateSettings({ canvasBaseUrl: value.trim() });
          })
      );

    const tokenSetting = new Setting(containerEl)
      .setName("Canvas API token")
      .setDesc("Personal access token generated from your Canvas Profile (Settings > Approved Integrations > + New Access Token).");

    tokenSetting.addText((text) => {
      text.inputEl.type = "password";
      text
        .setPlaceholder("Enter API token...")
        .setValue(this.plugin.getSettings().canvasApiToken)
        .onChange((value) => {
          void this.plugin.updateSettings({ canvasApiToken: value.trim() });
        });
    });

    new Setting(containerEl)
      .setName("Include inactive & past courses")
      .setDesc("Fetch completed, concluded, and past term courses in addition to active courses.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().includeInactiveCourses).onChange((value) => {
          void this.plugin.updateSettings({ includeInactiveCourses: value });
        })
      );

    new Setting(containerEl)
      .setName("Sync discussion replies")
      .setDesc("Fetch threaded student and instructor replies for course discussion topics.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().syncDiscussionReplies).onChange((value) => {
          void this.plugin.updateSettings({ syncDiscussionReplies: value });
        })
      );

    new Setting(containerEl)
      .setName("Sync student submissions & grades")
      .setDesc("Fetch submitted assignments, scores, feedback comments, and rubric grading details.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().syncStudentSubmissions).onChange((value) => {
          void this.plugin.updateSettings({ syncStudentSubmissions: value });
        })
      );

    const statusContainer = containerEl.createDiv("canvas-connection-status");

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Verify that your Canvas URL and API Token are valid.")
      .addButton((btn) =>
        btn
          .setButtonText("Test Connection")
          .setCta()
          .onClick(async () => {
            statusContainer.empty();
            statusContainer.createSpan({ text: "Testing connection...", cls: "canvas-status-testing" });
            try {
              const client = this.plugin.getApiClient();
              const user = await client.testConnection();
              statusContainer.empty();
              statusContainer.createDiv({
                text: `✅ Successfully connected as: ${user.name || "Canvas User"} (User ID: ${user.id})`,
                cls: "canvas-status-success"
              });
            } catch (error) {
              statusContainer.empty();
              statusContainer.createDiv({
                text: `❌ Connection failed: ${error instanceof Error ? error.message : String(error)}`,
                cls: "canvas-status-error"
              });
            }
          })
      );

    new Setting(containerEl).setName("Browser extension bridge (optional)").setHeading();

    new Setting(containerEl)
      .setName("Enable browser bridge listener")
      .setDesc("Open a local listener on 127.0.0.1 to receive course data from the companion browser extension (required for session-based sync).")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().enableBridgeServer).onChange(async (value) => {
          await this.plugin.updateSettings({ enableBridgeServer: value });
          if (value) {
            await this.plugin.startServer();
          } else {
            await this.plugin.stopServer();
          }
        })
      );

    new Setting(containerEl)
      .setName("Bridge listen port")
      .setDesc("Localhost port that receives data from the browser extension.")
      .addText((text) =>
        text
          .setPlaceholder("27125")
          .setValue(String(this.plugin.getSettings().listenPort))
          .onChange(async (value) => {
            const next = Number.parseInt(value, 10);
            if (!Number.isFinite(next) || next < 1 || next > 65535) {
              return;
            }
            await this.plugin.updateSettings({ listenPort: next });
            if (this.plugin.getSettings().enableBridgeServer) {
              await this.plugin.restartServer();
            }
          })
      );

    new Setting(containerEl).setName("Vault & organization").setHeading();

    new Setting(containerEl)
      .setName("Root folder")
      .setDesc("Vault folder where course data should be written.")
      .addText((text) =>
        text
          .setPlaceholder("Canvas")
          .setValue(this.plugin.getSettings().rootFolder)
          .onChange((value) => {
            void this.plugin.updateSettings({ rootFolder: value.trim() || "Canvas" });
          })
      );

    new Setting(containerEl)
      .setName("Course folder template")
      .setDesc("Folder template for synced courses. Placeholders: {{courseCode}}, {{courseName}}, {{courseId}}.")
      .addText((text) =>
        text
          .setPlaceholder("{{courseCode}} - {{courseName}}")
          .setValue(this.plugin.getSettings().courseFolderTemplate)
          .onChange((value) => {
            void this.plugin.updateSettings({
              courseFolderTemplate: value.trim() || "{{courseCode}} - {{courseName}}"
            });
          })
      );

    new Setting(containerEl)
      .setName("Preserve student personal notes")
      .setDesc("Retain personal annotations written in '## 📝 Personal Notes' section across course resyncs.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().preservePersonalNotes ?? true).onChange((value) => {
          void this.plugin.updateSettings({ preservePersonalNotes: value });
        })
      );

    new Setting(containerEl).setName("Scheduled background sync & automation").setHeading();

    new Setting(containerEl)
      .setName("Enable background sync")
      .setDesc("Automatically resync courses in the background at regular intervals.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().enableScheduledSync ?? false).onChange(async (value) => {
          await this.plugin.updateSettings({ enableScheduledSync: value });
          this.display();
        })
      );

    if (this.plugin.getSettings().enableScheduledSync) {
      new Setting(containerEl)
        .setName("Sync interval")
        .setDesc("How often to periodically resync courses.")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("15", "Every 15 minutes")
            .addOption("30", "Every 30 minutes")
            .addOption("60", "Every 1 hour")
            .addOption("120", "Every 2 hours")
            .addOption("240", "Every 4 hours")
            .addOption("360", "Every 6 hours")
            .addOption("720", "Every 12 hours")
            .addOption("1440", "Every 24 hours (Daily)")
            .setValue(String(this.plugin.getSettings().scheduledSyncIntervalMinutes || 60))
            .onChange((value) => {
              const minutes = Number.parseInt(value, 10);
              if (Number.isFinite(minutes) && minutes > 0) {
                void this.plugin.updateSettings({ scheduledSyncIntervalMinutes: minutes });
              }
            })
        );

      new Setting(containerEl)
        .setName("Course selection for auto-sync")
        .setDesc("Choose whether to sync all active courses or only specific selected courses.")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("all_active", "All active courses")
            .addOption("selected", "Selected courses only")
            .setValue(this.plugin.getSettings().scheduledSyncSelectionMode || "all_active")
            .onChange((value) => {
              void this.plugin.updateSettings({
                scheduledSyncSelectionMode: value as "all_active" | "selected"
              });
              this.display();
            })
        );

      if (this.plugin.getSettings().scheduledSyncSelectionMode === "selected") {
        const count = this.plugin.getSettings().scheduledCourseIds?.length || 0;
        new Setting(containerEl)
          .setName("Manage auto-sync courses")
          .setDesc(`${count} course(s) currently configured for auto-sync.`)
          .addButton((btn) =>
            btn.setButtonText("Select Courses...").onClick(() => {
              new CourseSelectModal(this.app, this.plugin).open();
            })
          );
      }

      new Setting(containerEl)
        .setName("Silent background sync")
        .setDesc("Sync silently in the background without pop-up notifications unless an error occurs.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.getSettings().silentScheduledSync ?? true).onChange((value) => {
            void this.plugin.updateSettings({ silentScheduledSync: value });
          })
        );

      const lastSync = this.plugin.getSettings().lastScheduledSyncTimestamp;
      const lastSyncText = lastSync ? new Date(lastSync).toLocaleString() : "Never";

      new Setting(containerEl)
        .setName("Run scheduled sync now")
        .setDesc(`Last background sync: ${lastSyncText}`)
        .addButton((btn) =>
          btn
            .setButtonText("Sync Now")
            .setCta()
            .onClick(async () => {
              await this.plugin.runScheduledSync(true);
              this.display();
            })
        );
    }

    new Setting(containerEl).setName("Asset downloads & attachments").setHeading();

    new Setting(containerEl)
      .setName("Download static assets")
      .setDesc("Download course attachments, documents, and images locally into the vault.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().downloadAssets).onChange((value) => {
          void this.plugin.updateSettings({ downloadAssets: value });
        })
      );

    new Setting(containerEl)
      .setName("Download documents")
      .setDesc("Preset for .pdf, .docx, .pptx, .xlsx, .txt, .csv, .rtf.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().downloadDocuments).onChange((value) => {
          void this.plugin.updateSettings({ downloadDocuments: value });
        })
      );

    new Setting(containerEl)
      .setName("Download images")
      .setDesc("Preset for .png, .jpg, .jpeg, .gif, .svg, .webp.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().downloadImages).onChange((value) => {
          void this.plugin.updateSettings({ downloadImages: value });
        })
      );

    new Setting(containerEl)
      .setName("Download archives & code")
      .setDesc("Preset for .zip, .tar, .py, .java, .cpp, .js, .ts, .ipynb.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().downloadArchivesAndCode).onChange((value) => {
          void this.plugin.updateSettings({ downloadArchivesAndCode: value });
        })
      );

    new Setting(containerEl)
      .setName("Download audio & video")
      .setDesc("Download audio and direct video files (can use significant vault storage).")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().downloadMedia).onChange((value) => {
          void this.plugin.updateSettings({ downloadMedia: value });
        })
      );

    new Setting(containerEl)
      .setName("Custom allowed extensions")
      .setDesc("Comma-separated list of allowed file extensions (e.g. 'pdf, docx, pptx, zip').")
      .addText((text) =>
        text
          .setPlaceholder("pdf, docx, pptx, xlsx, png, jpg, zip")
          .setValue(this.plugin.getSettings().allowedExtensions)
          .onChange((value) => {
            void this.plugin.updateSettings({ allowedExtensions: value });
          })
      );

    new Setting(containerEl)
      .setName("Max file size limit (MB)")
      .setDesc("Maximum size in megabytes for any single downloaded asset (prevents vault bloat).")
      .addText((text) =>
        text
          .setPlaceholder("50")
          .setValue(String(this.plugin.getSettings().maxAssetSizeMb))
          .onChange((value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed >= 1) {
              void this.plugin.updateSettings({ maxAssetSizeMb: parsed });
            }
          })
      );

    new Setting(containerEl)
      .setName("Store raw payload")
      .setDesc("Save incoming JSON payload for debugging.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().includeRawPayload).onChange((value) => {
          void this.plugin.updateSettings({ includeRawPayload: value });
        })
      );
  }
}
