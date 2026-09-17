# System Architecture & Technical Design

## 1. Architectural Overview

**Canvas to Obsidian Sync** bridges institutional Canvas LMS courses into an Obsidian knowledge vault as clean, structured, and cross-linked Markdown notes.

The system uses a **direct, local-first architecture** running entirely within the Obsidian runtime. It uses Obsidian's native `requestUrl` API to interact with the Canvas LMS REST API over secure HTTPS, completely eliminating the need for companion browser extensions, local loopback servers, or middleman cloud services.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CANVAS LMS CLOUD                                │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Canvas LMS REST API (https://<canvas-domain>/api/v1/...)             │  │
│  │  - Courses & Terms                                                    │  │
│  │  - Modules & Module Items                                             │  │
│  │  - Pages, Syllabus & Announcements                                    │  │
│  │  - Assignments, Rubrics & Student Submissions                         │  │
│  │  - Discussions & Student Reply Trees                                  │  │
│  │  - Calendar Events & Due Date Milestones                              │  │
│  │  - Course Files & Attachment Downloads                                │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │ HTTPS (Obsidian requestUrl)
                                       │ Bearer <Canvas-API-Token>
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OBSIDIAN DESKTOP / MOBILE                            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Canvas Sync Plugin (apps/obsidian-plugin)                            │  │
│  │                                                                       │  │
│  │  ┌────────────────────────┐    ┌──────────────────────────────────┐   │  │
│  │  │  Course Selector Modal │───>│ CanvasApiClient (API Extraction) │   │  │
│  │  │  (Ribbon / Command)    │    │ - Pagination & Rate Limiting     │   │  │
│  │  └────────────────────────┘    │ - Student Submissions & Grades   │   │  │
│  │                                └─────────────────┬────────────────┘   │  │
│  │                                                  │                    │  │
│  │                                                  ▼                    │  │
│  │  ┌────────────────────────┐    ┌──────────────────────────────────┐   │  │
│  │  │  Asset & File Manager  │<───│ Link & HTML Rewriter             │   │  │
│  │  │  - Document Downloads  │    │ - Turndown GFM Converter         │   │  │
│  │  │  - Image Downloader    │    │ - Obsidian Wikilink Rewriter     │   │  │
│  │  │  - Attachment Inliner  │    │ - Markdown Table Pipe Escaping   │   │  │
│  │  └───────────┬────────────┘    └─────────────────┬────────────────┘   │  │
│  │              │                                   │                    │  │
│  │              ▼                                   ▼                    │  │
│  │  ┌────────────────────────────────────────────────────────────────┐   │  │
│  │  │  Vault Note & Asset Generator (main.ts)                        │   │  │
│  │  │  - Path Traversal Sanitization (security-utils.ts)             │   │  │
│  │  │  - Course Index, Home, Syllabus, Tasks, Grades, Calendar       │   │  │
│  │  │  - Hierarchical Module Notes & Overview Links                  │   │  │
│  │  └────────────────────────────────┬───────────────────────────────┘   │  │
│  └───────────────────────────────────┼───────────────────────────────────┘  │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Obsidian Vault Storage                                               │  │
│  │  └── Canvas/CS101 - Intro to CS/                                      │  │
│  │      ├── Course.md, Home.md, Syllabus.md, Grades.md                   │  │
│  │      ├── Tasks.md, Discussions.md, Calendar.md                        │  │
│  │      ├── Modules/01 - Week 1/01 - Page - Welcome.md                   │  │
│  │      ├── Files/ (PDF, DOCX, XLSX, etc.)                               │  │
│  │      └── Attachments/ (Images, Banners)                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 Canvas API Client (`apps/obsidian-plugin/src/canvas-api-client.ts`)
- **Direct REST Integration**: Uses Obsidian's `requestUrl` to communicate with standard Canvas LMS API endpoints.
- **Automatic Pagination**: Fetches paginated data streams via standard Canvas `Link: <url>; rel="next"` headers.
- **Deep Extraction**: Pulls comprehensive course data:
  - Course metadata, terms, and current/final grade scores.
  - Complete module hierarchy and module items.
  - Full wiki page HTML content.
  - Assignment specifications, due dates, points, structured rubrics, and the student's own submission files/feedback.
  - Discussion topics with full nested reply trees.
  - Calendar events and schedule milestones.
  - Course file catalog and binary download URLs.

### 2.2 Course Selection Modal (`apps/obsidian-plugin/src/course-select-modal.ts`)
- **Interactive UI**: Modal launched from the ribbon icon or command palette.
- **Live Course Listing**: Fetches the user's enrolled courses, displays enrollment terms and course codes, and provides interactive checkboxes, "Select All", and "Deselect All".
- **Batch Synchronization**: Syncs selected courses sequentially with real-time status notices.

### 2.3 Markdown Transformation & Wikilink Engine (`apps/obsidian-plugin/src/link-utils.ts`)
- **GFM Turndown Converter**: Converts Canvas rich text HTML into GitHub Flavored Markdown.
- **Internal Wikilink Resolution**: Rewrites Canvas course links (`/courses/123/pages/intro`) into direct Obsidian wikilinks (`[[Modules/01 - Week 1/01 - Page - Intro.md|Intro]]`).
- **Markdown Table Pipe Escaping**: Escapes alias pipes inside table cells (`[[path\|alias]]`) so Obsidian tables do not split columns on wikilink delimiters.
- **Image Embed Optimization**: Preserves banner graphics and button links as clean Obsidian embeds (`![[Attachments/Banner.png]]`).

### 2.4 Vault Writer & Asset Manager (`apps/obsidian-plugin/src/main.ts`)
- **Structured Hierarchy**: Generates notes according to user-configurable templates.
- **Local Asset Downloader**: Downloads course files (PDFs, DOCX, PPTX, etc.) and attachments into designated subfolders (`Files/`, `Attachments/`) while enforcing file size limits and extension filters.
- **Security & Path Sanitization**: Sanitizes directory names and paths against directory traversal and invalid filesystem characters.

---

## 3. Security & Privacy Model

| Aspect | Implementation |
| :--- | :--- |
| **API Token Storage** | Stored locally in your vault's plugin configuration (`.obsidian/plugins/canvas-sync-bridge/data.json`). Never transmitted anywhere except directly to your designated Canvas LMS domain. |
| **Zero Telemetry** | 100% local-first. No analytics, tracking, or intermediary servers. |
| **Secure HTTPS** | All Canvas API communication uses encrypted HTTPS directly through Obsidian's native network stack. |
| **Path Traversal Protection** | File names and paths are sanitized to prevent escape outside the configured vault folder. |
