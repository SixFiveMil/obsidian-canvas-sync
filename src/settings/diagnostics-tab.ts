/**
 * @module settings/diagnostics-tab
 * @description Renders the Diagnostics tab for troubleshooting Canvas REST API endpoints,
 * running capability probes, and copying masked debug diagnostics.
 */

import { Notice, Platform, Setting } from "obsidian";
import { CourseCapabilityModal, generateCapabilityMarkdownReport } from "../modals";
import type CanvasSyncBridgePlugin from "../main";
import type { CanvasCourseSummary } from "../types";

/**
 * State container for inline diagnostic probe within the settings tab.
 */
export interface DiagnosticsTabState {
  selectedProbeCourseId: string | number | null;
  probeCourses: CanvasCourseSummary[];
}

/**
 * Renders the Diagnostics settings tab UI.
 *
 * @param containerEl - Parent HTML element container for the tab content.
 * @param plugin - Reference to the main CanvasSyncBridgePlugin.
 * @param state - Ephemeral state for the diagnostics tab dropdown.
 */
export function renderDiagnosticsTab(
  containerEl: HTMLElement,
  plugin: CanvasSyncBridgePlugin,
  state: DiagnosticsTabState
): void {
  new Setting(containerEl).setName("Course capability & diagnostics").setHeading();

  new Setting(containerEl)
    .setName("Run course capability diagnostics")
    .setDesc("Open full diagnostic modal to probe course endpoints, check permissions, and view status badges.")
    .addButton((btn) =>
      btn
        .setButtonText("Open Capability Modal")
        .setCta()
        .onClick(() => {
          new CourseCapabilityModal(plugin.app, plugin).open();
        })
    );

  new Setting(containerEl)
    .setName("Export debug logs & diagnostics")
    .setDesc("Export system diagnostics, plugin configuration summary (secrets masked), and platform metadata.")
    .addButton((btn) =>
      btn.setButtonText("Copy Diagnostics").onClick(() => {
        const s = plugin.getSettings();
        const maskedToken = s.canvasApiToken ? `${s.canvasApiToken.slice(0, 4)}...${s.canvasApiToken.slice(-4)}` : "None";
        const diag = [
          "# Obsidian Canvas Sync Debug Diagnostics",
          "",
          `- Platform Desktop: ${Platform.isDesktop}`,
          `- Platform Mobile: ${Platform.isMobile}`,
          `- Platform OS: ${Platform.isWin ? "Windows" : Platform.isMacOS ? "macOS" : Platform.isLinux ? "Linux" : "Other"}`,
          `- Canvas URL: ${s.canvasBaseUrl || "Not configured"}`,
          `- Canvas Token: ${maskedToken}`,
          `- Root Folder: ${s.rootFolder}`,
          `- Folder Template: ${s.courseFolderTemplate}`,
          `- Asset Downloads: ${s.downloadAssets}`,
          `- Scheduled Sync: ${s.enableScheduledSync} (Interval: ${s.scheduledSyncIntervalMinutes}m, Mode: ${s.scheduledSyncSelectionMode})`,
          `- Bridge Listener: ${s.enableBridgeServer} (Port: ${s.listenPort})`,
          `- Preserved Personal Notes: ${s.preservePersonalNotes}`,
          `- Generated At: ${new Date().toISOString()}`
        ].join("\n");

        void navigator.clipboard.writeText(diag).then(() => {
          new Notice("Debug diagnostics copied to clipboard!");
        });
      })
    );

  const probeSection = containerEl.createDiv("canvas-inline-probe-section");
  const probeResultsEl = containerEl.createDiv("canvas-diagnostics-results");

  const probeSetting = new Setting(probeSection)
    .setName("Quick course capability probe")
    .setDesc("Select a course and probe permissions directly.");

  if (!plugin.getSettings().canvasBaseUrl || !plugin.getSettings().canvasApiToken) {
    probeSection.createDiv({
      cls: "canvas-status-error",
      text: "⚠️ Canvas base URL and API token must be configured to run capability probe."
    });
    return;
  }

  void plugin.getApiClient().listCourses({ includeInactive: true }).then((courses) => {
    state.probeCourses = courses;
    if (courses.length === 0) {
      probeSection.createDiv({ cls: "canvas-no-courses", text: "No courses found." });
      return;
    }
    if (!state.selectedProbeCourseId && courses.length > 0) {
      state.selectedProbeCourseId = courses[0].id;
    }

    probeSetting.addDropdown((dropdown) => {
      for (const c of courses) {
        dropdown.addOption(String(c.id), `${c.name} (${c.course_code || c.id})`);
      }
      if (state.selectedProbeCourseId) {
        dropdown.setValue(String(state.selectedProbeCourseId));
      }
      dropdown.onChange((val) => {
        state.selectedProbeCourseId = val;
      });
    });

    probeSetting.addButton((btn) => {
      btn.setButtonText("Probe Course").onClick(async () => {
        if (!state.selectedProbeCourseId) return;
        probeResultsEl.empty();
        const loading = probeResultsEl.createDiv("canvas-diagnostics-loading");
        loading.createSpan({ text: "⏳ Probing endpoints..." });

        try {
          const report = await plugin.getApiClient().probeCourseCapabilities(state.selectedProbeCourseId);
          probeResultsEl.empty();

          const summary = probeResultsEl.createDiv("canvas-diagnostics-summary");
          summary.createEl("h4", { text: `Diagnostics: ${report.courseName}` });
          summary.createEl("p", {
            text: "💡 Note: 'Restricted (403)' on Files or Roster is standard when instructors hide those global tabs. Embedded module items, lecture slides, and assignment attachments still download normally during sync.",
            cls: "canvas-diagnostics-desc"
          });

          const tableWrap = probeResultsEl.createDiv("canvas-diagnostics-table-wrap");
          const table = tableWrap.createEl("table", { cls: "canvas-diagnostics-table" });
          const thead = table.createEl("thead");
          const trHead = thead.createEl("tr");
          trHead.createEl("th", { text: "Data Category" });
          trHead.createEl("th", { text: "Status" });
          trHead.createEl("th", { text: "Endpoint" });
          trHead.createEl("th", { text: "Details" });

          const tbody = table.createEl("tbody");
          for (const cap of Object.values(report.capabilities)) {
            const row = tbody.createEl("tr");
            row.createEl("td", { text: cap.label, cls: "canvas-diag-cat" });
            const statusTd = row.createEl("td", { cls: "canvas-diag-status" });
            const badge = statusTd.createSpan({ cls: `canvas-badge-diag canvas-badge-${cap.status}` });
            badge.setText(cap.status === "available" ? "🟢 Available" : cap.status === "restricted" ? `🔒 Restricted (${cap.statusCode || 403})` : cap.status === "empty" ? "⚪ Empty" : cap.status === "unsupported" ? `⚠️ Unsupported (${cap.statusCode || 404})` : "❌ Error");
            row.createEl("td", { cls: "canvas-diag-endpoint" }).createEl("code", { text: cap.endpoint });
            const detailsTd = row.createEl("td", { cls: "canvas-diag-details" });
            detailsTd.setText(cap.status === "available" ? `${cap.count ?? 1} item(s)` : (cap.errorMessage || `HTTP ${cap.statusCode ?? "N/A"}`));
          }

          const actions = probeResultsEl.createDiv("canvas-diagnostics-actions");
          const copyBtn = actions.createEl("button", { text: "📋 Copy Markdown Report" });
          copyBtn.addEventListener("click", () => {
            const md = generateCapabilityMarkdownReport(report);
            void navigator.clipboard.writeText(md).then(() => {
              new Notice("Diagnostics report copied to clipboard!");
            });
          });
        } catch (e) {
          probeResultsEl.empty();
          probeResultsEl.createDiv({
            cls: "canvas-status-error",
            text: `Probe failed: ${e instanceof Error ? e.message : String(e)}`
          });
        }
      });
    });
  }).catch((err) => {
    probeSection.createDiv({
      cls: "canvas-status-error",
      text: `Failed to load courses: ${err instanceof Error ? err.message : String(err)}`
    });
  });
}
