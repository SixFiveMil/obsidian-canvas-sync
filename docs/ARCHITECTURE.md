# System Architecture & Technical Design

## 1. Architectural Overview

**Canvas to Obsidian Sync** bridges institutional Canvas LMS courses into an Obsidian knowledge vault as clean, structured, and cross-linked Markdown notes. 

The system uses a **decoupled, local-first multi-tier architecture** that sidesteps the common friction of manual API token creation, permission gating, or third-party cloud hosting.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER ENVIRONMENT                             │
│                                                                             │
│  ┌─────────────────────────┐               ┌─────────────────────────────┐  │
│  │   Active Canvas Tab     │               │   Extension Context         │  │
│  │  (canvas.instructure)   │ ──DOM / API──>│  - popup.ts (UI)            │  │
│  │  - Active Session Auth  │   Extraction  │  - background.ts (Worker)   │  │
│  │  - Modules / Pages / HW │               │  - sync-utils.ts (Parser)   │  │
│  └─────────────────────────┘               └──────────────┬──────────────┘  │
└───────────────────────────────────────────────────────────┼─────────────────┘
                                                            │ HTTP POST (JSON)
                                     Local Loopback Bridge  │ Headers: X-Canvas-Sync-Client
                                     127.0.0.1:27125        │ Origin: chrome-extension://...
                                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OBSIDIAN VAULT PROCESS                            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Canvas Sync Bridge Plugin (apps/obsidian-plugin)                     │  │
│  │                                                                       │  │
│  │  ┌───────────────────┐    ┌─────────────────────┐    ┌─────────────┐  │  │
│  │  │ HTTP Loopback Svr │───>│ Security & Envelope │───>│ Custom GFM  │  │  │
│  │  │ (127.0.0.1:27125) │    │ Validator (Guard)   │    │ Turndown Svc│  │  │
│  │  └───────────────────┘    └─────────────────────┘    └──────┬──────┘  │  │
│  │                                                             │         │  │
│  │                                                             ▼         │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Vault Writer & Template Formatter (template-utils.ts)           │  │  │
│  │  │ - Path traversal sanitization                                   │  │  │
│  │  │ - Hierarchical folder structuring                               │  │  │
│  │  │ - Markdown file persistence & conflict mitigation               │  │  │
│  │  └─────────────────────────────────┬───────────────────────────────┘  │  │
│  └────────────────────────────────────┼──────────────────────────────────┘  │
│                                       ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Obsidian Vault Filesystem                                            │  │
│  │  └── Canvas/CS101 - Intro to CS/                                      │  │
│  │      ├── Course.md, Home.md, Syllabus.md                              │  │
│  │      ├── Modules/01 - Week 1/01 - Page - Welcome.md                   │  │
│  │      └── Tasks.md, Discussions.md, Calendar.md                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 Browser Extension (`apps/browser-extension`)

- **Manifest V3 Architecture**: Built to execute in modern browser environments across Chromium (Chrome, Brave, Edge) and Gecko (Firefox).
- **Session-Authenticated Scraper & API Client**:
  - Leverages the student's active, authenticated session with Canvas LMS via `activeTab` permissions.
  - Interacts with Canvas REST endpoints (`/api/v1/courses/:id/...`) when accessible.
  - Implements dynamic DOM scraping fallback routines in `sync-utils.ts` when institutions restrict direct REST API access or when viewing complex Canvas modules.
- **Payload Packaging**: Serializes course details, modules, syllabus HTML, assignments, rubrics, discussions, and calendar events into a versioned `CanvasSyncEnvelope` structure.

### 2.2 Local HTTP Bridge (`apps/obsidian-plugin/src/main.ts`)

- **Node.js HTTP Server**: Runs an in-memory HTTP server directly inside the Obsidian desktop runtime.
- **Port Configuration**: Defaults to port `27125` (configurable via plugin settings).
- **Loopback Enforcement**: Explicitly binds to IPv4 loopback `127.0.0.1` to ensure no remote or local network exposure.

### 2.3 Markdown Transformation Engine (`apps/obsidian-plugin/src/table-utils.ts`)

- **Turndown GFM Engine**: Custom configured instance of `turndown` with GitHub Flavored Markdown (GFM) table and list extensions.
- **Rich Content Sanitization**: Converts Canvas HTML content (embedded assignment instructions, syllabus text, rubric grids, discussion prompts) into clean, standard Markdown.
- **HTML Table Preservation**: Cleans messy HTML table formatting into standard Markdown pipe tables, with fallback preservation for complex nested structures.

