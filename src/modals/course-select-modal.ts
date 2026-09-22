/**
 * @module modals/course-select-modal
 * @description Interactive course selection modal for filtering, selecting,
 * and batch-syncing Canvas LMS courses into the Obsidian vault.
 */

import { App, Modal, Notice, Setting } from "obsidian";
import type CanvasSyncBridgePlugin from "../main";
import type { CanvasCourseSummary } from "../types";

/**
 * Interactive modal allowing users to search, filter, select, and batch-sync Canvas courses.
 */
export class CourseSelectModal extends Modal {
  private plugin: CanvasSyncBridgePlugin;
  private courses: CanvasCourseSummary[] = [];
  private selectedCourseIds: Set<number> = new Set();
  private searchQuery = "";
  private filterStatus: "all" | "active" | "inactive" = "all";
  private includeInactive = true;
  private isLoading = true;
  private isSyncing = false;
  private syncStatusEl: HTMLElement | null = null;
  private courseListEl: HTMLElement | null = null;

  private scheduledInterval = 60;
  private enableAutoSync = false;

  /**
   * Creates a new CourseSelectModal instance.
   *
   * @param app - The Obsidian App instance.
   * @param plugin - Reference to the main CanvasSyncBridgePlugin.
   */
  constructor(app: App, plugin: CanvasSyncBridgePlugin) {
    super(app);
    this.plugin = plugin;
    this.includeInactive = this.plugin.getSettings().includeInactiveCourses ?? true;
    this.scheduledInterval = this.plugin.getSettings().scheduledSyncIntervalMinutes || 60;
    this.enableAutoSync = this.plugin.getSettings().enableScheduledSync ?? false;

    const configured = this.plugin.getSettings().scheduledCourseIds;
    if (Array.isArray(configured) && configured.length > 0) {
      configured.forEach((id) => this.selectedCourseIds.add(Number(id)));
    }
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("canvas-course-select-modal");

    contentEl.createEl("h2", { text: "Canvas course sync" });

    this.syncStatusEl = contentEl.createDiv("canvas-sync-status");

    if (!this.plugin.getSettings().canvasBaseUrl || !this.plugin.getSettings().canvasApiToken) {
      this.syncStatusEl.createEl("p", {
        text: "Please configure your Canvas base URL and API token in the plugin settings before syncing.",
        cls: "canvas-sync-error"
      });
      new Setting(contentEl).addButton((btn) =>
        btn
          .setButtonText("Close")
          .setCta()
          .onClick(() => this.close())
      );
      return;
    }

    this.renderLoading();
    await this.loadCourses();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private renderLoading(): void {
    if (this.syncStatusEl) {
      this.syncStatusEl.empty();
      this.syncStatusEl.createEl("p", {
        text: "Loading courses from Canvas...",
        cls: "canvas-sync-loading"
      });
    }
  }

  private async loadCourses(): Promise<void> {
    try {
      const client = this.plugin.getApiClient();
      this.courses = await client.listCourses({ includeInactive: this.includeInactive });
      this.isLoading = false;
      this.renderUI();
    } catch (err) {
      this.isLoading = false;
      const msg = err instanceof Error ? err.message : String(err);
      if (this.syncStatusEl) {
        this.syncStatusEl.empty();
        this.syncStatusEl.createEl("p", {
          text: `Failed to load courses: ${msg}`,
          cls: "canvas-sync-error"
        });
      }
    }
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Canvas course sync" });

    this.syncStatusEl = contentEl.createDiv("canvas-sync-status");

    // Search and filter toolbar
    const toolbar = contentEl.createDiv("canvas-modal-toolbar");

    const searchSetting = new Setting(toolbar)
      .setClass("canvas-search-filter-setting")
      .addSearch((search) =>
        search
          .setPlaceholder("Filter courses by name or code...")
          .setValue(this.searchQuery)
          .onChange((query) => {
            this.searchQuery = query;
            this.renderCourseList();
          })
      );

    searchSetting.addDropdown((dropdown) =>
      dropdown
        .addOption("all", "All courses")
        .addOption("active", "Active only")
        .addOption("inactive", "Past / concluded")
        .setValue(this.filterStatus)
        .onChange((val) => {
          this.filterStatus = val as "all" | "active" | "inactive";
          this.renderCourseList();
        })
    );

    // Select All / Deselect All actions
    const selectActions = toolbar.createDiv("canvas-select-actions");
    const selectAllBtn = selectActions.createEl("button", {
      text: "Select all visible",
      cls: "canvas-btn-sm"
    });
    selectAllBtn.addEventListener("click", () => {
      const visible = this.getFilteredCourses();
      visible.forEach((c) => this.selectedCourseIds.add(Number(c.id)));
      this.renderCourseList();
    });

    const deselectAllBtn = selectActions.createEl("button", {
      text: "Deselect all",
      cls: "canvas-btn-sm"
    });
    deselectAllBtn.addEventListener("click", () => {
      this.selectedCourseIds.clear();
      this.renderCourseList();
    });

    // Course list container
    this.courseListEl = contentEl.createDiv("canvas-course-list-container");
    this.renderCourseList();

    // Auto-sync schedule configuration in modal footer
    const autoSyncSection = contentEl.createDiv("canvas-modal-auto-sync");
    new Setting(autoSyncSection)
      .setName("Save as scheduled auto-sync selection")
      .setDesc("Use these selected courses for automated background sync.")
      .addToggle((toggle) =>
        toggle.setValue(this.enableAutoSync).onChange((val) => {
          this.enableAutoSync = val;
        })
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("15", "Every 15m")
          .addOption("30", "Every 30m")
          .addOption("60", "Every 1h")
          .addOption("120", "Every 2h")
          .addOption("240", "Every 4h")
          .addOption("360", "Every 6h")
          .addOption("720", "Every 12h")
          .addOption("1440", "Every 24h")
          .setValue(String(this.scheduledInterval))
          .onChange((val) => {
            this.scheduledInterval = Number.parseInt(val, 10) || 60;
          })
      );

    // Action buttons in modal footer
    const footer = contentEl.createDiv("canvas-modal-footer");

    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const syncBtn = footer.createEl("button", {
      text: "Sync selected courses",
      cls: "mod-cta"
    });
    syncBtn.addEventListener("click", () => {
      void this.executeSync();
    });
  }

  private getFilteredCourses(): CanvasCourseSummary[] {
    return this.courses.filter((course) => {
      const q = this.searchQuery.toLowerCase().trim();
      const name = (course.name || "").toLowerCase();
      const code = (course.course_code || "").toLowerCase();
      const matchesQuery = !q || name.includes(q) || code.includes(q);

      if (!matchesQuery) return false;

      const isConcluded =
        course.concluded ||
        course.workflow_state === "completed" ||
        (course.term?.end_at ? new Date(course.term.end_at).getTime() < Date.now() : false);

      if (this.filterStatus === "active") return !isConcluded;
      if (this.filterStatus === "inactive") return isConcluded;
      return true;
    });
  }

  private renderCourseList(): void {
    if (!this.courseListEl) return;
    this.courseListEl.empty();

    const filtered = this.getFilteredCourses();

    if (filtered.length === 0) {
      this.courseListEl.createEl("p", {
        text: "No courses match the current search or filter criteria.",
        cls: "canvas-no-courses"
      });
      return;
    }

    for (const course of filtered) {
      const courseId = Number(course.id);
      const isSelected = this.selectedCourseIds.has(courseId);

      const row = this.courseListEl.createDiv({
        cls: `canvas-course-row ${isSelected ? "is-selected" : ""}`
      });

      const checkboxWrap = row.createDiv("canvas-course-checkbox-wrap");
      const checkbox = checkboxWrap.createEl("input", { type: "checkbox", cls: "canvas-course-checkbox" });
      checkbox.checked = isSelected;
      checkbox.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          this.selectedCourseIds.add(courseId);
          row.addClass("is-selected");
        } else {
          this.selectedCourseIds.delete(courseId);
          row.removeClass("is-selected");
        }
      });

