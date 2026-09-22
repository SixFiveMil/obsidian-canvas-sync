/**
 * @module settings/formatting-tab
 * @description Renders the Formatting tab for folder templates, root directory,
 * personal student notes preservation, and YAML frontmatter configuration.
 */

import { Setting } from "obsidian";
import type CanvasSyncBridgePlugin from "../main";

/**
 * Renders the Formatting settings tab UI.
 *
 * @param containerEl - Parent HTML element container for the tab content.
 * @param plugin - Reference to the main CanvasSyncBridgePlugin.
 */
export function renderFormattingTab(containerEl: HTMLElement, plugin: CanvasSyncBridgePlugin): void {
  new Setting(containerEl).setName("Vault & organization").setHeading();

  new Setting(containerEl)
    .setName("Enable YAML frontmatter")
    .setDesc("Generate YAML frontmatter (Properties) with typed dates, scores, and status for Dataview, Tasks, and Canvas cards.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().enableYamlFrontmatter ?? true).onChange((value) => {
        void plugin.updateSettings({ enableYamlFrontmatter: value });
      })
    );

  new Setting(containerEl)
    .setName("Root folder")
    .setDesc("Vault folder where course data should be written.")
    .addText((text) =>
      text
        .setPlaceholder("Canvas")
        .setValue(plugin.getSettings().rootFolder)
        .onChange((value) => {
          void plugin.updateSettings({ rootFolder: value.trim() || "Canvas" });
        })
    );

  new Setting(containerEl)
    .setName("Course folder template")
    .setDesc("Folder template for synced courses. Placeholders: {{courseCode}}, {{courseName}}, {{courseId}}.")
    .addText((text) =>
      text
        .setPlaceholder("{{courseCode}} - {{courseName}}")
        .setValue(plugin.getSettings().courseFolderTemplate)
        .onChange((value) => {
          void plugin.updateSettings({
            courseFolderTemplate: value.trim() || "{{courseCode}} - {{courseName}}"
          });
        })
    );

  new Setting(containerEl)
    .setName("Preserve student personal notes")
    .setDesc("Retain personal annotations written in '## 📝 Personal Notes' section across course resyncs.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().preservePersonalNotes ?? true).onChange((value) => {
        void plugin.updateSettings({ preservePersonalNotes: value });
      })
    );

  new Setting(containerEl)
    .setName("Store raw payload")
    .setDesc("Save incoming JSON payload for debugging.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().includeRawPayload).onChange((value) => {
        void plugin.updateSettings({ includeRawPayload: value });
      })
    );
}
