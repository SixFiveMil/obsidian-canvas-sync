# Master Architecture & Developer Reference

This document serves as the master architectural guide and reference for the **Canvas to Obsidian Sync** ecosystem. It documents the modular directory layout, subsystem boundaries, data flow pipelines, coding guidelines, and extension recipes for future developers.

---

## 1. High-Level System Architecture

**Canvas to Obsidian Sync** operates as a **hybrid, local-first ecosystem** designed to bridge institutional Canvas LMS courses into an Obsidian knowledge vault as clean, structured, and cross-linked Markdown notes.

It supports two distinct ingestion pathways that converge into a unified note generator and asset manager:

1. **Mode A: Direct REST API Client** (Native within Obsidian, works on Desktop and Mobile).
2. **Mode B: Browser Extension Bridge** (Zero-token session extractor running in Chrome/Firefox for users at institutions where student API keys are disabled).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CANVAS LMS CLOUD                                     │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │  Canvas REST API (/api/v1/...)                                                 │   │
│   │  - Courses, Modules, Pages, Syllabus                                           │   │
│   │  - Assignments, Rubrics & Student Submissions                                  │   │
│   │  - Discussions & Complete Nested Reply Trees                                   │   │
│   │  - Calendar Events & Due Date Milestones                                       │   │
│   │  - Course Files & Static Asset Downloads                                       │   │
│   └────────────────────────┬───────────────────────────────┬───────────────────────┘   │
└────────────────────────────┼───────────────────────────────┼───────────────────────────┘
                             │                               │
        Mode A: Direct API   │ HTTPS                         │ Mode B: Session-Based
      (Obsidian requestUrl)  │ (Bearer Token)                │ (Browser Session Cookies)
                             │                               ▼
                             │                 ┌───────────────────────────┐
                             │                 │ Companion Web Extension   │
                             │                 │ (Chrome / Firefox)        │
                             │                 │ - Session Extractor       │
                             │                 │ - Extraction Toggles      │
                             │                 └─────────────┬─────────────┘
                             │                               │ Loopback POST (127.0.0.1:27125)
                             │                               │ (Only active if enabled)
                             ▼                               ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              OBSIDIAN PLUGIN RUNTIME                                   │
│                                                                                        │
│  ┌─────────────────────────┐                     ┌──────────────────────────────────┐  │
│  │ CanvasApiClient         │                     │ CanvasBridgeServer               │  │
│  │ (Direct API Connection) │                     │ (Desktop Loopback Listener)      │  │
│  └────────────┬────────────┘                     └────────────────┬─────────────────┘  │
│               │                                                   │                    │
│               └─────────────────────┬─────────────────────────────┘                    │
│                                     │                                                  │
│                                     ▼                                                  │
│                       ┌───────────────────────────┐                                    │
│                       │   Canonical Course Payload│                                    │
│                       │   (CanvasCoursePayload)   │                                    │
│                       └─────────────┬─────────────┘                                    │
│                                     │                                                  │
│                                     ▼                                                  │
│                       ┌───────────────────────────┐                                    │
│                       │ CanvasSyncService         │                                    │
│                       │ - Asset Streamer          │                                    │
│                       │ - Link Transformer & GFM  │                                    │
│                       │ - Vault Atomic Writer     │                                    │
│                       └─────────────┬─────────────┘                                    │
│                                     │                                                  │
│                                     ▼                                                  │
│                       ┌───────────────────────────┐                                    │
│                       │ Modular Renderers Layer   │                                    │
│                       │ - Course, Home, Syllabus  │                                    │
│                       │ - Modules & Item Notes    │                                    │
│                       │ - Tasks, Grades, Rubrics  │                                    │
│                       │ - Announcements & Replies │                                    │
│                       │ - Discussions & Calendar  │                                    │
│                       └─────────────┬─────────────┘                                    │
└─────────────────────────────────────┼──────────────────────────────────────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              OBSIDIAN VAULT STORAGE                                    │
│  └── Canvas/CS101 - Intro to CS/                                                       │
│      ├── Course.md, Home.md, Syllabus.md, Grades.md                                    │
│      ├── Tasks.md, Discussions.md, Calendar.md, Announcements.md                       │
│      ├── Modules/01 - Week 1/01 - Page - Lecture.md                                    │
│      ├── Files/ (PDF, DOCX, XLSX, etc.)                                                │
│      └── Attachments/ (Images, Banners)                                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure & Module Breakdown

