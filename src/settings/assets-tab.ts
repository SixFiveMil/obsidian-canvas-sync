/**
 * @module settings/assets-tab
 * @description Renders the Assets tab for static file download toggles, extension filters,
 * and maximum file size thresholds.
 */

import { Setting } from "obsidian";
import type CanvasSyncBridgePlugin from "../main";

/**
 * Renders the Assets settings tab UI.
 *
 * @param containerEl - Parent HTML element container for the tab content.
 * @param plugin - Reference to the main CanvasSyncBridgePlugin.
 */
export function renderAssetsTab(containerEl: HTMLElement, plugin: CanvasSyncBridgePlugin): void {
  new Setting(containerEl).setName("Asset downloads & attachments").setHeading();

  new Setting(containerEl)
    .setName("Download static assets")
    .setDesc("Download course attachments, documents, and images locally into the vault.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().downloadAssets).onChange((value) => {
        void plugin.updateSettings({ downloadAssets: value });
      })
    );

  new Setting(containerEl)
    .setName("Download documents")
    .setDesc("Preset for .PDF, .DOCX, .PPTX, .XLSX, .TXT, .CSV, .RTF.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().downloadDocuments).onChange((value) => {
        void plugin.updateSettings({ downloadDocuments: value });
      })
    );

  new Setting(containerEl)
    .setName("Download images")
    .setDesc("Preset for .PNG, .JPG, .JPEG, .GIF, .SVG, .WEBP.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().downloadImages).onChange((value) => {
        void plugin.updateSettings({ downloadImages: value });
      })
    );

  new Setting(containerEl)
    .setName("Download archives & code")
    .setDesc("Preset for .ZIP, .TAR, .PY, .JAVA, .CPP, .JS, .TS, .IPYNB.")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().downloadArchivesAndCode).onChange((value) => {
        void plugin.updateSettings({ downloadArchivesAndCode: value });
      })
    );

  new Setting(containerEl)
    .setName("Download audio & video")
    .setDesc("Download audio and direct video files (can use significant vault storage).")
    .addToggle((toggle) =>
      toggle.setValue(plugin.getSettings().downloadMedia).onChange((value) => {
        void plugin.updateSettings({ downloadMedia: value });
      })
    );

  new Setting(containerEl)
    .setName("Custom allowed extensions")
    .setDesc("Comma-separated list of allowed file extensions (e.g. 'PDF, DOCX, PPTX, ZIP').")
    .addText((text) =>
      text
        .setPlaceholder("PDF, DOCX, PPTX, XLSX, PNG, JPG, ZIP")
        .setValue(plugin.getSettings().allowedExtensions)
        .onChange((value) => {
          void plugin.updateSettings({ allowedExtensions: value });
        })
    );

  new Setting(containerEl)
    .setName("Max file size limit (MB)")
    .setDesc("Maximum size in megabytes for any single downloaded asset (prevents vault bloat).")
    .addText((text) =>
      text
        .setPlaceholder("50")
        .setValue(String(plugin.getSettings().maxAssetSizeMb))
        .onChange((value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed >= 1) {
            void plugin.updateSettings({ maxAssetSizeMb: parsed });
          }
        })
    );
}
