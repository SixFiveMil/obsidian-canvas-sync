/**
 * @module settings/datatypes-tab
 * @description Renders the Data Types tab for toggling announcements, discussion replies,
 * student submissions, and concluded course ingestion.
 */

import { Setting } from "obsidian";
import type CanvasSyncBridgePlugin from "../main";

/**
 * Renders the Data Types settings tab UI.
 *
 * @param containerEl - Parent HTML element container for the tab content.
 * @param plugin - Reference to the main CanvasSyncBridgePlugin.
 */
export function renderDataTypesTab(containerEl: HTMLElement, plugin: CanvasSyncBridgePlugin): void {
  new Setting(containerEl).setName("Data types & synchronization").setHeading();

  new Setting(containerEl)
    .setName("Sync announcements")
    .setDesc("Fetch course announcements, instructor updates, and student replies into dedicated notes and hubs.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().syncAnnouncements).onChange((value) => {
        void plugin.updateSettings({ syncAnnouncements: value });
      })
    );

  new Setting(containerEl)
    .setName("Sync discussion replies")
    .setDesc("Fetch threaded student and instructor replies for course discussion topics.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().syncDiscussionReplies).onChange((value) => {
        void plugin.updateSettings({ syncDiscussionReplies: value });
      })
    );

  new Setting(containerEl)
    .setName("Sync student submissions & grades")
    .setDesc("Fetch submitted assignments, scores, feedback comments, and rubric grading details.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().syncStudentSubmissions).onChange((value) => {
        void plugin.updateSettings({ syncStudentSubmissions: value });
      })
    );

  new Setting(containerEl)
    .setName("Include inactive & past courses")
    .setDesc("Fetch completed, concluded, and past term courses in addition to active courses.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().includeInactiveCourses).onChange((value) => {
        void plugin.updateSettings({ includeInactiveCourses: value });
      })
    );
}
