# Canvas to Obsidian Sync

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.3-green.svg)](package.json)
[![CI](https://github.com/SixFiveMil/obsidian-canvas-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/SixFiveMil/obsidian-canvas-sync/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Firefox](https://img.shields.io/badge/Firefox-Add--on-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/)
[![Privacy: Zero Telemetry](https://img.shields.io/badge/Privacy-Zero%20Telemetry-success.svg)](PRIVACY.md)

> Seamlessly bridge Canvas LMS courses, modules, assignments, and syllabi directly into your Obsidian knowledge vault as clean, structured, and cross-linked Markdown notes.

---

## Key Features

- 🔒 **100% Local-First & Zero Telemetry**: All course extraction occurs client-side in your browser and streams directly to Obsidian over an internal loopback bridge (`127.0.0.1`). No cloud servers, analytics, or third-party tracking.
- ⚡ **Zero Token Friction (Session-Based)**: Extracts rich coursework directly using your existing logged-in browser session. No administrative API tokens or developer keys required.
- 📑 **Clean Markdown & Table Conversion**: Converts messy Canvas HTML, course pacing guides, assignment briefs, and rubric tables into clean GitHub Flavored Markdown (GFM) tables and formatted callouts.
- 🗂️ **Structured Course Vault Layout**: Automatically organizes modules, lectures, assignment checklists, syllabi, and calendar events into an intuitive, customizable folder hierarchy.
- 🌐 **Multi-Browser Manifest V3 Support**: Native compatibility with Google Chrome, Brave, Microsoft Edge, and Mozilla Firefox.

---

## Architecture & How It Works

Canvas to Obsidian Sync employs a two-tier local bridge architecture:

```mermaid
sequenceDiagram
    autonumber
    actor User as Student / Researcher
    participant Browser as Browser Extension (Manifest V3)
    participant Bridge as Obsidian Plugin (127.0.0.1:27125)
    participant Vault as Obsidian Vault (Markdown)

    User->>Browser: Open Canvas Course & Click "Sync Active Course"
    Browser->>Browser: Extract DOM & Syllabus / Module / Assignment Data
    Browser->>Browser: Construct Versioned JSON Envelope
    Browser->>Bridge: HTTP POST /canvas-sync (X-Canvas-Sync-Client header)
    Bridge->>Bridge: Validate Origin & Envelope Schema
    Bridge->>Bridge: Convert HTML to GFM Tables & Markdown (Turndown)
    Bridge->>Vault: Write Course.md, Home.md, Modules, Tasks.md, Calendar.md
    Bridge-->>Browser: 200 OK (Sync Summary)
    Browser-->>User: Visual Sync Success Notice
```

For full architectural specifications, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Prerequisites & Installation

- **Node.js**: v20.x or higher
- **Obsidian**: v1.5.0 or higher (Desktop)
- **Browser**: Google Chrome, Brave, Microsoft Edge, or Mozilla Firefox

### 1. Install the Obsidian Desktop Plugin

1. Clone or download the repository release:
   ```bash
   git clone https://github.com/SixFiveMil/obsidian-canvas-sync.git
   cd obsidian-canvas-sync
   ```
2. Install dependencies and build the plugin:
   ```bash
   npm install
   npm run build:plugin
   ```
3. Copy `apps/obsidian-plugin/main.js` and `apps/obsidian-plugin/manifest.json` into your vault directory under:
   ```
   <Your-Vault>/.obsidian/plugins/canvas-sync-bridge/
   ```
4. Open **Obsidian Settings** > **Community Plugins** > Enable **Canvas Sync Bridge**.

### 2. Install the Browser Extension

#### Chrome / Edge / Brave (Chromium)
1. Build the extension:
   ```bash
   npm run build:extension:chrome
   ```
2. Open `chrome://extensions/` (or `edge://extensions/`) and enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the directory:
   ```
   apps/browser-extension/dist/chrome
   ```

#### Firefox
1. Build the Firefox extension:
   ```bash
   npm run build:extension:firefox
   ```
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and select `apps/browser-extension/dist/firefox/manifest.json`.

---

## Quick Start & Usage

1. Open your institution's Canvas LMS in your browser and navigate to any course home page (e.g., `https://canvas.instructure.com/courses/12345`).
2. Click the **Canvas to Obsidian Sync** extension icon in your browser toolbar.
3. Verify the **Bridge Port** matches your Obsidian plugin configuration (`27125` by default).
4. Click **Test Bridge** to confirm connectivity to your active Obsidian instance.
5. Click **Sync Active Course**. The extension will parse course materials and transmit them to your vault in seconds.

---

## Generated Vault Structure

Synced courses are written directly to your vault using the configured template (default: `{{courseCode}} - {{courseName}}`):

```
Canvas/
└── CS101 - Intro to Computer Science/
    ├── Course.md         # Master index note with metadata and quick links
    ├── Home.md           # Course home page content
    ├── Syllabus.md       # Complete syllabus text and course policies
    ├── Tasks.md          # All assignments, due dates, point values, and rubrics
    ├── Discussions.md    # Discussion board topics and prompts
    ├── Calendar.md       # Course events, exam dates, and milestones
    └── Modules/
        ├── 01 - Week 1 - Foundations/
        │   ├── 01 - Page - Welcome & Setup.md
        │   └── 02 - Assignment - Lab 1 Setup.md
        └── 02 - Week 2 - Data Structures/
            ├── 01 - Page - Arrays & Linked Lists.md
            └── 02 - Assignment - Homework 1.md
```

---

## Configuration

### Obsidian Plugin Settings

| Setting | Default Value | Description |
| :--- | :--- | :--- |
| **Listen Port** | `27125` | Local TCP port for the loopback HTTP bridge listener (`127.0.0.1`). |
| **Root Folder** | `Canvas` | Destination folder path within the Obsidian vault for synced course notes. |
| **Course Folder Template** | `{{courseCode}} - {{courseName}}` | Formatting template for course directories. Supports `{{courseCode}}`, `{{courseName}}`, and `{{courseId}}`. |
| **Store Raw Payload** | `false` | When enabled, writes the raw unparsed JSON payload to `_raw_payload.json` for debugging. |

### Browser Extension Options

| Option | Default | Description |
| :--- | :--- | :--- |
| **Bridge Port** | `27125` | Local port of the target Obsidian desktop plugin instance. |
| **Optional Canvas API Token** | *None* | Optional personal Canvas API token for institutions restricting web-based scraping endpoints. Stored strictly in local browser storage. |

---

## Development & Testing

```bash
# Run unit tests across all workspaces
npm test

# Type-check TypeScript files
npx tsc -p apps/browser-extension/tsconfig.json --noEmit
npx tsc -p apps/obsidian-plugin/tsconfig.json --noEmit

# Build all targets (Plugin + Chrome + Firefox)
npm run build

# Validate extension manifests and dist artifacts
npm run validate:extension

# Lint Firefox extension with web-ext
npm run lint:extension

# Package extension release archives
npm run package:extension
```

---

## Security & Privacy

- **Local-Only Bridge**: The internal HTTP listener binds strictly to `127.0.0.1`. It will never accept connections from outside your local computer.
- **Origin Guard**: Inbound sync requests verify browser extension origins (`chrome-extension://` / `moz-extension://`) and require custom application headers (`X-Canvas-Sync-Client`).
- **Path Traversal Protection**: All folder and file paths are sanitized against illegal filesystem characters and directory traversal patterns.
- Read the complete [Security Policy](SECURITY.md) and [Privacy Policy](PRIVACY.md).

---

## Author & License

Developed and maintained by **Joshua A. Wortz** ([SixFiveMil](https://github.com/SixFiveMil)).

Licensed under the [MIT License](LICENSE).
