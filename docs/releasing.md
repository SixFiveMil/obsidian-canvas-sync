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
3. Push a version tag that exactly matches the plugin version.
   - Example: `git tag 0.1.0`
   - `git push origin 0.1.0`
4. The release workflow will build and attach these files automatically:
   - `manifest.json`
   - `main.js`
5. Confirm the GitHub release was created for that tag and includes the generated assets.
6. Submit a PR to `obsidianmd/obsidian-releases` adding the plugin entry to `community-plugins.json`.

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
2. Push a release tag after updating the extension version.
3. Download the generated `canvas-to-obsidian-sync-<version>.zip` asset from the GitHub release.
4. Verify the ZIP contains a valid `manifest.json` at the root.
5. Ensure the manifest has current `name`, `version`, `description`, `icons`, `permissions`, and `host_permissions` values.
6. Load the unpacked extension from `apps/browser-extension/dist` and test the real sync flow.
7. Create the store listing assets:
   - icon set
   - screenshots
   - promotional artwork if requested by the dashboard
8. Prepare the Privacy tab answers for Canvas page and course data access, optional token storage in local browser storage, and localhost transfer to Obsidian.
9. Prepare reviewer instructions explaining how to test sync with Obsidian running locally.
10. Upload the ZIP in the Chrome Web Store dashboard and complete the Store Listing, Privacy, Distribution, and Test Instructions sections.

## GitHub Automation

This repository includes a release workflow in `.github/workflows/release.yml`.

- It runs on pushed tags matching `*.*.*`
- It can also be started manually for an existing tag with `workflow_dispatch`
- It verifies the tag matches `apps/obsidian-plugin/manifest.json`
- It runs tests, type checks, builds, and extension validation
- It creates a GitHub release automatically
- It uploads:
  - Obsidian `manifest.json`
  - Obsidian `main.js`
  - Chrome extension ZIP built from `apps/browser-extension/dist`

This automates GitHub artifact creation, but it does not submit to the Obsidian community directory or the Chrome Web Store. Those steps still require store-side actions.

### Reviewer notes to provide

- The extension only runs when the user manually opens the popup and triggers sync.
- Data is sent only to the local Obsidian bridge on `127.0.0.1` or `localhost`.
- The optional Canvas API token is stored locally in browser storage to improve extraction on institutions with restricted APIs.

## Versioning Notes

- The Obsidian plugin version and release tag must match exactly.
- The browser extension version in `apps/browser-extension/manifest.json` must increase for each new Chrome Web Store upload.
- Keep the plugin and extension versions aligned only if you intend to release them together; the stores do not require them to match.