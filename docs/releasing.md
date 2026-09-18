# Release & Deployment Guide

This repository maintains the **Canvas Sync** Obsidian community plugin.

---

## 1. Local Build Commands

All commands can be run from the repository root:

| Command | Description |
|---|---|
| `npm run build` | Builds the production Obsidian plugin bundle (`main.js`). |
| `npm run dev` | Runs `esbuild` in watch mode for active plugin development. |
| `npm test` | Runs the full Vitest unit test suite. |
| `npm run typecheck` | Type-checks all TypeScript source and test files (`tsc --noEmit`). |

---

## 2. Continuous Integration (CI)

The CI workflow (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

1. **Unit Tests**: Runs `npm test` (`vitest`).
2. **Type Checking**: Runs TypeScript checks (`tsc --noEmit`).
3. **Build**: Builds the production Obsidian plugin bundle with `esbuild`.

---

## 3. Automated Release Pipeline

The Release workflow (`.github/workflows/release.yml`) runs automatically on tag push (e.g. `0.2.5`) or via manual dispatch:

1. Verifies the tag matches `manifest.json`.
2. Runs all unit tests, typechecks, and production build.
3. Prepares release assets (`manifest.json`, `main.js`, and `checksums.txt` with SHA-256 hashes).
4. Attests build provenance using GitHub's artifact attestations.
5. Publishes a GitHub Release with all assets attached.
6. Verifies uploaded release asset integrity and sizes.

---

## 4. Manual / BRAT Installation

Users can install the plugin directly via [Obsidian BRAT](https://github.com/TfTHacker/obsidian42-brat) using the repository URL:
```text
https://github.com/SixFiveMil/obsidian-canvas-sync
```
Or by placing `main.js` and `manifest.json` from the latest GitHub Release into `<Vault>/.obsidian/plugins/canvas-sync-bridge/`.

