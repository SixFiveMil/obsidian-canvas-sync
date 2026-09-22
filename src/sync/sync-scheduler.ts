/**
 * @module sync/sync-scheduler
 * @description Background timer and periodic sync scheduler for automated recurring Canvas synchronization.
 */

import { Notice } from "obsidian";
import type { CanvasApiClient } from "../api";
import type { CanvasCourseSummary, CanvasSyncSettings, CourseSyncResult } from "../types";

/**
 * Manages periodic automatic synchronization of enrolled courses in the background.
 */
export class CanvasSyncScheduler {
  private settings: CanvasSyncSettings;
  private getApiClient: () => CanvasApiClient;
  private syncCourseById: (courseId: string | number) => Promise<CourseSyncResult>;
  private updateSettings: (patch: Partial<CanvasSyncSettings>) => Promise<void>;
  private registerIntervalFn: (id: number) => number;
  private syncIntervalTimer: number | null = null;
  private isSyncing = false;

  /**
   * Creates a new CanvasSyncScheduler instance.
   */
  constructor(
    settings: CanvasSyncSettings,
    getApiClient: () => CanvasApiClient,
    syncCourseById: (courseId: string | number) => Promise<CourseSyncResult>,
    updateSettings: (patch: Partial<CanvasSyncSettings>) => Promise<void>,
    registerIntervalFn: (id: number) => number
  ) {
    this.settings = settings;
    this.getApiClient = getApiClient;
    this.syncCourseById = syncCourseById;
    this.updateSettings = updateSettings;
    this.registerIntervalFn = registerIntervalFn;
  }

  /**
   * Updates settings references used by the scheduler.
   */
  public updateSettingsReference(settings: CanvasSyncSettings): void {
    this.settings = settings;
  }

  /**
   * Initializes or restarts the background timer interval if enabled in settings.
   */
  public init(): void {
    this.stop();

    if (!this.settings.enableScheduledSync) {
      return;
    }

    const intervalMs = Math.max(1, this.settings.scheduledSyncIntervalMinutes) * 60 * 1000;
    this.syncIntervalTimer = window.setInterval(() => {
      void this.runScheduledSync(false);
    }, intervalMs);

    this.registerIntervalFn(this.syncIntervalTimer);
  }

  /**
   * Clears any active timer intervals.
   */
  public stop(): void {
    if (this.syncIntervalTimer !== null) {
      window.clearInterval(this.syncIntervalTimer);
      this.syncIntervalTimer = null;
    }
  }

  /**
   * Restarts the scheduler timer.
   */
  public restart(): void {
    this.init();
  }

  /**
   * Executes a scheduled sync cycle across selected courses.
   *
   * @param isManual - True if triggered explicitly by the user via command palette.
   */
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
        targetCourses = courses.filter((c: CanvasCourseSummary) => selectedSet.has(Number(c.id)));
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