### 2.4 Vault Writer & Path Manager (`apps/obsidian-plugin/src/template-utils.ts`)

- **Vault Structure Generator**: Constructs hierarchical folders per course:
  - `{{rootFolder}}/{{courseFolder}}/Course.md`: Main index note with metadata, recent updates, and navigation.
  - `{{rootFolder}}/{{courseFolder}}/Home.md`: Course front page / welcome content.
  - `{{rootFolder}}/{{courseFolder}}/Syllabus.md`: Full syllabus text with grading breakdown.
  - `{{rootFolder}}/{{courseFolder}}/Modules/<Order - Name>/<Order - Type - Title>.md`: Individual module items, lectures, external links, and reading notes.
  - `{{rootFolder}}/{{courseFolder}}/Tasks.md`: Aggregated assignment list with due dates, points, submission types, and rubrics.
  - `{{rootFolder}}/{{courseFolder}}/Discussions.md`: Discussion boards and prompts.
  - `{{rootFolder}}/{{courseFolder}}/Calendar.md`: Course calendar events and milestones.
- **File Path Sanitization**: Strips forbidden filesystem characters (`/ \ : * ? " < > |`) and normalizes paths via Obsidian's `normalizePath` utility to prevent directory traversal.

---

## 3. Communication Protocol & Payload Schema

Communication between the browser extension and Obsidian occurs via HTTP POST to `http://127.0.0.1:<port>/canvas-sync`.

### 3.1 Request Envelope Format

```json
{
  "source": "canvas-browser-extension",
  "version": "1",
  "exportedAt": "2026-09-17T08:00:00.000Z",
  "payload": {
    "courseId": "12345",
    "courseName": "CS 101: Introduction to Computer Science",
    "courseCode": "CS101",
    "homeHtml": "<p>Welcome to CS101...</p>",
    "syllabusHtml": "<h2>Course Policies</h2>...",
    "modules": [
      {
        "id": "m-101",
        "name": "Week 1: Foundations",
        "position": 1,
        "items": [
          {
            "id": "item-1",
            "title": "Lecture 1 Slides",
            "type": "Page",
            "html": "<p>Lecture content...</p>",
            "url": "https://canvas.instructure.com/courses/12345/pages/lec-1"
          }
        ]
      }
    ],
    "assignments": [
      {
        "id": "a-501",
        "name": "Homework 1",
        "dueAt": "2026-09-24T23:59:00Z",
        "pointsPossible": 100,
        "descriptionHtml": "<p>Submit your code...</p>",
        "rubric": []
      }
    ],
    "discussions": [],
    "events": []
  }
}
```

---

## 4. Security & Isolation Controls

| Threat Vector | Mitigation Strategy | Implementation Location |
| :--- | :--- | :--- |
| **Unauthorized Remote Access** | Server binds strictly to `127.0.0.1` (never `0.0.0.0`). | [`main.ts`](file:///apps/obsidian-plugin/src/main.ts) |
| **Malicious Webpage CSRF** | Rejects any Origin not starting with `chrome-extension://` or `moz-extension://`. Enforces `X-Canvas-Sync-Client` custom header. | [`main.ts`](file:///apps/obsidian-plugin/src/main.ts) |
| **Path Traversal Attacks** | Course titles, module names, and file paths are sanitized with regex character stripping and resolved using `normalizePath`. | [`security-utils.ts`](file:///apps/obsidian-plugin/src/security-utils.ts) |
| **Malformed Payload Injection** | Strict validation of payload envelope version, source identifier, and required course metadata. | [`security-utils.ts`](file:///apps/obsidian-plugin/src/security-utils.ts) |
| **Data Leakage / Telemetry** | 100% local-first data lifecycle; zero network egress beyond localhost loopback. | [`PRIVACY.md`](file:///PRIVACY.md) |

---

## 5. Build & Packaging Pipeline

The repository uses npm workspaces managing two sub-projects:

- `apps/obsidian-plugin`: Transpiles TypeScript using `esbuild` to a single production `main.js` bundle targeting Obsidian Desktop API.
- `apps/browser-extension`: Transpiles TypeScript and bundles HTML/assets using `esbuild` for Chrome Manifest V3 and Firefox Manifest V3 targets.

Automated distribution packaging creates:
- `canvas-to-obsidian-sync-chrome-<version>.zip`
- `canvas-to-obsidian-sync-firefox-<version>.zip`
- `obsidian-plugin/main.js` + `obsidian-plugin/manifest.json`
- `checksums.txt` with SHA-256 verification hashes for all release artifacts.

