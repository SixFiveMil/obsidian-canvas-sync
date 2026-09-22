/**
 * @module settings/settings-tab
 * @description Main PluginSettingTab implementation featuring tabbed navigation
 * and declarative setting definitions for search indexing.
 */

import { App, PluginSettingTab } from "obsidian";
import type CanvasSyncBridgePlugin from "../main";
import type { CanvasCourseSummary } from "../types";
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
   * Returns declarative settings definitions enabling Obsidian's native settings search indexing.
   */
  getSettingDefinitions(): unknown[] {
    return [
      {
        heading: "Canvas API integration"
      },
      {
        name: "Canvas base URL",
        desc: "The web address of your Canvas institution (e.g. 'https://canvas.institution.edu' or 'https://canvas.instructure.com').",
        control: {
          type: "text",
          key: "canvasBaseUrl",
          placeholder: "https://your-school.instructure.com"
        }
      },
      {
        name: "Canvas API token",
        desc: "Personal access token generated from your Canvas Profile (Settings > Approved Integrations > + New Access Token).",
        control: {
          type: "text",
          key: "canvasApiToken",
          placeholder: "Enter API token..."
        }
      },
      {
        name: "Include inactive & past courses",
        desc: "Fetch completed, concluded, and past term courses in addition to active courses.",
        control: {
          type: "toggle",
          key: "includeInactiveCourses"
        }
      },
      {
        name: "Sync announcements",
        desc: "Fetch course announcements, instructor updates, and student replies into dedicated notes and hubs.",
        control: {
          type: "toggle",
          key: "syncAnnouncements"
        }
      },
      {
        name: "Sync discussion replies",
        desc: "Fetch threaded student and instructor replies for course discussion topics.",
        control: {
          type: "toggle",
          key: "syncDiscussionReplies"
        }
      },
      {
        name: "Sync student submissions & grades",
        desc: "Fetch submitted assignments, scores, feedback comments, and rubric grading details.",
        control: {
          type: "toggle",
          key: "syncStudentSubmissions"
        }
      },
      {
        heading: "Browser extension bridge (optional)"
      },
      {
        name: "Enable browser bridge listener",
        desc: "Open a local listener on 127.0.0.1 to receive course data from the companion browser extension (required for session-based sync).",
        control: {
          type: "toggle",
          key: "enableBridgeServer"
        }
      },
      {
        name: "Bridge listen port",
        desc: "Localhost port that receives data from the browser extension.",
        control: {
          type: "text",
          key: "listenPort",
          placeholder: "27125"
        }
      },
      {
        heading: "Vault & organization"
      },
      {
        name: "Enable YAML frontmatter",
        desc: "Generate YAML frontmatter (Properties) with typed dates, scores, and status for Dataview, Tasks, and Canvas cards.",
        control: {
          type: "toggle",
          key: "enableYamlFrontmatter"
        }
      },
      {
        name: "Root folder",
        desc: "Vault folder where course data should be written.",
        control: {
          type: "text",
          key: "rootFolder",
          placeholder: "Canvas"
        }
      },
      {
        name: "Course folder template",
        desc: "Folder template for synced courses. Placeholders: {{courseCode}}, {{courseName}}, {{courseId}}.",
        control: {
          type: "text",
          key: "courseFolderTemplate",
          placeholder: "{{courseCode}} - {{courseName}}"
        }
      },
      {
        heading: "Asset downloads & attachments"
      },
      {
        name: "Download static assets",
        desc: "Download course attachments, documents, and images locally into the vault.",
        control: {
          type: "toggle",
          key: "downloadAssets"
        }
      },
      {
        name: "Download documents",
        desc: "Preset for .pdf, .docx, .pptx, .xlsx, .txt, .csv, .rtf.",
        control: {
          type: "toggle",
          key: "downloadDocuments"
        }
      },
      {
        name: "Download images",
        desc: "Preset for .png, .jpg, .jpeg, .gif, .svg, .webp.",
        control: {
          type: "toggle",
          key: "downloadImages"
        }
      },
      {
        name: "Download archives & code",
        desc: "Preset for .zip, .tar, .py, .java, .cpp, .js, .ts, .ipynb.",
        control: {
          type: "toggle",
          key: "downloadArchivesAndCode"
        }
      },
      {
        name: "Download audio & video",
        desc: "Download audio and direct video files (can use significant vault storage).",
        control: {
          type: "toggle",
          key: "downloadMedia"
        }
      },
      {
        name: "Custom allowed extensions",
        desc: "Comma-separated list of allowed file extensions (e.g. 'pdf, docx, pptx, zip').",
        control: {
          type: "text",
          key: "allowedExtensions",
          placeholder: "pdf, docx, pptx, xlsx, png, jpg, zip"
        }
      },
      {
        name: "Max file size limit (MB)",
        desc: "Maximum size in megabytes for any single downloaded asset (prevents vault bloat).",
        control: {
          type: "text",
          key: "maxAssetSizeMb",
          placeholder: "50"
        }
      },
      {
        name: "Store raw payload",
        desc: "Save incoming JSON payload for debugging.",
        control: {
          type: "toggle",
          key: "includeRawPayload"
        }
      }
    ];
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
