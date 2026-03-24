import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type {
  CanvasAssignmentPayload,
  CanvasDiscussionPayload,
  CanvasEventPayload,
  CanvasModuleItemPayload,
  CanvasModulePayload,
  CanvasPagePayload,
  CanvasRubricCriterionPayload,
  CanvasSyncEnvelope
} from "./types";

interface CanvasSyncSettings {
  listenPort: number;
  rootFolder: string;
  includeRawPayload: boolean;
}

const DEFAULT_SETTINGS: CanvasSyncSettings = {
  listenPort: 27125,
  rootFolder: "Canvas",
  includeRawPayload: false
};

export default class CanvasSyncBridgePlugin extends Plugin {
  private settings: CanvasSyncSettings = DEFAULT_SETTINGS;
  private server: ReturnType<typeof createServer> | null = null;
  private turndown = this.createTurndown();

  private createTurndown(): TurndownService {
    const service = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    service.use(gfm);
    return service;
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new CanvasSyncSettingTab(this.app, this));
    await this.startServer();

    this.addCommand({
      id: "canvas-sync-restart-server",
      name: "Restart Canvas Sync Bridge server",
      callback: async () => {
        await this.restartServer();
        new Notice(`Canvas Sync Bridge listening on localhost:${this.settings.listenPort}`);
      }
    });
  }

  async onunload(): Promise<void> {
    await this.stopServer();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getSettings(): CanvasSyncSettings {
    return this.settings;
  }

  async updateSettings(patch: Partial<CanvasSyncSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    await this.saveSettings();
  }

  async restartServer(): Promise<void> {
    await this.stopServer();
    await this.startServer();
  }

  private async startServer(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.settings.listenPort, "127.0.0.1", () => {
        this.server?.off("error", reject);
        resolve();
      });
    });
  }

  private async stopServer(): Promise<void> {
    if (!this.server) {
      return;
    }

    const current = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      current.close((err?: Error) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/canvas-sync") {
      res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: false, message: "Not found" }));
      return;
    }

    try {
      const envelope = await this.readJsonBody<CanvasSyncEnvelope>(req);
      this.validateEnvelope(envelope);
      await this.syncCourse(envelope);

      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: true }));
      new Notice(`Canvas sync complete: ${envelope.payload.courseName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: false, message }));
      new Notice(`Canvas sync failed: ${message}`);
      console.error("Canvas sync error", error);
    }
  }

  private async readJsonBody<T>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of req) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += part.length;
      if (size > 5 * 1024 * 1024) {
        throw new Error("Payload too large. Limit is 5 MB.");
      }
      chunks.push(part);
    }

    const body = Buffer.concat(chunks).toString("utf-8");
    if (!body) {
      throw new Error("Empty request body.");
    }

    return JSON.parse(body) as T;
  }

  private validateEnvelope(envelope: CanvasSyncEnvelope): void {
    if (!envelope || envelope.source !== "canvas-browser-extension") {
      throw new Error("Unexpected payload source.");
    }

    if (envelope.version !== "1") {
      throw new Error("Unsupported payload version.");
    }

    if (!envelope.payload?.courseId || !envelope.payload?.courseName) {
      throw new Error("Missing required course metadata.");
    }
  }

  private async syncCourse(envelope: CanvasSyncEnvelope): Promise<void> {
    const { payload } = envelope;
    const courseFolder = normalizePath(
      `${this.settings.rootFolder}/${this.sanitizeFileName(payload.courseName)} (${payload.courseId})`
    );

    await this.ensureFolder(courseFolder);

    if (payload.courseHomePageHtml) {
      const homePath = normalizePath(`${courseFolder}/Home.md`);
      await this.upsertFile(homePath, this.renderHtmlDoc("Course Home", payload.courseHomePageHtml) + "\n");
    }

    if (payload.syllabusHtml) {
      const syllabusPath = normalizePath(`${courseFolder}/Syllabus.md`);
      await this.upsertFile(syllabusPath, this.renderHtmlDoc("Syllabus", payload.syllabusHtml) + "\n");
    }

    const pageBySlug = new Map<string, CanvasPagePayload>();
    const pageByTitle = new Map<string, CanvasPagePayload>();
    for (const page of payload.pages) {
      if (page.slug) {
        pageBySlug.set(page.slug, page);
      }
      const key = page.title.trim().toLowerCase();
      if (key && !pageByTitle.has(key)) {
        pageByTitle.set(key, page);
      }
    }

    const assignmentById = new Map<string, CanvasAssignmentPayload>(payload.assignments.map((a) => [a.id, a]));
    const discussionById = new Map<string, CanvasDiscussionPayload>(payload.discussions.map((d) => [d.id, d]));

    const modulesFolder = normalizePath(`${courseFolder}/Modules`);
    await this.ensureFolder(modulesFolder);

    const modules = [...payload.modules].sort((a, b) => a.position - b.position);
    for (const module of modules) {
      await this.writeModuleFolder(modulesFolder, module, pageBySlug, pageByTitle, assignmentById, discussionById);
    }

    const tasksPath = normalizePath(`${courseFolder}/Tasks.md`);
    await this.upsertFile(tasksPath, this.renderAssignments(payload.assignments));

    const discussionsPath = normalizePath(`${courseFolder}/Discussions.md`);
    await this.upsertFile(discussionsPath, this.renderDiscussions(payload.discussions));

    const eventsPath = normalizePath(`${courseFolder}/Calendar.md`);
    await this.upsertFile(eventsPath, this.renderEvents(payload.events));

    const courseIndexPath = normalizePath(`${courseFolder}/Course.md`);
    const indexDoc = [
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
      "- Events are in ./Calendar.md"
    ].join("\n");
    await this.upsertFile(courseIndexPath, indexDoc + "\n");

    if (this.settings.includeRawPayload) {
      const rawPath = normalizePath(`${courseFolder}/Raw Payload.json`);
      await this.upsertFile(rawPath, JSON.stringify(payload, null, 2) + "\n");
    }
  }

  private async writeModuleFolder(
    modulesFolder: string,
    module: CanvasModulePayload,
    pageBySlug: Map<string, CanvasPagePayload>,
    pageByTitle: Map<string, CanvasPagePayload>,
    assignmentById: Map<string, CanvasAssignmentPayload>,
    discussionById: Map<string, CanvasDiscussionPayload>
  ): Promise<void> {
    const moduleFolder = normalizePath(`${modulesFolder}/${this.padPosition(module.position)} - ${this.sanitizeFileName(module.name)}`);
    await this.ensureFolder(moduleFolder);

    if (module.summaryHtml) {
      const moduleHomePath = normalizePath(`${moduleFolder}/00 - Module Home.md`);
      await this.upsertFile(moduleHomePath, this.renderHtmlDoc(module.name, module.summaryHtml) + "\n");
    }

    const items = [...module.items].sort((a, b) => a.position - b.position);
    for (const item of items) {
      const filePrefix = this.padPosition(item.position);
      const safeTitle = this.sanitizeFileName(item.title || `${item.type} Item`);

      if (item.type === "WikiPage") {
        const page =
          (item.pageSlug ? pageBySlug.get(item.pageSlug) : undefined) || pageByTitle.get(item.title.trim().toLowerCase());
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
    const markdown = this.turndown.turndown(html || "").trim();
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

    const pageBody = this.turndown.turndown(page.html || "").trim();
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
      typeof assignment.descriptionHtml === "string" && /class=["'][^"']*\brubric_table\b/.test(assignment.descriptionHtml);

    return [
      `# ${assignment.name}`,
      "",
      `Assignment ID: ${assignment.id}`,
      `Due: ${due}`,
      `Points: ${points}`,
      assignment.moduleNames && assignment.moduleNames.length > 0 ? `Modules: ${assignment.moduleNames.join(", ")}` : null,
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
        return [title, "", tableHtml.trim()].join("\n");
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
          const details = (rating.longDescription || "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
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
      discussion.moduleNames && discussion.moduleNames.length > 0 ? `Modules: ${discussion.moduleNames.join(", ")}` : null,
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

    const sorted = [...assignments].sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));
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

    const sorted = [...events].sort((a, b) => (a.startAt || "").localeCompare(b.startAt || ""));
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

    if (await this.app.vault.adapter.exists(path)) {
      return;
    }

    const segments = path.split("/");
    let cursor = "";
    for (const segment of segments) {
      cursor = cursor ? `${cursor}/${segment}` : segment;
      if (!(await this.app.vault.adapter.exists(cursor))) {
        await this.app.vault.createFolder(cursor);
      }
    }
  }

  private async upsertFile(path: string, content: string): Promise<void> {
    const parent = path.split("/").slice(0, -1).join("/");
    await this.ensureFolder(parent);

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return;
    }

    await this.app.vault.create(path, content);
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

    new Setting(containerEl)
      .setName("Listen Port")
      .setDesc("Localhost port that receives data from the browser extension.")
      .addText((text) =>
        text
          .setPlaceholder("27124")
          .setValue(String(this.plugin.getSettings().listenPort))
          .onChange(async (value) => {
            const next = Number.parseInt(value, 10);
            if (!Number.isFinite(next) || next < 1 || next > 65535) {
              return;
            }
            await this.plugin.updateSettings({ listenPort: next });
            await this.plugin.restartServer();
          })
      );

    new Setting(containerEl)
      .setName("Root Folder")
      .setDesc("Vault folder where course data should be written.")
      .addText((text) =>
        text
          .setPlaceholder("Canvas")
          .setValue(this.plugin.getSettings().rootFolder)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ rootFolder: value.trim() || "Canvas" });
          })
      );

    new Setting(containerEl)
      .setName("Store Raw Payload")
      .setDesc("Save incoming JSON payload for debugging.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getSettings().includeRawPayload).onChange(async (value) => {
          await this.plugin.updateSettings({ includeRawPayload: value });
        })
      );
  }
}
