# System Architecture & Technical Design

## 1. Architectural Overview

**Canvas to Obsidian Sync** operates as a **hybrid, local-first ecosystem** designed to bridge institutional Canvas LMS courses into an Obsidian knowledge vault as clean, structured, and cross-linked Markdown notes.

It supports two distinct ingestion pathways that converge into a single unified note generator and asset manager:

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
│  │ CanvasApiClient         │                     │ Loopback Bridge Server           │  │
│  │ (Direct API Connection) │                     │ (conditionally active)           │  │
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
│                       │ Markdown & Link Engine    │                                    │
│                       │ - GFM Converter (Turndown)│                                    │
│                       │ - Wikilink Transformer    │                                    │
│                       │ - Table Pipe Escaper      │                                    │
│                       └─────────────┬─────────────┘                                    │
│                                     │                                                  │
│                                     ▼                                                  │
│                       ┌───────────────────────────┐                                    │
│                       │ Asset & File Downloader   │                                    │
│                       │ - Binary Streamer         │                                    │
│                       │ - Size/Extension Filters  │                                    │
│                       └─────────────┬─────────────┘                                    │
│                                     │                                                  │
│                                     ▼                                                  │
│                       ┌───────────────────────────┐                                    │
│                       │ Vault Note Generator      │                                    │
│                       │ - Path Sanitization       │                                    │
│                       │ - Templated Course Vault  │                                    │
│                       └─────────────┬─────────────┘                                    │
└─────────────────────────────────────┼──────────────────────────────────────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              OBSIDIAN VAULT STORAGE                                    │
│  └── Canvas/CS101 - Intro to CS/                                                       │
│      ├── Course.md, Home.md, Syllabus.md, Grades.md                                    │
│      ├── Tasks.md, Discussions.md, Calendar.md                                         │
│      ├── Modules/01 - Week 1/01 - Page - Lecture.md                                    │
│      ├── Files/ (PDF, DOCX, XLSX, etc.)                                                │
│      └── Attachments/ (Images, Banners)                                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 Obsidian Plugin Runtime (`obsidian-canvas-sync`)

* **Direct API Client (`canvas-api-client.ts`)**:
  Connects directly to the Canvas REST API using Obsidian's native `requestUrl` adapter. Handles pagination headers (`rel="next"`), API authentication, submissions, discussion reply trees, and static asset streaming.
* **Course Selection Modal (`course-select-modal.ts`)**:
  Interactive modal displaying the user's active, completed, or concluded courses with batch selection, in-modal auto-sync interval selection, and live sync progress.
* **Scheduled Background Sync Scheduler (`main.ts`)**:
  Manages recurring background course synchronization tasks with configurable intervals (15m, 30m, 1h, 2h, 4h, 6h, 12h, 24h), course selection filters, and silent background notifications.
* **Personal Note Preservation Engine (`note-utils.ts`)**:
  Preserves user-written student notes and markdown content placed under `## 📝 Personal Notes` across resyncs without visible comment tags.
* **Course Manifest & History Tracker (`note-utils.ts`)**:
  Maintains `_canvas-sync-manifest.json` recording synchronization history, source timestamps, and tracked file inventories for non-destructive incremental updates.
* **Opt-in Local Bridge Server (`main.ts`)**:
  Listens on `127.0.0.1:27125` **only when explicitly enabled** in settings. Validates extension origin headers and payload schema before routing payloads into the shared rendering engine.
* **Markdown & Wikilink Engine (`link-utils.ts`)**:
  Transforms raw Canvas HTML into clean GitHub Flavored Markdown (GFM), resolves course hyperlinks to internal vault notes (`[[Modules/...]]`), escapes table pipes inside wikilinks (`[[path\|alias]]`), embeds "Last Synced" timestamps on all generated pages, and inlines image assets.
* **Vault Writer & Asset Manager (`main.ts`)**:
  Writes course folder hierarchies, generates master index notes, synthesizes calendar milestones, downloads allowed binary files (`Files/`, `Attachments/`), sanitizes filenames against directory traversal vulnerabilities, and caps title lengths to prevent `ENAMETOOLONG` errors.

### 2.2 Companion Browser Extension (`canvas-to-obsidian-extension`)

* **Popup UI & Options (`popup.html`, `popup.ts`)**:
  Provides single-click course detection, bridge port configuration, and granular extraction preference toggles (Modules, Pages, Assignments, Grades, Discussions, Events, Files).
* **Session-Based Background Extractor (`background.ts`)**:
  Executes in the active Canvas tab context to make authenticated `fetch` requests using browser session cookies. Does not require or store an API token.
* **Cross-Browser Compatibility**:
  Supports Manifest V3 for Google Chrome, Chromium browsers, and Mozilla Firefox (with temporary/signed AMO packaging).

---

## 3. Data Contracts & Payload Schema

Both ingestion pathways format data into the canonical `CanvasCoursePayload` structure:

```typescript
export interface CanvasCoursePayload {
  courseId: string;
  courseName: string;
  courseCode?: string;
  fetchedAt: string;
  grades?: CanvasCourseGrades;
  courseHomePageHtml?: string;
  syllabusHtml?: string;
  modules: CanvasModulePayload[];
  pages: CanvasPagePayload[];
  assignments: CanvasAssignmentPayload[];
  discussions: CanvasDiscussionPayload[];
  events: CanvasEventPayload[];
  files?: CanvasFileAssetPayload[];
  assetDiagnostics?: AssetSyncDiagnostics;
}
```

---

## 4. Security & Privacy Guarantees

1. **Zero Open Ports by Default**: The local bridge HTTP listener is closed by default. Users using the direct API mode have zero open TCP ports.
2. **Origin & Client Validation**: When the bridge listener is active, requests require an authorized origin (`chrome-extension://` or `moz-extension://`) and the `X-Canvas-Sync-Client` application header.
3. **Local-First Storage**: API tokens and course content are stored strictly on the local machine within the Obsidian vault directory.
4. **Path & Filename Sanitization**: All file and directory paths are sanitized against path traversal (`../`), stripped of illegal characters, and capped to safe lengths to prevent filesystem overflow exceptions.

