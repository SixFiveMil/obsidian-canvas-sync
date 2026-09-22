/**
 * @module settings/connection-tab
 * @description Renders the Connection settings tab for Canvas API token verification
 * and desktop browser bridge listener configuration.
 */

import { Platform, Setting } from "obsidian";
import type CanvasSyncBridgePlugin from "../main";

/**
 * Renders the Connection tab settings UI.
 *
 * @param containerEl - Parent HTML element container for the tab content.
 * @param plugin - Reference to the main CanvasSyncBridgePlugin.
 */
export function renderConnectionTab(containerEl: HTMLElement, plugin: CanvasSyncBridgePlugin): void {
  new Setting(containerEl).setName("Canvas API integration").setHeading();

  new Setting(containerEl)
    .setName("Canvas base URL")
    .setDesc("The web address of your Canvas institution (e.g. 'https://canvas.institution.edu' or 'https://canvas.instructure.com').")
    .addText((text) =>
      text
        .setPlaceholder("https://your-school.instructure.com")
        .setValue(plugin.getSettings().canvasBaseUrl)
        .onChange((value) => {
          void plugin.updateSettings({ canvasBaseUrl: value.trim() });
        })
    );

  const tokenSetting = new Setting(containerEl)
    .setName("Canvas API token")
    .setDesc("Personal access token generated from your Canvas profile (settings > approved integrations > + new access token).");

  tokenSetting.addText((text) => {
    text.inputEl.type = "password";
    text
      .setPlaceholder("Enter API token...")
      .setValue(plugin.getSettings().canvasApiToken)
      .onChange((value) => {
        void plugin.updateSettings({ canvasApiToken: value.trim() });
      });
  });

  const statusContainer = containerEl.createDiv("canvas-connection-status");

  new Setting(containerEl)
    .setName("Test connection")
    .setDesc("Verify that your Canvas URL and API token are valid.")
    .addButton((btn) =>
      btn
        .setButtonText("Test connection")
        .setCta()
        .onClick(async () => {
          statusContainer.empty();
          statusContainer.createSpan({ text: "Testing connection...", cls: "canvas-status-testing" });
          try {
            const client = plugin.getApiClient();
            const user = await client.testConnection();
            statusContainer.empty();
            statusContainer.createDiv({
              text: `✅ Successfully connected as: ${user.name || "Canvas User"} (User ID: ${user.id})`,
              cls: "canvas-status-success"
            });
          } catch (error) {
            statusContainer.empty();
            statusContainer.createDiv({
              text: `❌ Connection failed: ${error instanceof Error ? error.message : String(error)}`,
              cls: "canvas-status-error"
            });
          }
        })
    );

  if (!Platform.isMobile) {
    new Setting(containerEl).setName("Browser extension bridge (optional)").setHeading();

    new Setting(containerEl)
      .setName("Enable browser bridge listener")
      .setDesc("Open a local listener on 127.0.0.1 to receive course data from the companion browser extension (required for session-based sync).")
      .addToggle((toggle) =>
        toggle.setValue(plugin.getSettings().enableBridgeServer).onChange(async (value) => {
          await plugin.updateSettings({ enableBridgeServer: value });
          if (value) {
            await plugin.startServer();
          } else {
            await plugin.stopServer();
          }
        })
      );

    new Setting(containerEl)
      .setName("Bridge listen port")
      .setDesc("Localhost port that receives data from the browser extension.")
      .addText((text) =>
        text
          .setPlaceholder("27125")
          .setValue(String(plugin.getSettings().listenPort))
          .onChange(async (value) => {
            const next = Number.parseInt(value, 10);
            if (!Number.isFinite(next) || next < 1 || next > 65535) {
              return;
            }
            await plugin.updateSettings({ listenPort: next });
            if (plugin.getSettings().enableBridgeServer) {
              await plugin.restartServer();
            }
          })
      );
  } else {
    new Setting(containerEl).setName("Browser extension bridge (desktop only)").setHeading();
    new Setting(containerEl)
      .setName("Direct REST API active")
      .setDesc("The local browser extension bridge requires a Node.js desktop environment. Mobile Obsidian uses direct Canvas REST API synchronization seamlessly.");
  }
}
