# Release Guide

This repository ships two separate deliverables:

- `apps/obsidian-plugin`: Obsidian community plugin
- `apps/browser-extension`: Chrome-compatible browser extension

## Obsidian Community Plugin

Official submission reference:

- https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin

### Pre-submit checklist

1. Confirm `apps/obsidian-plugin/manifest.json` has the correct `id`, `name`, `version`, `author`, and `description`.
2. Confirm `apps/obsidian-plugin/versions.json` maps the plugin version to the correct minimum Obsidian version.
3. Build the plugin:
   - `npm install`
   - `npm run build:plugin`
4. Verify these files exist and are current in `apps/obsidian-plugin/`:
   - `manifest.json`
   - `main.js`
5. Create a GitHub release whose tag matches the plugin version exactly.
   - Example: if `manifest.json` says `0.1.0`, the release tag must be `0.1.0`
   - Do not prefix the tag with `v`
6. Attach release assets:
   - `manifest.json`
   - `main.js`
7. Submit a PR to `obsidianmd/obsidian-releases` adding the plugin entry to `community-plugins.json`.

### Submission JSON fields

Use this shape when adding the entry to `community-plugins.json`:

```json
{
  "id": "canvas-sync-bridge",
  "name": "Canvas Sync Bridge",
  "author": "SixFiveMil",
  "description": "Receives Canvas data from a browser extension and syncs it into your vault.",
  "repo": "SixFiveMil/obsidian-canvas-sync"
}
```

## Chrome Web Store

Official publishing references:

- https://developer.chrome.com/docs/webstore/register/
- https://developer.chrome.com/docs/webstore/prepare/
- https://developer.chrome.com/docs/webstore/publish/

### Pre-submit checklist

1. Register a Chrome Web Store developer account and pay the one-time fee.
2. Build the extension:
   - `npm install`
   - `npm run build:extension`
3. Verify the built package contains a valid `manifest.json` at the ZIP root.
4. Ensure the manifest has current `name`, `version`, `description`, `icons`, `permissions`, and `host_permissions` values.
5. Load the unpacked extension from `apps/browser-extension/dist` and test the real sync flow.
6. Create the store listing assets:
   - icon set
   - screenshots
   - promotional artwork if requested by the dashboard
7. Prepare the Privacy tab answers for Canvas page and course data access, optional token storage in local browser storage, and localhost transfer to Obsidian.
8. Prepare reviewer instructions explaining how to test sync with Obsidian running locally.
9. Zip the contents of `apps/browser-extension/dist` so `manifest.json` is at the root of the ZIP.
10. Upload the ZIP in the Chrome Web Store dashboard and complete the Store Listing, Privacy, Distribution, and Test Instructions sections.

### Reviewer notes to provide

- The extension only runs when the user manually opens the popup and triggers sync.
- Data is sent only to the local Obsidian bridge on `127.0.0.1` or `localhost`.
- The optional Canvas API token is stored locally in browser storage to improve extraction on institutions with restricted APIs.

## Versioning Notes

- The Obsidian plugin version and release tag must match exactly.
- The browser extension version in `apps/browser-extension/manifest.json` must increase for each new Chrome Web Store upload.
- Keep the plugin and extension versions aligned only if you intend to release them together; the stores do not require them to match.