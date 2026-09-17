import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";
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

export const DEFAULT_SETTINGS: CanvasSyncSettings = {
  canvasBaseUrl: "",
  canvasApiToken: "",
  includeInactiveCourses: true,
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
  attachmentsSubfolder: "Attachments"
};

export default class CanvasSyncBridgePlugin extends Plugin {
  private settings: CanvasSyncSettings = DEFAULT_SETTINGS;
  private apiClient: CanvasApiClient | null = null;
  private turndown: TurndownService = createConfiguredTurndown();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.initApiClient();

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
  }

  onunload(): void {
    this.apiClient = null;
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
    this.settings = { ...this.settings, ...patch };
    await this.saveSettings();
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
        await this.syncCourseById(course.id);
        new Notice(`Synced: ${course.name}`);
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
  ): Promise<void> {
    const client = this.getApiClient();
    const payload = await client.fetchCompleteCoursePayload(courseId, onProgress);
    await this.syncCoursePayload(payload, onProgress);
  }

  public async syncCoursePayload(
    payload: CanvasCoursePayload,
    onProgress?: (step: string, current: number, total: number) => void
  ): Promise<void> {
    const subfolder = formatCourseFolderName(this.settings.courseFolderTemplate, payload);
    const courseFolder = normalizePath(`${this.settings.rootFolder}/${subfolder}`);

    await this.ensureFolder(courseFolder);

    const documentsSubfolder = this.settings.documentsSubfolder || "Files";
    const attachmentsSubfolder = this.settings.attachmentsSubfolder || "Attachments";
    const filesFolder = normalizePath(`${courseFolder}/${documentsSubfolder}`);
    const attachmentsFolder = normalizePath(`${courseFolder}/${attachmentsSubfolder}`);

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

    for (const page of payload.pages) {
      const safeTitle = this.sanitizeFileName(page.title || "Untitled Page");
      const relativePagePath =
        page.moduleNames && page.moduleNames.length > 0
          ? `Modules/${this.sanitizeFileName(page.moduleNames[0])}/Page - ${safeTitle}.md`
          : `Pages/${safeTitle}.md`;

      if (page.slug) {
        pageBySlug.set(page.slug, page);
        pageMap.set(page.slug, { relativePath: relativePagePath, title: page.title });
      }
      const key = page.title.trim().toLowerCase();
      if (key && !pageByTitle.has(key)) {
        pageByTitle.set(key, page);
        pageMap.set(key, { relativePath: relativePagePath, title: page.title });
      }
    }

    const assignmentById = new Map<string, CanvasAssignmentPayload>(payload.assignments.map((a) => [a.id, a]));
    const assignmentMap = new Map<string, { relativePath: string; title: string }>();
    for (const assignment of payload.assignments) {
      const safeTitle = this.sanitizeFileName(assignment.name || "Untitled Assignment");
      const relativeAssignmentPath =
        assignment.moduleNames && assignment.moduleNames.length > 0
          ? `Modules/${this.sanitizeFileName(assignment.moduleNames[0])}/Assignment - ${safeTitle}.md`
          : `Tasks.md#${safeTitle}`;
      assignmentMap.set(assignment.id, { relativePath: relativeAssignmentPath, title: assignment.name });
    }

    const discussionById = new Map<string, CanvasDiscussionPayload>(payload.discussions.map((d) => [d.id, d]));
    const discussionMap = new Map<string, { relativePath: string; title: string }>();
    for (const discussion of payload.discussions) {
      const safeTitle = this.sanitizeFileName(discussion.title || "Untitled Discussion");
      const relativeDiscussionPath =
        discussion.moduleNames && discussion.moduleNames.length > 0
          ? `Modules/${this.sanitizeFileName(discussion.moduleNames[0])}/Discussion - ${safeTitle}.md`
          : `Discussions.md#${safeTitle}`;
      discussionMap.set(discussion.id, { relativePath: relativeDiscussionPath, title: discussion.title });
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

    const moduleMap = new Map<string, { relativePath: string; title: string }>();
    for (const module of payload.modules) {
      const safeModuleName = this.sanitizeFileName(module.name || `Module ${module.id}`);
      const moduleFolderName = `${this.padPosition(module.position)} - ${safeModuleName}`;
      const relativeModulePath = `Modules/${moduleFolderName}/00 - Module Overview.md`;
      moduleMap.set(module.id, { relativePath: relativeModulePath, title: module.name });
    }

    const specialRouteMap = new Map<string, { relativePath: string; title: string }>([
      ["syllabus", { relativePath: "Syllabus.md", title: "Syllabus" }],
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
    }

    if (payload.syllabusHtml) {
      const syllabusPath = normalizePath(`${courseFolder}/Syllabus.md`);
      await this.upsertFile(syllabusPath, this.renderHtmlDoc("Syllabus", payload.syllabusHtml) + "\n");
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
        fileById
      );
    }

    const tasksPath = normalizePath(`${courseFolder}/Tasks.md`);
    await this.upsertFile(tasksPath, this.renderAssignments(payload.assignments));

    const discussionsPath = normalizePath(`${courseFolder}/Discussions.md`);
    await this.upsertFile(discussionsPath, this.renderDiscussions(payload.discussions));

    const eventsPath = normalizePath(`${courseFolder}/Calendar.md`);
    await this.upsertFile(eventsPath, this.renderEvents(payload.events));

    const courseIndexPath = normalizePath(`${courseFolder}/Course.md`);
    const indexDoc = this.renderCourseIndex(payload);
    await this.upsertFile(courseIndexPath, indexDoc + "\n");

    if (this.settings.includeRawPayload) {
      const rawPath = normalizePath(`${courseFolder}/Raw Payload.json`);
      await this.upsertFile(rawPath, JSON.stringify(payload, null, 2) + "\n");
    }
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
      "- Assignment checklist is in ./Tasks.md",
      "- Discussion summary is in ./Discussions.md",
      "- Events are in ./Calendar.md",
      `- Downloaded static documents are in ./${this.settings.documentsSubfolder || "Files"}`
    ];

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
    fileById: Map<string, CanvasFileAssetPayload>
  ): Promise<void> {
    const moduleFolder = normalizePath(
      `${modulesFolder}/${this.padPosition(module.position)} - ${this.sanitizeFileName(module.name)}`
    );
    const moduleOverviewPath = normalizePath(`${moduleFolder}/00 - Module Overview.md`);
    const items = [...module.items].sort((a, b) => a.position - b.position);

    if (module.summaryHtml) {
      await this.upsertFile(moduleOverviewPath, this.renderHtmlDoc(module.name, module.summaryHtml) + "\n");
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
    }

    for (const item of items) {
      const filePrefix = this.padPosition(item.position);
      const safeTitle = this.sanitizeFileName(item.title || `${item.type} Item`);

      if (item.type === "WikiPage") {
        const page =
          (item.pageSlug ? pageBySlug.get(item.pageSlug) : undefined) ||
          pageByTitle.get(item.title.trim().toLowerCase());
        const pagePath = normalizePath(`${moduleFolder}/${filePrefix} - Page - ${safeTitle}.md`);
        await this.upsertFile(pagePath, this.renderModulePageDoc(item, page));
        continue;
      }

      if (item.type === "Assignment") {
        const assignment = item.assignmentId ? assignmentById.get(item.assignmentId) : undefined;
        const assignmentPath = normalizePath(`${moduleFolder}/${filePrefix} - Assignment - ${safeTitle}.md`);
        await this.upsertFile(assignmentPath, this.renderModuleAssignmentDoc(item, assignment));
        continue;
      }

      if (item.type === "DiscussionTopic") {
        const discussion = item.discussionId ? discussionById.get(item.discussionId) : undefined;
        const discussionPath = normalizePath(`${moduleFolder}/${filePrefix} - Discussion - ${safeTitle}.md`);
        await this.upsertFile(discussionPath, this.renderModuleDiscussionDoc(item, discussion));
        continue;
      }

      if (item.type === "File") {
        const file = item.fileId ? fileById.get(item.fileId) : undefined;
        const filePath = normalizePath(`${moduleFolder}/${filePrefix} - File - ${safeTitle}.md`);
        await this.upsertFile(filePath, this.renderModuleFileDoc(item, file));
        continue;
      }

      if (item.type === "ExternalUrl" || item.type === "ContextExternalTool") {
        const linkPath = normalizePath(`${moduleFolder}/${filePrefix} - Link - ${safeTitle}.md`);
        await this.upsertFile(linkPath, this.renderModuleLinkDoc(item));
        continue;
      }

      if (item.type === "ContextModuleSubHeader") {
        const subHeaderPath = normalizePath(`${moduleFolder}/${filePrefix} - Section - ${safeTitle}.md`);
        await this.upsertFile(subHeaderPath, this.renderSubHeaderDoc(item));
        continue;
      }
    }
  }

  private renderHtmlDoc(title: string, html: string): string {
    const markdown = this.turndown.turndown(html).trim();
    return [`# ${title}`, "", markdown || "No content available."].join("\n");
  }

  private renderModulePageDoc(item: CanvasModuleItemPayload, page?: CanvasPagePayload): string {
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
    return [
      `# ${page.title}`,
      "",
      `Source: ${page.url}`,
      page.updatedAt ? `Updated: ${page.updatedAt}` : null,
      page.moduleNames && page.moduleNames.length > 0 ? `Modules: ${page.moduleNames.join(", ")}` : null,
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

  private renderModuleAssignmentDoc(item: CanvasModuleItemPayload, assignment?: CanvasAssignmentPayload): string {
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
    const structuredRubric = this.renderStructuredRubric(assignment.rubric);
    const hasRubricTableInHtml =
      typeof assignment.descriptionHtml === "string" &&
      /class=["'][^"']*\brubric_table\b/.test(assignment.descriptionHtml);

    return [
      `# ${assignment.name}`,
      "",
      `Assignment ID: ${assignment.id}`,
      `Due: ${due}`,
      `Points: ${points}`,
      assignment.moduleNames && assignment.moduleNames.length > 0
        ? `Modules: ${assignment.moduleNames.join(", ")}`
        : null,
      assignment.htmlUrl ? `Source: ${assignment.htmlUrl}` : null,
      "",
      "## Description",
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

  private renderStructuredRubric(rubric?: CanvasRubricCriterionPayload[]): string {
    if (!rubric || rubric.length === 0) {
      return "";
    }

    const lines: string[] = ["## Rubric (Structured API)", ""];
    for (const criterion of rubric) {
      lines.push(`### ${criterion.description}`);
      lines.push("");
      lines.push(`- Criterion Points: ${criterion.points}`);
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

  private renderModuleDiscussionDoc(item: CanvasModuleItemPayload, discussion?: CanvasDiscussionPayload): string {
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

    const discussionBody = discussion.messageHtml ? this.turndown.turndown(discussion.messageHtml).trim() : "";

    return [
      `# ${discussion.title}`,
      "",
      `Discussion ID: ${discussion.id}`,
      discussion.postedAt ? `Posted: ${discussion.postedAt}` : null,
      discussion.updatedAt ? `Updated: ${discussion.updatedAt}` : null,
      discussion.moduleNames && discussion.moduleNames.length > 0
        ? `Modules: ${discussion.moduleNames.join(", ")}`
        : null,
      discussion.htmlUrl ? `Source: ${discussion.htmlUrl}` : null,
      "",
      "## Body",
      "",
      discussionBody || "No discussion body available."
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

  private renderAssignments(assignments: CanvasAssignmentPayload[]): string {
    const lines: string[] = ["# Tasks", ""];

    if (assignments.length === 0) {
      lines.push("No assignments were found in this sync.", "");
      return lines.join("\n");
    }

    const sorted = [...assignments].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    for (const assignment of sorted) {
      const due = assignment.dueAt ? new Date(assignment.dueAt).toISOString().slice(0, 10) : "No due date";
      const points = assignment.pointsPossible ?? "?";
      lines.push(`- [ ] ${assignment.name} (due: ${due}, points: ${points})`);
      if (assignment.moduleNames && assignment.moduleNames.length > 0) {
        lines.push(`  - Modules: ${assignment.moduleNames.join(", ")}`);
      }
      if (assignment.htmlUrl) {
        lines.push(`  - Link: ${assignment.htmlUrl}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private renderDiscussions(discussions: CanvasDiscussionPayload[]): string {
    const lines: string[] = ["# Discussions", ""];

    if (discussions.length === 0) {
      lines.push("No discussions were found in this sync.", "");
      return lines.join("\n");
    }

    const sorted = [...discussions].sort((a, b) => a.title.localeCompare(b.title));
    for (const discussion of sorted) {
      lines.push(`- ${discussion.title}`);
      if (discussion.moduleNames && discussion.moduleNames.length > 0) {
        lines.push(`  - Modules: ${discussion.moduleNames.join(", ")}`);
      }
      if (discussion.htmlUrl) {
        lines.push(`  - Link: ${discussion.htmlUrl}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private renderEvents(events: CanvasEventPayload[]): string {
    const lines: string[] = ["# Events", ""];

    if (events.length === 0) {
      lines.push("No events were found in this sync.", "");
      return lines.join("\n");
    }

    const sorted = [...events].sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
    for (const event of sorted) {
      const start = event.startAt ? new Date(event.startAt).toISOString() : "Unknown start";
      const end = event.endAt ? new Date(event.endAt).toISOString() : "Unknown end";
      lines.push(`- ${event.title}`);
      lines.push(`  - Start: ${start}`);
      lines.push(`  - End: ${end}`);
      if (event.htmlUrl) {
        lines.push(`  - Link: ${event.htmlUrl}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private async ensureFolder(path: string): Promise<void> {
    if (path === "" || path === "/") {
      return;
    }

    if (this.app.vault.getAbstractFileByPath(path)) {
      return;
    }

    const segments = path.split("/");
    let cursor = "";
    for (const segment of segments) {
      cursor = cursor ? `${cursor}/${segment}` : segment;
      if (!this.app.vault.getAbstractFileByPath(cursor)) {
        await this.app.vault.createFolder(cursor);
      }
    }
  }

  private async upsertFile(path: string, content: string): Promise<void> {
    const parent = path.split("/").slice(0, -1).join("/");
    await this.ensureFolder(parent);

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.process(existing, () => content);
      return;
    }

    await this.app.vault.create(path, content);
  }

  private async upsertArrayBufferFile(path: string, arrayBuffer: ArrayBuffer): Promise<void> {
    const parent = path.split("/").slice(0, -1).join("/");
    await this.ensureFolder(parent);

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, arrayBuffer);
      return;
    }

    await this.app.vault.createBinary(path, arrayBuffer);
  }

  private padPosition(position: number): string {
    return String(position).padStart(2, "0");
  }

  private sanitizeFileName(input: string): string {
    return input.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Untitled";
  }
}

class CanvasSyncSettingTab extends PluginSettingTab {
  plugin: CanvasSyncBridgePlugin;

  constructor(app: App, plugin: CanvasSyncBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Canvas API Integration" });

    new Setting(containerEl)
      .setName("Canvas base URL")
      .setDesc("The web address of your Canvas institution (e.g. 'https://sandiego.instructure.com' or 'https://canvas.instructure.com').")
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

    let isMasked = true;
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

    const statusContainer = containerEl.createDiv("canvas-connection-status");
    statusContainer.style.margin = "10px 0 20px 0";

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Verify that your Canvas URL and API Token are valid.")
      .addButton((btn) =>
        btn
          .setButtonText("Test Connection")
          .setCta()
          .onClick(async () => {
            statusContainer.empty();
            statusContainer.createEl("span", { text: "Testing connection...", cls: "canvas-status-testing" });
            try {
              const client = this.plugin.getApiClient();
              const user = await client.testConnection();
              statusContainer.empty();
              const successEl = statusContainer.createEl("div");
              successEl.style.color = "var(--text-success)";
              successEl.style.fontWeight = "bold";
              successEl.setText(`✅ Successfully connected as: ${user.name || "Canvas User"} (User ID: ${user.id})`);
            } catch (error) {
              statusContainer.empty();
              const errorEl = statusContainer.createEl("div");
              errorEl.style.color = "var(--text-error)";
              errorEl.setText(`❌ Connection failed: ${error instanceof Error ? error.message : String(error)}`);
            }
          })
      );

    containerEl.createEl("h2", { text: "Vault & Organization" });

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

    containerEl.createEl("h2", { text: "Asset Downloads & Attachments" });

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
