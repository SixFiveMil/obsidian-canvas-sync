/**
 * @module settings/schedule-tab
 * @description Renders the Schedule tab for periodic background sync interval timers,
 * course filtering, silent background runs, and manual synchronization triggers.
 */

import { Setting } from "obsidian";
import { CourseSelectModal } from "../modals";
import type CanvasSyncBridgePlugin from "../main";

/**
 * Renders the Schedule settings tab UI.
 *
 * @param containerEl - Parent HTML element container for the tab content.
 * @param plugin - Reference to the main CanvasSyncBridgePlugin.
 * @param onRefresh - Callback to re-render the settings tab UI when toggles change.
 */
export function renderScheduleTab(
  containerEl: HTMLElement,
  plugin: CanvasSyncBridgePlugin,
  onRefresh: () => void
): void {
  new Setting(containerEl).setName("Scheduled background sync & automation").setHeading();

  new Setting(containerEl)
    .setName("Enable background sync")
    .setDesc("Automatically resync courses in the background at regular intervals.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().enableScheduledSync ?? false).onChange(async (value) => {
        await plugin.updateSettings({ enableScheduledSync: value });
        onRefresh();
      })
    );

  if (plugin.getSettings().enableScheduledSync) {
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
          .addOption("1440", "Every 24 hours (daily)")
          .setValue(String(plugin.getSettings().scheduledSyncIntervalMinutes || 60))
          .onChange((value) => {
            const minutes = Number.parseInt(value, 10);
            if (Number.isFinite(minutes) && minutes > 0) {
              void plugin.updateSettings({ scheduledSyncIntervalMinutes: minutes });
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
          .setValue(plugin.getSettings().scheduledSyncSelectionMode || "all_active")
          .onChange((value) => {
            void plugin.updateSettings({
              scheduledSyncSelectionMode: value as "all_active" | "selected"
            });
            onRefresh();
          })
      );

    if (plugin.getSettings().scheduledSyncSelectionMode === "selected") {
      const count = plugin.getSettings().scheduledCourseIds?.length || 0;
      new Setting(containerEl)
        .setName("Manage auto-sync courses")
        .setDesc(`${count} course(s) currently configured for auto-sync.`)
        .addButton((btn) =>
          btn.setButtonText("Select courses...").onClick(() => {
            new CourseSelectModal(plugin.app, plugin).open();
          })
        );
    }

    new Setting(containerEl)
      .setName("Silent background sync")
      .setDesc("Sync silently in the background without pop-up notifications unless an error occurs.")
      .addToggle((toggle) =>
        toggle.setValue(plugin.getSettings().silentScheduledSync ?? true).onChange((value) => {
          void plugin.updateSettings({ silentScheduledSync: value });
        })
      );

    const lastSync = plugin.getSettings().lastScheduledSyncTimestamp;
    const lastSyncText = lastSync ? new Date(lastSync).toLocaleString() : "Never";

    new Setting(containerEl)
      .setName("Run scheduled sync now")
      .setDesc(`Last background sync: ${lastSyncText}`)
      .addButton((btn) =>
        btn
          .setButtonText("Sync now")
          .setCta()
          .onClick(async () => {
            await plugin.runScheduledSync(true);
            onRefresh();
          })
      );
  }
}
