/**
 * @module settings/settings-tab
 * @description Main PluginSettingTab implementation featuring tabbed navigation
 * and declarative setting definitions for search indexing.
 */

import { App, PluginSettingTab } from "obsidian";
import type CanvasSyncBridgePlugin from "../main";
import { renderAssetsTab } from "./assets-tab";
import { renderConnectionTab } from "./connection-tab";
import { renderDataTypesTab } from "./datatypes-tab";
import { renderDiagnosticsTab, type DiagnosticsTabState } from "./diagnostics-tab";
import { renderFormattingTab } from "./formatting-tab";
import { renderScheduleTab } from "./schedule-tab";

/**
 * Identifier for the currently active settings sub-tab.
 */
export type SettingsTabId = "connection" | "datatypes" | "formatting" | "assets" | "schedule" | "diagnostics";

/**
 * Metadata definition for a settings tab button.
 */
export interface SettingsTabDef {
  id: SettingsTabId;
  label: string;
  icon: string;
}

/**
 * List of available configuration tabs in the settings UI.
 */
export const SETTINGS_TABS: SettingsTabDef[] = [
  { id: "connection", label: "Connection", icon: "🔑" },
  { id: "datatypes", label: "Data Types", icon: "📋" },
  { id: "formatting", label: "Formatting", icon: "📝" },
  { id: "assets", label: "Assets", icon: "📦" },
  { id: "schedule", label: "Schedule", icon: "⏱️" },
  { id: "diagnostics", label: "Diagnostics", icon: "🔍" }
];

/**
 * Settings tab controller rendered in Obsidian Preferences.
 */
export class CanvasSyncSettingTab extends PluginSettingTab {
  plugin: CanvasSyncBridgePlugin;
  private activeTab: SettingsTabId = "connection";
  private diagnosticsState: DiagnosticsTabState = {
    selectedProbeCourseId: null,
    probeCourses: []
  };

  /**
   * Creates a new CanvasSyncSettingTab instance.
   *
   * @param app - The Obsidian App instance.
   * @param plugin - The CanvasSyncBridgePlugin instance.
   */
  constructor(app: App, plugin: CanvasSyncBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Renders the tab navigation and active tab pane.
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Responsive tabbed navigation bar
    const navEl = containerEl.createDiv("canvas-settings-nav");
    for (const tab of SETTINGS_TABS) {
      const btn = navEl.createEl("button", {
        cls: `canvas-settings-tab-btn ${this.activeTab === tab.id ? "is-active" : ""}`,
        text: `${tab.icon} ${tab.label}`
      });
      btn.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.display();
      });
    }

    const tabContentEl = containerEl.createDiv("canvas-settings-tab-content");

    switch (this.activeTab) {
      case "connection":
        renderConnectionTab(tabContentEl, this.plugin);
        break;
      case "datatypes":
        renderDataTypesTab(tabContentEl, this.plugin);
        break;
      case "formatting":
        renderFormattingTab(tabContentEl, this.plugin);
        break;
      case "assets":
        renderAssetsTab(tabContentEl, this.plugin);
        break;
      case "schedule":
        renderScheduleTab(tabContentEl, this.plugin, () => this.display());
        break;
      case "diagnostics":
        renderDiagnosticsTab(tabContentEl, this.plugin, this.diagnosticsState);
        break;
    }
  }
}
