# Release & Deployment Guide

This repository ships three deliverables:

- `apps/obsidian-plugin`: Obsidian community plugin (`manifest.json`, `main.js`)
- `apps/browser-extension` (Chrome): Chrome Manifest V3 extension (`canvas-to-obsidian-sync-chrome-<version>.zip`)
- `apps/browser-extension` (Firefox): Firefox Manifest V3 add-on (`canvas-to-obsidian-sync-firefox-<version>.zip`)

---

## 1. Local Build & Packaging Commands

All commands can be run from the monorepo root:

| Command | Description |
|---|---|
| `npm run build` | Builds Obsidian plugin and both Chrome and Firefox extensions. |
| `npm run build:extension` | Builds both Chrome and Firefox extension targets in `dist/chrome` and `dist/firefox`. |
| `npm run build:extension:chrome` | Builds only the Chrome extension output. |
| `npm run build:extension:firefox` | Builds only the Firefox extension output. |
| `npm run lint:extension` | Runs Mozilla's official `web-ext lint` on `dist/firefox`. |
| `npm run validate:extension` | Validates dist files, manifest structure, permissions, and host patterns for both targets. |
| `npm run package:extension` | Packages both Chrome and Firefox extensions into `release/*.zip` and computes SHA-256 checksums. |
| `npm run package:extension:chrome` | Packages only the Chrome extension zip. |
| `npm run package:extension:firefox` | Packages only the Firefox extension zip. |
| `npm run publish:extension:stores` | Deploys extensions to Chrome Web Store and/or Mozilla AMO (if credentials are set). |

---

## 2. Continuous Integration (CI)

The CI workflow (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

1. **Unit Tests**: Runs `npm test` (`vitest`).
2. **Type Checking**: Runs TypeScript checks (`tsc --noEmit`) for both the extension and Obsidian plugin.
3. **Build**: Builds Obsidian plugin, Chrome extension, and Firefox extension.
4. **Linting**: Runs `web-ext lint` on the Firefox output to ensure AMO compliance.
5. **Validation**: Validates dist files and manifests for Chrome and Firefox.
6. **Packaging Smoke Test**: Packages both zip files to ensure release artifacts build cleanly.

---

## 3. Automated Release Pipeline

The Release workflow (`.github/workflows/release.yml`) runs automatically on tag push (e.g. `0.2.3`) or via manual dispatch:

1. Verifies the tag matches `apps/obsidian-plugin/manifest.json`.
2. Runs all unit tests, typechecks, builds, and linting.
3. Packages both browser extensions into `release/canvas-to-obsidian-sync-chrome-<tag>.zip` and `release/canvas-to-obsidian-sync-firefox-<tag>.zip`.
4. Prepares Obsidian plugin assets (`release/obsidian-plugin/main.js`, `manifest.json`).
5. Generates SHA-256 `release/checksums.txt` for all assets.
6. Publishes a GitHub Release with all 5 assets attached.
7. Verifies asset integrity and zip archive structure (ensures root-level `manifest.json`).
8. **Automated Store Publishing**: Automatically uploads and submits the Chrome extension to Chrome Web Store and signs/submits to Mozilla AMO if repository secrets are configured. If secrets are not present, this step is skipped cleanly with helpful logs.

---

## 4. On-Demand Extension Deployment

Use the **Deploy Browser Extensions** workflow (`.github/workflows/deploy-extensions.yml`) in GitHub Actions to publish extensions on demand without cutting a new Git tag:

- Target selection: `all`, `chrome`, or `firefox`
- Auto-publish toggle: Submit Chrome extension for review or upload as draft
- AMO channel selection: `listed` (public store) or `unlisted` (self-hosted signed XPI)

---

## 5. Store Submission & Listing Guides

Detailed guides with complete listing copy, descriptions, permission justifications, reviewer notes, and store assets:

- **[Mozilla Add-ons (Firefox) Submission Guide](FIREFOX_ADDON_SUBMISSION.md)**: Full metadata, permitted tags (`scholar`, `privacy`, `download`), `amo-metadata.json` licensing, and reviewer testing steps.
- **[Chrome Web Store Submission Guide](CHROME_WEB_STORE_SUBMISSION.md)**: Full metadata, single-purpose statement, privacy certifications, and reviewer instructions.
- **[Store Assets Directory](store-assets/)**: Contains 128x128 icons, promotional banners, and high-resolution screenshots for both store listings:
  - `screenshot1_sync_popup.jpg`: Extension popup open over Canvas course dashboard
  - `screenshot2_obsidian_notes.jpg`: Synced course notes, checklist & syllabus in Obsidian
  - `screenshot3_privacy_architecture.jpg`: Localhost loopback architecture infographic
  - `promo_marquee_1400x560.jpg`: 1400x560 promo banner

---

## 6. Setting up Store Publishing Credentials

To enable automated store publishing, configure the following secrets in GitHub (**Settings -> Secrets and variables -> Actions**):

### Chrome Web Store (CWS)

| GitHub Secret | Description |
|---|---|
| `CHROME_EXTENSION_ID` | The 32-character extension ID from the Chrome Web Store developer dashboard. |
| `CHROME_CLIENT_ID` | OAuth 2.0 Client ID from Google Cloud Console. |
| `CHROME_CLIENT_SECRET` | OAuth 2.0 Client Secret from Google Cloud Console. |
| `CHROME_REFRESH_TOKEN` | OAuth 2.0 Refresh Token authorized for Chrome Web Store API (`https://www.googleapis.com/auth/chromewebstore`). |

### Mozilla Add-ons (AMO)

| GitHub Secret | Description |
|---|---|
| `WEB_EXT_API_KEY` | JWT issuer key from [AMO Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/). |
| `WEB_EXT_API_SECRET` | JWT secret from [AMO Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/). |

---

## 7. Obsidian Community Plugin Directory

Obsidian plugin submissions are handled through the developer portal at **[community.obsidian.md](https://community.obsidian.md)**:

1. Maintain the plugin-only mirror repo:
   - Configure remote: `npm run publish:plugin-repo -- --RemoteName obsidian-plugin --RemoteUrl https://github.com/SixFiveMil/canvas-sync-bridge-plugin.git`
   - Push updates & tag: `npm run publish:plugin-repo:tag -- --RemoteName obsidian-plugin`
2. In [community.obsidian.md](https://community.obsidian.md), link your repository and submit for review.
