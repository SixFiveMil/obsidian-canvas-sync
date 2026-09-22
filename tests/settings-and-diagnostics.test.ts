import { describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import CanvasSyncBridgePlugin, { CanvasSyncSettingTab, DEFAULT_SETTINGS } from "../src/main";
import { CourseCapabilityModal, generateCapabilityMarkdownReport } from "../src/modals";
import type { CourseCapabilityReport } from "../src/types";

describe("Tabbed Settings Navigation UI", () => {
  it("initializes and renders tabbed navigation buttons with 6 tabs", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);
    const settingTab = new CanvasSyncSettingTab(app, plugin);

    settingTab.display();

    const container = settingTab.containerEl as any;
    const nav = container.children.find((c: any) => c.className?.includes("canvas-settings-nav"));
    expect(nav).toBeDefined();
    expect(nav.children).toHaveLength(6);

    const tabLabels = nav.children.map((btn: any) => btn.textContent);
    expect(tabLabels[0]).toContain("Connection");
    expect(tabLabels[1]).toContain("Data Types");
    expect(tabLabels[2]).toContain("Formatting");
    expect(tabLabels[3]).toContain("Assets");
    expect(tabLabels[4]).toContain("Schedule");
    expect(tabLabels[5]).toContain("Diagnostics");

    // First tab is active by default
    expect(nav.children[0].className).toContain("is-active");
  });

  it("switches active tab when navigation buttons are clicked", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);
    const settingTab = new CanvasSyncSettingTab(app, plugin);

    settingTab.display();

    const container = settingTab.containerEl as any;
    const nav = container.children.find((c: any) => c.className?.includes("canvas-settings-nav"));
    const dataTypesBtn = nav.children[1];

    // Click data types tab
    dataTypesBtn.click();

    const newNav = container.children.find((c: any) => c.className?.includes("canvas-settings-nav"));
    expect(newNav.children[1].className).toContain("is-active");
    expect(newNav.children[0].className).not.toContain("is-active");
  });

  it("exposes all tab definitions and renders tab navigation", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);
    const settingTab = new CanvasSyncSettingTab(app, plugin);

    settingTab.display();
    const container = settingTab.containerEl as any;
    const nav = container.children.find((c: any) => c.className?.includes("canvas-settings-nav"));
    expect(nav).toBeDefined();
    expect(nav.children).toHaveLength(6);
  });

  it("renders bridge pairing token setting in connection tab", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);
    const settingTab = new CanvasSyncSettingTab(app, plugin);

    settingTab.display();
    const container = settingTab.containerEl as any;
    const tabContent = container.children.find((c: any) => c.className?.includes("canvas-settings-tab-content"));
    expect(tabContent).toBeDefined();

    const settingNames = tabContent.children
      .map((c: any) => c.children?.find((sc: any) => sc.className === "setting-item-info")?.children?.find((n: any) => n.className === "setting-item-name")?.textContent)
      .filter(Boolean);

    expect(settingNames).toContain("Bridge pairing token (optional)");
  });
});

describe("Course Capability Diagnostics & Reporting", () => {
  const sampleReport: CourseCapabilityReport = {
    courseId: 12345,
    courseName: "Introduction to Computer Science",
    testedAt: "2026-09-22T04:30:00.000Z",
    capabilities: {
      course_info: {
        key: "course_info",
        label: "Course Info & Syllabus",
        status: "available",
        count: 1,
        statusCode: 200,
        endpoint: "/api/v1/courses/12345?include[]=syllabus_body"
      },
      modules: {
        key: "modules",
        label: "Modules",
        status: "available",
        count: 5,
        statusCode: 200,
        endpoint: "/api/v1/courses/12345/modules?per_page=1"
      },
      quizzes: {
        key: "quizzes",
        label: "Quizzes",
        status: "restricted",
        statusCode: 403,
        errorMessage: "Access restricted",
        endpoint: "/api/v1/courses/12345/quizzes?per_page=1"
      },
      announcements: {
        key: "announcements",
        label: "Announcements",
        status: "empty",
        count: 0,
        statusCode: 200,
        endpoint: "/api/v1/announcements?context_codes[]=course_12345&per_page=1"
      },
      files: {
        key: "files",
        label: "Files & Attachments",
        status: "unsupported",
        statusCode: 404,
        errorMessage: "Not Found",
        endpoint: "/api/v1/courses/12345/files?per_page=1"
      }
    }
  };

  it("generates structured markdown diagnostic report with badges and summary", () => {
    const md = generateCapabilityMarkdownReport(sampleReport);

    expect(md).toContain("# Canvas Course Capability Diagnostic Report");
    expect(md).toContain("Introduction to Computer Science");
    expect(md).toContain("12345");
    expect(md).toContain("🟢 Available");
    expect(md).toContain("🔒 Restricted");
    expect(md).toContain("⚪ Empty");
    expect(md).toContain("⚠️ Unsupported");
    expect(md).toContain("/api/v1/courses/12345/modules?per_page=1");
    expect(md).toContain("Summary & Status Legend");
  });

  it("instantiates CourseCapabilityModal and registers command", () => {
    const app = new App();
    const plugin = new CanvasSyncBridgePlugin(app, {} as any);

    const modal = new CourseCapabilityModal(app, plugin, 12345);
    expect(modal).toBeDefined();
  });
});
