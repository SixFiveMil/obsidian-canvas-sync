export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {
  setName(): this { return this; }
  setDesc(): this { return this; }
  addText(): this { return this; }
  addToggle(): this { return this; }
  addButton(): this { return this; }
  addExtraButton(): this { return this; }
}
export class Modal {
  app: App;
  contentEl: {
    empty(): void;
    addClass(): void;
    createEl(): HTMLElement;
    createDiv(): HTMLElement;
    createSpan(): HTMLElement;
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

