export class App {
  vault = {
    getAbstractFileByPath: () => null,
    getAllLoadedFiles: () => [],
    process: async (_file: unknown, fn: () => string) => fn(),
    create: async () => {},
    read: async () => "",
    modifyBinary: async () => {},
    createBinary: async () => {}
  };
}

export class Plugin {
  app: App;
  constructor(app: App) {
    this.app = app;
  }
}

function createMockElement(tagName = "div", o?: string | { text?: string; cls?: string }): any {
  const listeners: Record<string, Function[]> = {};
  const children: any[] = [];
  const initialCls = typeof o === "string" ? o : o?.cls || "";
  const initialText = typeof o === "object" ? o?.text || "" : "";

  const el: any = {
    tagName,
    className: initialCls,
    textContent: initialText,
    attributes: {} as Record<string, string>,
    children,
    inputEl: { type: "text", value: "" },
    empty() {
      children.length = 0;
      el.textContent = "";
    },
    addClass(cls: string) {
      if (!el.className.includes(cls)) {
        el.className = (el.className + " " + cls).trim();
      }
    },
    removeClass(cls: string) {
      el.className = el.className.replace(cls, "").trim();
    },
    setText(text: string) {
      el.textContent = text;
    },
    setAttribute(name: string, value: string) {
      el.attributes[name] = value;
    },
    getAttribute(name: string) {
      return el.attributes[name];
    },
    addEventListener(event: string, handler: Function) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    click() {
      if (listeners["click"]) {
        for (const h of listeners["click"]) h();
      }
    },
    createDiv(cls?: string) {
      const child = createMockElement("div", cls);
      children.push(child);
      return child;
    },
    createSpan(o?: any) {
      const child = createMockElement("span", o);
      children.push(child);
      return child;
    },
    createEl(tag: string, o?: any) {
      const child = createMockElement(tag, o);
      children.push(child);
      return child;
    }
  };

  return el;
}

export class PluginSettingTab {
  app: App;
  plugin: any;
  containerEl: any;
  constructor(app: App, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = createMockElement("div");
  }
}

export class Setting {
  settingEl: any;
  infoEl: any;
  nameEl: any;
  descEl: any;
  controlEl: any;

  constructor(containerEl?: any) {
    this.settingEl = createMockElement("div", "setting-item");
    this.infoEl = createMockElement("div", "setting-item-info");
    this.nameEl = createMockElement("div", "setting-item-name");
    this.descEl = createMockElement("div", "setting-item-description");
    this.controlEl = createMockElement("div", "setting-item-control");
    this.infoEl.children.push(this.nameEl, this.descEl);
    this.settingEl.children.push(this.infoEl, this.controlEl);
    if (containerEl && typeof containerEl.children !== "undefined") {
      containerEl.children.push(this.settingEl);
    }
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }
  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }
  setClass(cls: string): this {
    this.settingEl.addClass(cls);
    return this;
  }
  setHeading(): this {
    this.settingEl.addClass("setting-item-heading");
    return this;
  }
  addText(cb: (text: any) => void): this {
    const textObj = {
      inputEl: { type: "text", value: "" },
      setPlaceholder: () => textObj,
      setValue: (val: string) => {
        textObj.inputEl.value = val;
        return textObj;
      },
      onChange: () => textObj
    };
    cb(textObj);
    return this;
  }
  addToggle(cb: (toggle: any) => void): this {
    const toggleObj = {
      setValue: () => toggleObj,
      onChange: () => toggleObj
    };
    cb(toggleObj);
    return this;
  }
  addDropdown(cb: (dropdown: any) => void): this {
    const dropdownObj = {
      addOption: () => dropdownObj,
      setValue: () => dropdownObj,
      onChange: () => dropdownObj
    };
    cb(dropdownObj);
    return this;
  }
  addButton(cb: (btn: any) => void): this {
    const btnObj = {
      setButtonText: () => btnObj,
      setTooltip: () => btnObj,
      setCta: () => btnObj,
      onClick: () => btnObj
    };
    cb(btnObj);
    return this;
  }
  addExtraButton(): this {
    return this;
  }
}

export class Modal {
  app: App;
  contentEl: any;
  isOpen = false;
  constructor(app: App) {
    this.app = app;
    this.contentEl = createMockElement("div", "modal-content");
  }
  open() {
    this.isOpen = true;
    if (typeof (this as any).onOpen === "function") {
      (this as any).onOpen();
    }
  }
  close() {
    this.isOpen = false;
    if (typeof (this as any).onClose === "function") {
      (this as any).onClose();
    }
  }
}

export class Notice {
  message: string;
  duration?: number;
  constructor(message: string, duration?: number) {
    this.message = message;
    this.duration = duration;
  }
}

export class TFile {
  path = "";
}

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
