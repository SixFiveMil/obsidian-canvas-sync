/**
 * @module main
 * @description Main entry point and lifecycle coordinator for Canvas to Obsidian Sync.
 * Coordinates the REST API client, optional local HTTP bridge server, vault synchronization service,
 * recurring background scheduler, and the settings tab UI.
 */

import { Notice, Platform, Plugin } from "obsidian";
import { CanvasApiClient } from "./api";
import { CanvasBridgeServer } from "./bridge";
import { DEFAULT_SETTINGS, TRUSTED_CLIENT_HEADER } from "./constants";
import { CourseCapabilityModal, CourseSelectModal } from "./modals";
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
  renderSubHeaderDoc
} from "./renderers";
import { CanvasSyncSettingTab } from "./settings";
import { CanvasSyncScheduler, CanvasSyncService } from "./sync";
import type {
  CanvasAssignmentPayload,
  CanvasCoursePayload,
  CanvasDiscussionPayload,
  CanvasEventPayload,
  CanvasFileAssetPayload,
  CanvasModuleItemPayload,
  CanvasPagePayload,
  CanvasSyncSettings,
  CourseSyncResult
} from "./types";
import {
  createConfiguredTurndown,
  formatIsoDate,
  formatIsoTimestamp,
  formatYamlString,
  formatYamlValue,
  generateYamlFrontmatter
} from "./utils";

// Re-export public utilities, settings tab, and defaults for external consumers & unit tests
export {
  CanvasSyncSettingTab,
  DEFAULT_SETTINGS,
  formatIsoDate,
  formatIsoTimestamp,
  formatYamlString,
  formatYamlValue,
  generateYamlFrontmatter
};

/**
 * Primary Obsidian plugin class for Canvas to Obsidian Sync.
 */
export default class CanvasSyncBridgePlugin extends Plugin {
  public static readonly TRUSTED_CLIENT_HEADER = TRUSTED_CLIENT_HEADER;

  private settings: CanvasSyncSettings = DEFAULT_SETTINGS;
  private apiClient: CanvasApiClient | null = null;
  private bridgeServer: CanvasBridgeServer | null = null;
  private syncService: CanvasSyncService | null = null;
  private scheduler: CanvasSyncScheduler | null = null;

