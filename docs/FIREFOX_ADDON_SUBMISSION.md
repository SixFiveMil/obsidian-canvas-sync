# Mozilla Add-ons (AMO) Submission & Listing Guide

This document contains the complete listing metadata, category/tag selections, permission explanations, reviewer testing instructions, and store asset references for publishing **Canvas to Obsidian Sync** on **Mozilla Add-ons (addons.mozilla.org)**.

---

## 1. Listing Metadata (Developer Hub)

### Add-on Name
```text
Canvas to Obsidian Sync
```

### Summary (138 characters / max 250 characters)
```text
Sync Canvas LMS courses, modules, assignments, announcements, and syllabus directly into your Obsidian vault as clean Markdown notes with one click.
```

### Description
```markdown
Seamlessly bridge your Canvas LMS course material into your local Obsidian vault.

### Key Features
- **One-Click Course Sync**: Extract course syllabi, modules, assignment details, announcements, and files directly from your active Canvas session.
- **Clean Markdown Output**: Formatted automatically with backlinks, course metadata, and structured task checklists.
- **Privacy & Security First**: Zero external telemetry. All course data travels directly from your browser to your local Obsidian app over localhost. No data ever leaves your computer.
- **Token-Free Browser Session**: Uses your existing logged-in Canvas session or optional Canvas API token for institutions with stricter API access.

---

### How to Use
1. Install and enable the **Canvas Sync Bridge** plugin in Obsidian (default bridge port: 27125).
2. Log into your university or school Canvas portal in Firefox.
3. Click the **Canvas to Obsidian Sync** extension icon in your toolbar and press **Sync Active Course**.
4. Your course notes and assignment tracking pages will automatically appear inside your Obsidian vault!

---

### Requirements
- Firefox 128+ or Firefox for Android 142+
- [Obsidian Desktop App](https://obsidian.md) with the Canvas Sync Bridge plugin enabled locally.

### Open Source & Privacy
This extension is open-source under the MIT license. Review our source code or report issues on [GitHub](https://github.com/SixFiveMil/obsidian-canvas-sync).
```

### Categories
- **Primary Category:** `Other` (or `Bookmarks` / `Search Tools`)

### Allowed Tags (Select up to 10 from AMO whitelist)
- `scholar` *(Academic, coursework, university)*
- `download` *(Exporting and saving course notes)*
- `search` *(Finding course materials)*
- `privacy` *(Local-only architecture, no cloud storage)*
- `security` *(Local loopback bridge)*
- `user scripts` *(In-browser content extraction)*

---

## 2. Store Assets (Screenshots & Icon)

All high-resolution screenshot assets are located in [`docs/store-assets/`](./store-assets/):

| Asset | File Path | Description |
|---|---|---|
| **Add-on Icon** | `docs/store-assets/icon128.png` | 128x128 PNG extension icon |
| **Screenshot 1** | `docs/store-assets/screenshot1_sync_popup.jpg` | Extension popup open over Canvas course dashboard |
| **Screenshot 2** | `docs/store-assets/screenshot2_obsidian_notes.jpg` | Synced course notes, checklist & syllabus in Obsidian |
| **Screenshot 3** | `docs/store-assets/screenshot3_privacy_architecture.jpg` | Localhost loopback architecture diagram |
| **Promo Banner** | `docs/store-assets/promo_marquee_1400x560.jpg` | 1400x560 marquee graphic |

---

## 3. Reviewer Testing Instructions (for Mozilla AMO QA)

Provide the following instructions in the **Reviewer Notes** box when submitting:

```text
Reviewer Testing Instructions:

This extension bridges Canvas LMS course data into a local note-taking app (Obsidian) via a localhost HTTP listener on 127.0.0.1:27125.

To test the extension without requiring an Obsidian installation, you can run a lightweight mock bridge server on localhost:

1. START LOCAL MOCK BRIDGE (One-line command in any Node.js terminal):
   node -e "const http=require('http'); http.createServer((req,res)=>{ res.setHeader('Access-Control-Allow-Origin', req.headers.origin||'*'); res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Canvas-Sync-Client'); if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;} if(req.url==='/canvas-sync'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));console.log('Sync payload received successfully!');}else{res.writeHead(404);res.end();} }).listen(27125,'127.0.0.1',()=>console.log('Mock bridge listening on 127.0.0.1:27125'));"

2. VERIFY BRIDGE CONNECTION:
   - Click the extension icon in Firefox toolbar to open the popup.
   - Click "Test Bridge".
   - You will see "Bridge reachable on localhost." in green.

3. TEST COURSE EXTRACTION & PRE-SYNC EDITING:
   - Navigate to any Canvas course page (e.g. https://canvas.instructure.com/courses/1 or any Canvas sandbox/free for teacher course).
   - Open the extension popup.
   - The "Course Code" and "Course Name" fields automatically populate.
   - Click "Sync Active Course".
   - Status displays "Sync complete. Check Obsidian for updated files."
   - The terminal prints "Sync payload received successfully!".

All data extraction and communication is strictly local between the browser tab and 127.0.0.1 loopback interface. Zero remote telemetry or tracking servers are contacted.
```

---

## 4. Technical Configuration Reference

### Manifest Configuration (`manifest.firefox.json`)
```json
{
  "manifest_version": 3,
  "browser_specific_settings": {
    "gecko": {
      "id": "canvas-to-obsidian-sync@local.dev",
      "strict_min_version": "142.0",
      "data_collection_permissions": {
        "required": ["none"]
      }
    }
  },
  "background": {
    "scripts": ["background.js"]
  }
}
```

### Automated Submission Metadata (`amo-metadata.json`)
```json
{
  "categories": ["other"],
  "version": {
    "license": "MIT"
  }
}
```

### GitHub Secrets for Automated Release
Configure in GitHub Repository Settings &rarr; **Secrets and variables &rarr; Actions**:
- `WEB_EXT_API_KEY`: JWT issuer key from [AMO Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/)
- `WEB_EXT_API_SECRET`: JWT secret from [AMO Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/)
