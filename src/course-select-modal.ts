import { App, Modal, Notice, Setting } from "obsidian";
import type CanvasSyncBridgePlugin from "./main";
import type { CanvasCourseSummary } from "./types";

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

  constructor(app: App, plugin: CanvasSyncBridgePlugin) {
    super(app);
    this.plugin = plugin;
    this.includeInactive = this.plugin.getSettings().includeInactiveCourses ?? true;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("canvas-course-select-modal");

    contentEl.createEl("h2", { text: "Canvas Course Sync" });

    this.syncStatusEl = contentEl.createDiv("canvas-sync-status");

    if (!this.plugin.getSettings().canvasBaseUrl || !this.plugin.getSettings().canvasApiToken) {
      this.syncStatusEl.createEl("p", {
        text: "Please configure your Canvas Base URL and API Token in the plugin settings before syncing.",
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
    if (!this.syncStatusEl) return;
    this.syncStatusEl.empty();
    this.syncStatusEl.createEl("p", { text: "Fetching courses from Canvas...", cls: "canvas-sync-loading" });
  }

  private async loadCourses(): Promise<void> {
    this.renderLoading();
    try {
      const client = this.plugin.getApiClient();
      this.courses = await client.listCourses({ includeInactive: this.includeInactive });
      this.isLoading = false;
      this.renderCourseList();
    } catch (error) {
      this.isLoading = false;
      if (this.syncStatusEl) {
        this.syncStatusEl.empty();
        this.syncStatusEl.createEl("p", {
          text: `Failed to load courses: ${error instanceof Error ? error.message : String(error)}`,
          cls: "canvas-sync-error"
        });
      }
    }
  }

  private isCourseActive(course: CanvasCourseSummary): boolean {
    if (course.concluded) return false;
    if (course.workflow_state === "completed" || course.workflow_state === "concluded") return false;
    if (Array.isArray(course.enrollments) && course.enrollments.length > 0) {
      return course.enrollments.some((e) => e.enrollment_state === "active");
    }
    return true;
  }

  private renderCourseList(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Select Canvas Courses to Sync" });

    this.syncStatusEl = contentEl.createDiv("canvas-sync-status");

    // Controls: Search, Status Filter & Actions
    const controlsEl = contentEl.createDiv("canvas-modal-controls");

    new Setting(controlsEl)
      .setName("Search & filter")
      .addText((text) =>
        text
          .setPlaceholder("Filter by name or code...")
          .setValue(this.searchQuery)
          .onChange((val) => {
            this.searchQuery = val.toLowerCase();
            this.updateCourseListDisplay();
          })
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("all", "All Courses")
          .addOption("active", "Active Only")
          .addOption("inactive", "Inactive / Past")
          .setValue(this.filterStatus)
          .onChange((val) => {
            this.filterStatus = val as "all" | "active" | "inactive";
            this.updateCourseListDisplay();
          })
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("check-check")
          .setTooltip("Select All Filtered")
          .onClick(() => {
            const filtered = this.getFilteredCourses();
            filtered.forEach((c) => this.selectedCourseIds.add(c.id));
            this.updateCourseListDisplay();
          })
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("x")
          .setTooltip("Deselect All")
          .onClick(() => {
            this.selectedCourseIds.clear();
            this.updateCourseListDisplay();
          })
      );

    this.courseListEl = contentEl.createDiv("canvas-course-list-container");
    this.updateCourseListDisplay();

    // Footer actions
    const footerEl = contentEl.createDiv("canvas-modal-footer");
    const countSpan = footerEl.createSpan({ text: `${this.selectedCourseIds.size} course(s) selected` });

    const btnContainer = footerEl.createDiv("canvas-modal-button-container");

    const cancelBtn = btnContainer.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    const saveScheduledBtn = btnContainer.createEl("button", { text: "Save for Auto-Sync" });
    saveScheduledBtn.onclick = async () => {
      const selectedIds = Array.from(this.selectedCourseIds);
      await this.plugin.updateSettings({
        scheduledCourseIds: selectedIds,
        scheduledSyncSelectionMode: "selected"
      });
      new Notice(`Saved ${selectedIds.length} course(s) for scheduled background sync.`);
      this.close();
    };

    const syncBtn = btnContainer.createEl("button", {
      text: "Sync Selected",
      cls: "mod-cta"
    });
    syncBtn.onclick = async () => {
      if (this.selectedCourseIds.size === 0) {
        new Notice("Please select at least one course to sync.");
        return;
      }
      syncBtn.disabled = true;
      cancelBtn.disabled = true;
      saveScheduledBtn.disabled = true;
      await this.runSync();
    };

    this.onSelectionChanged = () => {
      countSpan.setText(`${this.selectedCourseIds.size} course(s) selected`);
    };
  }

  private onSelectionChanged: () => void = () => {};

  private getFilteredCourses(): CanvasCourseSummary[] {
    return this.courses.filter((c) => {
      const active = this.isCourseActive(c);
      if (this.filterStatus === "active" && !active) return false;
      if (this.filterStatus === "inactive" && active) return false;

      if (!this.searchQuery) return true;
      const name = (c.name || "").toLowerCase();
      const code = (c.course_code || "").toLowerCase();
      return name.includes(this.searchQuery) || code.includes(this.searchQuery);
    });
  }

  private updateCourseListDisplay(): void {
    if (!this.courseListEl) return;
    this.courseListEl.empty();

    const filtered = this.getFilteredCourses();

    if (filtered.length === 0) {
      this.courseListEl.createEl("p", {
        text: this.courses.length === 0 ? "No courses found on Canvas." : "No courses match your filter criteria.",
        cls: "canvas-no-courses"
      });
      return;
    }

    for (const course of filtered) {
      const row = this.courseListEl.createDiv("canvas-course-row");
      const leftContainer = row.createDiv("canvas-course-row-left");

      const cb = leftContainer.createEl("input", { type: "checkbox" });
      cb.checked = this.selectedCourseIds.has(course.id);

      cb.onchange = () => {
        if (cb.checked) {
          this.selectedCourseIds.add(course.id);
        } else {
          this.selectedCourseIds.delete(course.id);
        }
        this.onSelectionChanged();
      };

      const info = leftContainer.createDiv("canvas-course-info");
      info.createEl("strong", { text: course.name, cls: "canvas-course-title" });

      const subInfo = [];
      if (course.course_code) subInfo.push(course.course_code);
      if (course.term?.name) subInfo.push(course.term.name);
      if (subInfo.length > 0) {
        info.createEl("small", {
          text: subInfo.join(" • "),
          cls: "canvas-course-subtext"
        });
      }

      // Status badge
      const active = this.isCourseActive(course);
      row.createSpan({
        text: active ? "Active" : "Inactive / Past",
        cls: active ? "canvas-badge-active" : "canvas-badge-inactive"
      });
    }
  }

  private async runSync(): Promise<void> {
    this.isSyncing = true;
    const selectedIds = Array.from(this.selectedCourseIds);

    if (this.syncStatusEl) {
      this.syncStatusEl.empty();
    }

    for (let i = 0; i < selectedIds.length; i++) {
      const courseId = selectedIds[i];
      const course = this.courses.find((c) => c.id === courseId);
      const courseTitle = course?.name || `Course ${courseId}`;

      try {
        if (this.syncStatusEl) {
          this.syncStatusEl.empty();
          this.syncStatusEl.createEl("p", {
            text: `[${i + 1}/${selectedIds.length}] Syncing: ${courseTitle}...`,
            cls: "canvas-sync-progress-title"
          });
        }

        await this.plugin.syncCourseById(courseId, (step, current, total) => {
          if (this.syncStatusEl) {
            const detailEl =
              this.syncStatusEl.querySelector(".canvas-sync-step-detail") ||
              this.syncStatusEl.createEl("p", { cls: "canvas-sync-step-detail" });
            detailEl.setText(`${step} (${current}/${total})`);
          }
        });

        new Notice(`Synced: ${courseTitle}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`Failed to sync ${courseTitle}: ${message}`, 8000);
        console.error(`Failed to sync course ${courseId}`, error);
      }
    }

    this.isSyncing = false;
    new Notice(`Canvas sync completed for ${selectedIds.length} course(s)!`);
    this.close();
  }
}
