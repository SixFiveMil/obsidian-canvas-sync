# Canvas to Obsidian Sync (Browser Extension)

Manifest v3 extension that extracts Canvas course data from your logged-in browser session and forwards it to the local Obsidian bridge.

## Build

From repo root:

- `npm install`
- `npm run build:extension`

## Load in Browser

1. Open extension management page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select `apps/browser-extension/dist`.

## Use

1. Open a Canvas course page (`.../courses/<id>`).
2. Open extension popup.
3. Ensure bridge port matches Obsidian plugin setting (default `27125`).
4. Optionally provide a Canvas API token if your institution restricts some API calls.
5. Click **Sync Active Course**.

## Data Sources

- Course home page and syllabus when available
- Modules and ordered module items
- Pages: Canvas API `/api/v1/courses/:id/pages` + page detail endpoint
- Assignments: Canvas API `/api/v1/courses/:id/assignments`
- Discussions: Canvas discussion endpoints
- Events: Canvas API `/api/v1/calendar_events?context_codes[]=course_<id>`

If page API calls fail, the extension falls back to scraping visible page HTML from the open tab.

The extension only sends extracted content to the local Obsidian bridge on `127.0.0.1` or `localhost`.
