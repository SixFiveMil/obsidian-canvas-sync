# Canvas Sync Bridge (Obsidian Plugin)

This plugin runs a local loopback HTTP bridge server (`127.0.0.1:27125`) inside Obsidian Desktop and writes incoming Canvas course data (modules, syllabi, assignments, calendars) into formatted Markdown vault notes.

## Installation

### Method 1: Obsidian Community Plugins (Recommended)
1. In Obsidian, go to **Settings** > **Community Plugins**.
2. Search for **Canvas Sync Bridge**.
3. Click **Install**, then click **Enable**.

### Method 2: Manual Installation (GitHub Releases)
1. Download `manifest.json` and `main.js` from the [Latest GitHub Release](https://github.com/SixFiveMil/obsidian-canvas-sync/releases/latest).
2. In your Obsidian vault, navigate to `.obsidian/plugins/canvas-sync-bridge/` (create this folder if it does not exist).
3. Place `manifest.json` and `main.js` into this folder.
4. Reload Obsidian plugins and enable **Canvas Sync Bridge**.

---

## Companion Browser Extension

This plugin receives data from the companion browser extension:
- **Chrome / Edge / Brave / Arc / Opera**: [Chrome Web Store](https://chromewebstore.google.com/detail/canvas-to-obsidian-sync/oiakmbihplldnhabhnihnekjddenbiom?authuser=0&hl=en)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/canvas-to-obsidian-sync/) *(pending review)*
- **Pre-built ZIP**: [GitHub Releases](https://github.com/SixFiveMil/obsidian-canvas-sync/releases/latest)

---

## Configuration

| Setting | Default | Description |
| :--- | :--- | :--- |
| **Listen Port** | `27125` | Local TCP port for the loopback HTTP bridge listener (`127.0.0.1`). |
| **Root Folder** | `Canvas` | Destination folder path within the Obsidian vault for synced course notes. |
| **Course Folder Template** | `{{courseCode}} - {{courseName}}` | Formatting template for course directories. Supports `{{courseCode}}`, `{{courseName}}`, and `{{courseId}}`. |
| **Store Raw Payload** | `false` | When enabled, writes raw unparsed JSON payload to `_raw_payload.json` for debugging. |

---

## Output Layout

For each synced course:

```
Canvas/<Course Name> (<Course ID>)/
├── Course.md         # Master index note with metadata and quick links
├── Home.md           # Course home page content (if available)
├── Syllabus.md       # Complete syllabus text and course policies
├── Tasks.md          # Assignments, due dates, point values, and rubrics
├── Discussions.md    # Discussion board topics and prompts
├── Calendar.md       # Course events, exam dates, and milestones
└── Modules/
    └── <NN - Module Name>/
        └── <NN - Type - Title>.md
```

Assignments preserve descriptions, GFM tables, and rubric details when Canvas exposes them.

---

## Development & Building from Source

```bash
npm install
npm run build:plugin
```

---

## Security

- The bridge listener binds strictly to `127.0.0.1` (localhost only).
- It only accepts inbound requests originating from browser extension schemes (`chrome-extension://` or `moz-extension://`) and requires the `X-Canvas-Sync-Client: canvas-browser-extension` header.
