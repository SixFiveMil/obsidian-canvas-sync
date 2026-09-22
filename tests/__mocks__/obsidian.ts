export class App {}
export class Plugin {}
export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: {
    empty(): void;
    createDiv(cls?: string): HTMLElement;
    createEl(tag: string, o?: unknown): HTMLElement;
    createSpan(o?: unknown): HTMLElement;
  };
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty() {},
      createDiv() { return {} as HTMLElement; },
      createEl() { return {} as HTMLElement; },
      createSpan() { return {} as HTMLElement; }
    };
  }
}
export class Setting {
  setName(): this { return this; }
  setDesc(): this { return this; }
  setClass(): this { return this; }
  setHeading(): this { return this; }
  addText(): this { return this; }
  addToggle(): this { return this; }
  addDropdown(): this { return this; }
  addButton(): this { return this; }
  addExtraButton(): this { return this; }
}
export class Modal {
  app: App;
  contentEl: {
    empty(): void;
    addClass(cls?: string): void;
    createEl(tag: string, o?: unknown): HTMLElement;
    createDiv(cls?: string): HTMLElement;
    createSpan(o?: unknown): HTMLElement;
  };
  constructor(app: App) {
    this.app = app;
    this.contentEl = {
      empty() {},
      addClass() {},
      createEl() { return {} as HTMLElement; },
      createDiv() { return {} as HTMLElement; },
      createSpan() { return {} as HTMLElement; }
    };
  }
  open() {}
  close() {}
}
export class Notice {
  constructor(_message: string, _duration?: number) {}
}
export class TFile {}
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
export async function requestUrl(_params: unknown): Promise<unknown> {
  return { status: 200, json: {}, text: "", headers: {} };
}
export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isIosApp: false,
  isAndroidApp: false,
  isMacOS: false,
  isWin: true,
  isLinux: false,
  isSafari: false
};