      const infoWrap = row.createDiv("canvas-course-info");
      const titleLine = infoWrap.createDiv("canvas-course-title-line");
      titleLine.createSpan({ text: course.name, cls: "canvas-course-name" });

      if (course.course_code) {
        titleLine.createSpan({ text: course.course_code, cls: "canvas-course-code-badge" });
      }

      const isConcluded =
        course.concluded ||
        course.workflow_state === "completed" ||
        (course.term?.end_at ? new Date(course.term.end_at).getTime() < Date.now() : false);
      titleLine.createSpan({
        text: isConcluded ? "Concluded" : "Active",
        cls: `canvas-status-badge ${isConcluded ? "status-inactive" : "status-active"}`
      });

      const metaLine = infoWrap.createDiv("canvas-course-meta-line");
      const metaParts: string[] = [];
      if (course.term?.name) {
        metaParts.push(`Term: ${course.term.name}`);
      }
      if (course.total_students !== undefined) {
        metaParts.push(`Students: ${course.total_students}`);
      }
      if (metaParts.length > 0) {
        metaLine.createSpan({ text: metaParts.join("  •  "), cls: "canvas-meta-item" });
      }
    }
  }

  private async executeSync(): Promise<void> {
    if (this.selectedCourseIds.size === 0) {
      new Notice("Please select at least one course to sync.");
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;

    // Save auto-sync preferences if toggle was modified
    if (this.enableAutoSync) {
      await this.plugin.updateSettings({
        enableScheduledSync: true,
        scheduledSyncIntervalMinutes: this.scheduledInterval,
        scheduledSyncSelectionMode: "selected",
        scheduledCourseIds: Array.from(this.selectedCourseIds)
      });
    }

    const selectedList = this.courses.filter((c) => this.selectedCourseIds.has(Number(c.id)));
    const total = selectedList.length;

    if (this.syncStatusEl) {
      this.syncStatusEl.empty();
      this.syncStatusEl.createEl("p", {
        text: `Starting sync for ${total} course(s)...`,
        cls: "canvas-sync-progress-header"
      });
    }

    let successCount = 0;
    for (let i = 0; i < total; i++) {
      const course = selectedList[i];
      if (this.syncStatusEl) {
        this.syncStatusEl.empty();
        this.syncStatusEl.createEl("p", {
          text: `[${i + 1}/${total}] Syncing ${course.name}...`,
          cls: "canvas-sync-progress-active"
        });
        const subProgress = this.syncStatusEl.createDiv("canvas-sync-step-progress");

        try {
          const result = await this.plugin.syncCourseById(course.id, (step, current, stepTotal) => {
            subProgress.empty();
            subProgress.createSpan({
              text: `${step} (${current}/${stepTotal})`,
              cls: "canvas-step-text"
            });
          });
          successCount++;
          const action = result?.isNew ? "Created" : "Updated";
          new Notice(`Canvas Sync: ${action} "${course.name}"`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to sync course ${course.name}:`, err);
          new Notice(`Canvas Sync failed for "${course.name}": ${msg}`, 8000);
        }
      }
    }

    this.isSyncing = false;
    new Notice(`Canvas Sync finished! ${successCount}/${total} courses synced successfully.`);
    this.close();
  }
}