The codebase is organized into single-responsibility, highly readable modules under `src/`:

```
src/
├── main.ts                        # Plugin lifecycle entry point, ribbon icon & command registrar
├── types.ts                       # Domain types, payload contracts & settings schema
├── constants.ts                   # Settings defaults & client header constants
│
├── api/                           # Canvas REST API client & endpoint capability probing
│   ├── index.ts                   # Barrel export for API module
│   ├── canvas-client.ts           # Core Canvas LMS REST client with pagination & data fetchers
│   └── capability-probe.ts        # Dynamic endpoint & permission capability probe
│
├── bridge/                        # Desktop loopback HTTP server
│   ├── index.ts                   # Barrel export for bridge module
│   └── bridge-server.ts           # Desktop HTTP loopback listener (127.0.0.1:27125)
│
├── modals/                        # Interactive user modals
│   ├── index.ts                   # Barrel export for modals module
│   ├── course-select-modal.ts     # Course selection interactive modal
│   └── course-capability-modal.ts # Diagnostic probe reporting modal
│
├── renderers/                     # Pure Markdown note generation
│   ├── index.ts                   # Barrel export for all renderers
│   ├── doc-renderer.ts            # Base HTML-to-markdown and wikilink formatting
│   ├── course-renderer.ts         # Course.md index note renderer
│   ├── module-renderer.ts         # Module pages, files, links, and section headers
│   ├── assignment-renderer.ts     # Tasks checklist, assignment notes, submissions & rubrics
│   ├── discussion-renderer.ts     # Discussions index, topic notes & nested reply trees
│   ├── announcement-renderer.ts   # Announcements hub & individual announcement notes
│   ├── grade-renderer.ts          # Gradebook summary & submission status tables
│   └── calendar-renderer.ts       # Calendar overview & milestone timeline notes
│
├── settings/                      # Tabbed settings UI
│   ├── index.ts                   # Barrel export for settings tabs
│   ├── settings-tab.ts            # PluginSettingTab implementation & search indexing
│   ├── connection-tab.ts          # API token & desktop bridge settings
│   ├── datatypes-tab.ts           # Data category toggles (Announcements, Submissions, etc.)
│   ├── formatting-tab.ts          # Folder template & frontmatter settings
│   ├── assets-tab.ts              # Asset filter toggles, extensions & size limits
│   ├── schedule-tab.ts            # Periodic background sync interval configuration
│   └── diagnostics-tab.ts         # Diagnostic tools & inline capability probe
│
├── sync/                          # Synchronization engine & scheduler
│   ├── index.ts                   # Barrel export for sync services
│   ├── sync-service.ts            # Core vault synchronizer, asset streamer & file writer
│   └── sync-scheduler.ts          # Periodic background sync timer & runner
│
├── utils/                         # Shared utility functions
│   ├── index.ts                   # Barrel export for utils
│   ├── link-utils.ts              # HTML link parser, asset filter logic & Turndown configuration
│   ├── note-utils.ts              # Personal note preservation (## 📝 Personal Notes) & manifests
│   ├── security-utils.ts          # Origin validation, filename sanitization & envelope checking
│   ├── table-utils.ts             # Markdown table escaping & formatting
│   ├── template-utils.ts          # Folder naming templates & date formatting
│   └── yaml-utils.ts              # YAML frontmatter generator & ISO timestamp parsers
│
└── turndown-plugin-gfm.d.ts       # Type definitions for GFM Turndown plugin
```

---

## 3. Subsystem Responsibilities

### 3.1 Plugin Lifecycle & Coordinator (`src/main.ts`)
* Implements `CanvasSyncBridgePlugin extends Plugin`.
* Manages configuration loading/saving via `loadData()` and `saveData()`.
* Registers ribbon icon (`graduation-cap`) and Command Palette actions.
* Coordinates `CanvasApiClient`, `CanvasBridgeServer`, `CanvasSyncService`, and `CanvasSyncScheduler`.
* Re-exports backwards-compatible delegates and public helper functions.

