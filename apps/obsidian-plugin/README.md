# Canvas Sync Bridge (Obsidian Plugin)

This plugin runs a localhost HTTP server and writes incoming Canvas course data to Markdown files in your vault.

## Build

From repo root:

- `npm install`
- `npm run build:plugin`

## Install in Obsidian

1. Open your vault folder.
2. Create plugin folder:
   - `.obsidian/plugins/canvas-sync-bridge`
3. Build the plugin with `npm run build:plugin`.
4. Copy these files from `apps/obsidian-plugin`:
   - `manifest.json`
   - `main.js`
5. Enable **Canvas Sync Bridge** in Obsidian Community Plugins.

## Configure

Plugin settings:

- Listen Port: default `27125`
- Root Folder: default `Canvas`
- Store Raw Payload: optional debug JSON dump

## Output Layout

For each course:

- `Canvas/<Course Name> (<Course ID>)/Course.md`
- `Canvas/<Course Name> (<Course ID>)/Home.md` when course home content is available
- `Canvas/<Course Name> (<Course ID>)/Syllabus.md` when syllabus content is available
- `Canvas/<Course Name> (<Course ID>)/Modules/<NN - Module Name>/<NN - Type - Title>.md`
- `Canvas/<Course Name> (<Course ID>)/Tasks.md`
- `Canvas/<Course Name> (<Course ID>)/Discussions.md`
- `Canvas/<Course Name> (<Course ID>)/Calendar.md`

Assignments preserve descriptions, tables, and rubric details when Canvas exposes them.

## Release Files

For an Obsidian community release, the GitHub release must include:

- `manifest.json`
- `main.js`

The GitHub release tag must match the version in `manifest.json` exactly, for example `0.1.0`.

## Security Note

The listener binds to `127.0.0.1` only, not your network interface.
The bridge only accepts requests from browser extension origins (`chrome-extension://` or `moz-extension://`) and requires the `X-Canvas-Sync-Client: canvas-browser-extension` request header.
