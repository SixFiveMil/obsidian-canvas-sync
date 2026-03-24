# Canvas Sync Bridge (Obsidian Plugin)

This plugin runs a localhost HTTP server and writes incoming Canvas data to Markdown files in your vault.

## Build

From repo root:

- `npm install`
- `npm run build:plugin`

## Install in Obsidian

1. Open your vault folder.
2. Create plugin folder:
   - `.obsidian/plugins/canvas-sync-bridge`
3. Copy these files from `apps/obsidian-plugin`:
   - `manifest.json`
   - `main.js`
4. Enable **Canvas Sync Bridge** in Obsidian Community Plugins.

## Configure

Plugin settings:

- Listen Port: default `27124`
- Root Folder: default `Canvas`
- Store Raw Payload: optional debug JSON dump

## Output Layout

For each course:

- `Canvas/<Course Name> (<Course ID>)/Course.md`
- `Canvas/<Course Name> (<Course ID>)/Pages/*.md`
- `Canvas/<Course Name> (<Course ID>)/Tasks.md`
- `Canvas/<Course Name> (<Course ID>)/Calendar.md`

## Security Note

The listener binds to `127.0.0.1` only, not your network interface.