### 3.2 Synchronization Engine (`src/sync/sync-service.ts`)
* **Atomic Vault Writes**: Uses `app.vault.process()` for existing files and `app.vault.create()` for new files, preventing partial writes and file corruption.
* **Personal Note Preservation**: Calls `mergePreservedContent()` to retain notes placed under `## 📝 Personal Notes`.
* **Asset Downloader**: Downloads allowed attachments, computes safe subfolders (`Files/` vs `Attachments/`), and records diagnostics.
* **Link Rewriting Context**: Resolves Canvas URLs into vault internal wikilinks (`[[Modules/...]]`).

### 3.3 Background Scheduler (`src/sync/sync-scheduler.ts`)
* Manages periodic auto-sync intervals (15m, 30m, 1h, 2h, 4h, 6h, 12h, 24h).
* Supports course filtering (`all_active` vs `selected`).
* Provides silent background operation unless errors occur.

### 3.4 Bridge HTTP Server (`src/bridge/bridge-server.ts`)
* Listens on `127.0.0.1:27125` **only when explicitly enabled** on Desktop.
* Strictly validates CORS origins (`chrome-extension://`, `moz-extension://`) and the `x-canvas-sync-client` header.
* Implements body size bounding (50MB maximum) to prevent memory exhaustion.

### 3.5 Modular Renderers (`src/renderers/`)
* **Pure & Testable**: Each renderer takes structured payload data and configuration, returning formatted Markdown with typed YAML frontmatter.
* **Robust Escaping**: Automatically escapes pipes (`\|`) inside table columns and formats wikilink aliases properly.

### 3.6 Settings UI (`src/settings/`)
* Organized into 6 distinct navigation tabs: **Connection**, **Data Types**, **Formatting**, **Assets**, **Schedule**, and **Diagnostics**.
* Implements `getSettingDefinitions()` to enable native Obsidian settings search indexing.

---

## 4. Extension & Development Recipes

### Recipe 1: Adding a New Course Data Category (e.g. Quizzes)
1. **Define Types** in `src/types.ts`:
   ```typescript
   export interface CanvasQuizPayload {
     id: string;
     title: string;
     dueAt?: string;
     pointsPossible?: number;
     htmlUrl?: string;
   }
   ```
2. **Add API Fetcher** in `src/canvas-api-client.ts`:
   ```typescript
   public async getQuizzes(courseId: string | number): Promise<CanvasQuizPayload[]> { ... }
   ```
3. **Create Renderer** in `src/renderers/quiz-renderer.ts`:
   ```typescript
   export function renderQuizzesPage(payload: CanvasCoursePayload): string { ... }
   ```
4. **Integrate in Sync Service** (`src/sync/sync-service.ts`):
   Call renderer and write file using `await this.upsertFile(quizzesPath, renderQuizzesPage(payload));`.

### Recipe 2: Adding a Setting
1. Add setting key and default to `src/constants.ts` in `DEFAULT_SETTINGS`.
2. Add type definition to `src/types.ts` in `CanvasSyncSettings`.
3. Add UI control in the appropriate `src/settings/*-tab.ts` file.
4. Add search indexing descriptor to `getSettingDefinitions()` in `src/settings/settings-tab.ts`.

---

## 5. Developer Safety & Quality Guidelines

1. **No Forbidden HTML APIs**: Never use `innerHTML`, `outerHTML`, or `insertAdjacentHTML`. Always use Obsidian DOM builder helpers (`createDiv()`, `createEl()`, `setText()`).
2. **No Vault Adapter Bypasses**: Never use `vault.adapter.*`. Use `vault.process()`, `vault.create()`, or `vault.read()`.
3. **No Unconditional Node.js Imports**: Always guard Node modules behind `Platform.isDesktop` and `!Platform.isMobile`.
4. **No Console.log**: Avoid `console.log()` per Obsidian community guidelines. Use `new Notice()` or `console.warn()`/`console.error()` for exceptional states.
5. **No Regex Lookbehinds**: Avoid `(?<=...)` or `(?<!...)` for Safari/WebKit iOS mobile compatibility.
6. **Sentence Case Labels**: Keep all setting names and section headings in sentence case.