  /**
   * Plugin initialization lifecycle hook.
   * Loads settings, instantiates subsystems, binds commands, and registers UI components.
   */
  async onload(): Promise<void> {
    await this.loadSettings();
    this.initApiClient();
    this.initSyncService();
    this.initBridgeServer();
    this.initScheduler();

    // Start desktop bridge server if enabled
    if (this.settings.enableBridgeServer && !Platform.isMobile) {
      await this.startServer();
    }

    // Start background sync scheduler if enabled
    this.scheduler?.init();

    // Register multi-tab settings UI
    this.addSettingTab(new CanvasSyncSettingTab(this.app, this));

    // Ribbon icon for quick access to course selection modal
    this.addRibbonIcon("graduation-cap", "Canvas Sync: Select & Sync Courses", () => {
      new CourseSelectModal(this.app, this).open();
    });

    // Register Command Palette actions
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
      id: "canvas-sync-run-diagnostics",
      name: "Run course capability diagnostics",
      callback: () => {
        new CourseCapabilityModal(this.app, this).open();
      }
    });

    if (!Platform.isMobile) {
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
  }

  /**
   * Plugin teardown lifecycle hook.
   * Stops background interval timers and closes active network listeners.
   */
  onunload(): void {
    this.scheduler?.stop();
    void this.stopServer();
  }

  /**
   * Loads saved plugin configuration from Obsidian's data store.
   */
  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
  }

  /**
   * Persists current plugin settings to Obsidian's data store.
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Returns a copy of the current plugin configuration.
   */
  getSettings(): CanvasSyncSettings {
    return this.settings;
  }

  /**
   * Applies partial configuration updates, saves settings, and notifies active subsystems.
   */
  async updateSettings(patch: Partial<CanvasSyncSettings>): Promise<void> {
    const prevBridgeEnabled = this.settings.enableBridgeServer;
    const prevPort = this.settings.listenPort;
    const prevBaseUrl = this.settings.canvasBaseUrl;
    const prevApiToken = this.settings.canvasApiToken;
    const prevSchedEnabled = this.settings.enableScheduledSync;
    const prevSchedInterval = this.settings.scheduledSyncIntervalMinutes;

    this.settings = Object.assign({}, this.settings, patch);
    await this.saveSettings();

    // Propagate settings to child services
    this.syncService?.updateSettings(this.settings);
    this.bridgeServer?.updateSettings(this.settings);
    this.scheduler?.updateSettingsReference(this.settings);

    if (patch.canvasBaseUrl !== undefined && patch.canvasBaseUrl !== prevBaseUrl ||
        patch.canvasApiToken !== undefined && patch.canvasApiToken !== prevApiToken) {
      this.initApiClient();
    }

    if (patch.enableBridgeServer !== undefined && patch.enableBridgeServer !== prevBridgeEnabled ||
        patch.listenPort !== undefined && patch.listenPort !== prevPort) {
      if (this.settings.enableBridgeServer && !Platform.isMobile) {
        await this.restartServer();
      } else {
        await this.stopServer();
      }
    }

    if (
      (patch.enableScheduledSync !== undefined && patch.enableScheduledSync !== prevSchedEnabled) ||
      (patch.scheduledSyncIntervalMinutes !== undefined && patch.scheduledSyncIntervalMinutes !== prevSchedInterval)
    ) {
      this.scheduler?.restart();
    }
  }

  /**
   * Initializes the Canvas REST API client with current configuration.
   */
  public initApiClient(): void {
    this.apiClient = new CanvasApiClient(this.settings.canvasBaseUrl, this.settings.canvasApiToken);
  }

  /**
   * Returns the active Canvas REST API client instance.
   */
  public getApiClient(): CanvasApiClient {
    if (!this.apiClient) {
      this.initApiClient();
    }
    return this.apiClient!;
  }

  /**
   * Initializes the vault synchronization service.
   */
  private initSyncService(): void {
    this.syncService = new CanvasSyncService(this.app, this.settings, () => this.getApiClient());
  }

  /**
   * Initializes the desktop companion extension bridge listener.
   */
  private initBridgeServer(): void {
    this.bridgeServer = new CanvasBridgeServer(this.settings, async (payload, source) => {
      return await this.syncCoursePayload(payload, undefined, source);
    });
  }

  /**
   * Initializes the recurring background sync scheduler.
   */
  private initScheduler(): void {
    this.scheduler = new CanvasSyncScheduler(
      this.settings,
      () => this.getApiClient(),
      async (courseId) => await this.syncCourseById(courseId),
      async (patch) => await this.updateSettings(patch),
      (id) => this.registerInterval(id)
    );
  }

  // ---------------------------------------------------------------------------
  // Bridge Server Delegation
  // ---------------------------------------------------------------------------

  public async startServer(): Promise<void> {
    await this.bridgeServer?.start();
  }

  public async stopServer(): Promise<void> {
    await this.bridgeServer?.stop();
  }

  public async restartServer(): Promise<void> {
    await this.bridgeServer?.restart();
  }

  // ---------------------------------------------------------------------------
  // Sync Service Delegation
  // ---------------------------------------------------------------------------

  public async syncAllCourses(): Promise<void> {
    if (!this.syncService) this.initSyncService();
    await this.syncService!.syncAllCourses();
  }

  public async syncCourseById(
    courseId: string | number,
    onProgress?: (step: string, current: number, total: number) => void
  ): Promise<CourseSyncResult> {
    if (!this.syncService) this.initSyncService();
    return await this.syncService!.syncCourseById(courseId, onProgress);
  }

  public async syncCoursePayload(
    payload: CanvasCoursePayload,
    onProgress?: (step: string, current: number, total: number) => void,
    syncSource: "api" | "browser-extension" = "api"
  ): Promise<CourseSyncResult> {
    if (!this.syncService) this.initSyncService();
    return await this.syncService!.syncCoursePayload(payload, onProgress, syncSource);
  }

  public async upsertFile(
    path: string,
    content: string,
    preserveUserNotes = this.settings.preservePersonalNotes
  ): Promise<void> {
    if (!this.syncService) this.initSyncService();
    await this.syncService!.upsertFile(path, content, preserveUserNotes);
  }

  // ---------------------------------------------------------------------------
  // Background Scheduler Delegation
  // ---------------------------------------------------------------------------

  public initBackgroundSyncScheduler(): void {
    this.scheduler?.init();
  }

  public stopBackgroundSyncScheduler(): void {
    this.scheduler?.stop();
  }

  public restartBackgroundSyncScheduler(): void {
    this.scheduler?.restart();
  }

  public async runScheduledSync(isManual = false): Promise<void> {
    await this.scheduler?.runScheduledSync(isManual);
  }

  // ---------------------------------------------------------------------------
  // Markdown Rendering Delegates (For backwards compatibility and unit tests)
  // ---------------------------------------------------------------------------

  private getTurndown(): import("turndown") {
    return createConfiguredTurndown();
  }

  private renderCourseIndex(
    payload: CanvasCoursePayload,
    announcementMap?: Map<string, { relativePath: string; title: string }>
  ): string {
    return renderCourseIndex(payload, this.settings, announcementMap);
  }

  private renderAnnouncementDoc(
    announcement: CanvasDiscussionPayload,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload,
    fileMap?: Map<string, { relativePath: string; displayName: string }>
  ): string {
    return renderAnnouncementDoc(
      this.getTurndown(),
      announcement,
      lastSynced,
      coursePayload,
      fileMap,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderAnnouncementsHub(
    announcementsOrPayload: CanvasDiscussionPayload[] | CanvasCoursePayload,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload,
    announcementMap?: Map<string, { relativePath: string; title: string }>
  ): string {
    return renderAnnouncementsHub(
      announcementsOrPayload,
      lastSynced,
      coursePayload,
      announcementMap,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderModuleAssignmentDoc(
    item: CanvasModuleItemPayload,
    assignment?: CanvasAssignmentPayload,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    fileMap?: Map<string, { relativePath: string; displayName: string }>,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): string {
    return renderModuleAssignmentDoc(
      this.getTurndown(),
      item,
      assignment,
      moduleByName,
      fileMap,
      lastSynced,
      coursePayload,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderModuleDiscussionDoc(
    item: CanvasModuleItemPayload,
    discussion?: CanvasDiscussionPayload,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    fileMap?: Map<string, { relativePath: string; displayName: string }>,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): string {
    return renderModuleDiscussionDoc(
      this.getTurndown(),
      item,
      discussion,
      moduleByName,
      fileMap,
      lastSynced,
      coursePayload,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderModulePageDoc(
    item: CanvasModuleItemPayload,
    page?: CanvasPagePayload,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): string {
    return renderModulePageDoc(
      this.getTurndown(),
      item,
      page,
      moduleByName,
      lastSynced,
      coursePayload,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderModuleFileDoc(
    item: CanvasModuleItemPayload,
    file?: CanvasFileAssetPayload,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): string {
    return renderModuleFileDoc(
      item,
      file,
      lastSynced,
      coursePayload,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderModuleLinkDoc(
    item: CanvasModuleItemPayload,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): string {
    return renderModuleLinkDoc(
      item,
      lastSynced,
      coursePayload,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderSubHeaderDoc(
    item: CanvasModuleItemPayload,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): string {
    return renderSubHeaderDoc(
      item,
      lastSynced,
      coursePayload,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderAssignments(
    assignmentsOrPayload: CanvasAssignmentPayload[] | CanvasCoursePayload,
    assignmentMap?: Map<string, { relativePath: string; title: string }>,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    fileMap?: Map<string, { relativePath: string; displayName: string }>,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): string {
    return renderAssignments(
      assignmentsOrPayload,
      assignmentMap,
      moduleByName,
      fileMap,
      lastSynced,
      coursePayload,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderGradesPage(
    payload: CanvasCoursePayload,
    assignmentMap?: Map<string, { relativePath: string; title: string }>,
    moduleByName?: Map<string, { relativePath: string; title: string }>
  ): string {
    return renderGradesPage(
      payload,
      assignmentMap,
      moduleByName,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderDiscussions(
    discussionsOrPayload: CanvasDiscussionPayload[] | CanvasCoursePayload,
    discussionMap?: Map<string, { relativePath: string; title: string }>,
    moduleByName?: Map<string, { relativePath: string; title: string }>,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): string {
    return renderDiscussions(
      discussionsOrPayload,
      discussionMap,
      moduleByName,
      lastSynced,
      coursePayload,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderEvents(
    eventsOrPayload: CanvasEventPayload[] | CanvasCoursePayload,
    assignmentMap?: Map<string, { relativePath: string; title: string }>,
    lastSynced?: string,
    coursePayload?: CanvasCoursePayload
  ): string {
    return renderEvents(
      this.getTurndown(),
      eventsOrPayload,
      assignmentMap,
      lastSynced,
      coursePayload,
      this.settings.enableYamlFrontmatter
    );
  }

  private renderHtmlDoc(
    title: string,
    html: string,
    lastSynced?: string,
    extraProps?: Record<string, unknown>,
    prependCallout?: string
  ): string {
    return renderHtmlDoc(
      this.getTurndown(),
      title,
      html,
      lastSynced,
      extraProps,
      prependCallout,
      this.settings.enableYamlFrontmatter
    );
  }
}
