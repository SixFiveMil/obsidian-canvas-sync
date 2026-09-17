# Canvas to Obsidian Sync (Browser Extension)

Manifest V3 browser extension that extracts Canvas LMS course content from your active logged-in browser session and syncs it to Obsidian over a local loopback bridge (`127.0.0.1:27125`).

---

## Installation

### Method 1: Web Stores (Recommended)
- **Chrome / Edge / Brave / Arc / Opera**: [Chrome Web Store](https://chromewebstore.google.com/detail/canvas-to-obsidian-sync/oiakmbihplldnhabhnihnekjddenbiom?authuser=0&hl=en)
- **Firefox**: [Firefox Add-ons (AMO)](https://addons.mozilla.org/en-US/firefox/addon/canvas-to-obsidian-sync/) *(pending review)*

### Method 2: Pre-built ZIP Archive (No build required)
1. Download `canvas-to-obsidian-sync-chrome-<version>.zip` (or `canvas-to-obsidian-sync-firefox-<version>.zip`) from [GitHub Releases](https://github.com/SixFiveMil/obsidian-canvas-sync/releases/latest).
2. Unzip the downloaded file.
3. **Chromium (Chrome / Edge / Brave / Arc)**:
   - Go to `chrome://extensions` or `edge://extensions`.
   - Toggle on **Developer mode** (top-right).
   - Click **Load unpacked** and select the unzipped directory.
4. **Firefox**:
   - Go to `about:debugging#/runtime/this-firefox`.
   - Click **Load Temporary Add-on...** and select `manifest.json` from the unzipped directory.

---

## Usage

1. Open any Canvas course page (`.../courses/<id>`).
2. Click the **Canvas to Obsidian Sync** extension icon in your browser toolbar.
3. Ensure the **Bridge Port** matches your Obsidian plugin setting (`27125` by default).
4. Click **Test Bridge** to verify connection to Obsidian.
5. Click **Sync Active Course**.

---

## Data Sources

- Course home page and syllabus content
- Modules and ordered module items
- Pages: Canvas API `/api/v1/courses/:id/pages` + page detail endpoint
- Assignments & Rubrics: Canvas API `/api/v1/courses/:id/assignments`
- Discussions: Canvas discussion endpoints
- Events: Canvas API `/api/v1/calendar_events?context_codes[]=course_<id>`

If page API calls fail, the extension automatically falls back to parsing visible page HTML from the open tab.

---

## Building from Source (Developers)

```bash
# From repo root
npm install

# Build Chrome & Firefox extension targets
npm run build:extension

# Package release archives
npm run package:extension
```
