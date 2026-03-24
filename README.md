# Obsidian Canvas Sync

Sync Canvas LMS course content into Obsidian.

This starter includes:

- An Obsidian desktop plugin that accepts sync payloads and writes Markdown files.
- A browser extension that runs on Canvas pages and sends course/module/task/event data to Obsidian.

## Why this architecture?

Canvas API access can be limited for students. The browser extension uses your existing logged-in Canvas session in the browser, then forwards extracted data to Obsidian over localhost.

## Structure

- `apps/obsidian-plugin`: Obsidian plugin (TypeScript)
- `apps/browser-extension`: Browser extension (Manifest v3)

## Quick start

1. Install Node.js 20+.
2. Run `npm install` in the repo root.
3. Build everything with `npm run build`.
4. Load the Obsidian plugin from `apps/obsidian-plugin` into your vault's `.obsidian/plugins/<plugin-id>` folder.
5. Load the extension from `apps/browser-extension/dist` in your browser's developer extension page.

Detailed setup and usage docs are in each app folder.

## Release

Release guidance for the Obsidian community plugin and Chrome Web Store package is in `docs/releasing.md`.
