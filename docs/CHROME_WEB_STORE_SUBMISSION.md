# Chrome Web Store Submission Guide: Canvas to Obsidian Sync

This document contains the complete listing metadata, permission justifications, privacy disclosure responses, and reviewer instructions required for publishing **Canvas to Obsidian Sync** on the Google Chrome Web Store.

---

## 1. Store Listing Information

### Extension Title
```
Canvas to Obsidian Sync
```

### Short Description (131 characters / max 132 characters)
```
Extract Canvas LMS modules, pages, and assignments from your active course and sync directly into Obsidian as clean Markdown notes.
```

### Category
- **Primary:** Productivity
- **Secondary:** Workflow & Planning

### Pricing & Distribution
- **Price:** Free
- **Visibility:** Public
- **Regions:** All regions

### Store Assets (Pixel-Perfect & No Alpha Channel)
All assets are located in [`docs/store-assets/`](./store-assets/) and comply with Chrome Web Store upload specifications (available in both JPEG and 24-bit PNG without alpha):
- **Store Icon (128x128 PNG):** `docs/store-assets/icon128.png`
- **Small Promo Tile (440x280 Canvas):**
  - `docs/store-assets/promo_small_440x280.jpg` (JPEG)
  - `docs/store-assets/promo_small_440x280.png` (24-bit RGB PNG, no alpha)
- **Marquee Promo Tile (1400x560 Canvas):**
  - `docs/store-assets/promo_marquee_1400x560.jpg` (JPEG)
  - `docs/store-assets/promo_marquee_1400x560.png` (24-bit RGB PNG, no alpha)
- **Screenshots (1280x800):**
  - Screenshot 1 (Sync Flow & Popup): `docs/store-assets/screenshot_1280x800.jpg` / `.png`
  - Screenshot 2 (Rendered Obsidian Notes & GFM Tables): `docs/store-assets/screenshot2_obsidian_notes_1280x800.jpg` / `.png`

---

## 2. Full Description (Markdown for Web Store Listing)

```markdown
Bridge your Canvas LMS coursework directly into your Obsidian vault as clean, beautifully formatted Markdown notes.

Canvas to Obsidian Sync is a privacy-first companion extension designed for students, researchers, and educators who use Obsidian for knowledge management and note-taking. With a single click, extract course modules, assignments, discussions, announcements, and complex pacing guides directly from your active Canvas course and import them into your local vault.

KEY FEATURES:

✓ Pre-Sync Course Customization:
Auto-detects course codes (e.g. CSOL-500) and course titles with editable fields before syncing, letting you verify and customize folder names in advance.

✓ Clean Markdown Conversion:
Converts Canvas pages, syllabus documents, and complex pacing tables into clean GitHub Flavored Markdown (GFM) tables without raw HTML tags or messy inline CSS styles.

✓ Complete Course Hierarchy:
Organizes modules, assignments, rubrics, and discussion prompts into a structured vault folder hierarchy with configurable templates (e.g., `{{courseCode}} - {{courseName}}`).

✓ Embedded Visuals:
Inlines authenticated Canvas course images and diagrams directly into your notes so your materials remain readable offline.

✓ Privacy-First & Local-Only:
All processing runs locally in your browser. Data is transmitted exclusively to your local Obsidian desktop application via a secure loopback connection (127.0.0.1). Zero cloud servers, zero telemetry, zero tracking.

HOW TO USE:

1. Install the "Canvas Sync Bridge" plugin in Obsidian and enable it (default port: 27125).
2. Log into your university or school Canvas LMS and navigate to any course page.
3. Click the Canvas to Obsidian Sync extension icon in your toolbar.
4. Review the auto-detected Course Code and Course Name (edit if desired).
5. Click "Sync Active Course". Your course notes, syllabus, and assignments will immediately appear in your Obsidian vault!

REQUIREMENTS:
- Obsidian desktop app with the Canvas Sync Bridge plugin enabled.
- An active Canvas LMS student or instructor account.
```

---

## 3. Single Purpose Statement & Permission Justifications

### Single Purpose Statement
> The sole purpose of Canvas to Obsidian Sync is to extract academic course content (pages, assignments, discussions, syllabus, and pacing tables) from an active Canvas LMS browser session and securely transfer it via a local loopback bridge (127.0.0.1) into the user's personal Obsidian vault as structured Markdown.

### Permission Justifications

| Permission | Justification |
| :--- | :--- |
| `activeTab` | Required to access the active tab only when the user explicitly clicks the extension popup to inspect or sync course data from their Canvas LMS tab. |
| `scripting` | Required to execute content extraction scripts within the active Canvas tab to parse the course DOM, retrieve module items, inline course images, and extract official course metadata. |
| `tabs` | Required to verify the active tab URL matches an active Canvas course route (`/courses/{id}`) and prevent execution on unrelated websites. |
| `storage` | Required to store user settings locally in browser storage (e.g. local bridge port and optional user-provided Canvas API access token for schools with restricted page APIs). |
| `host_permissions`<br>`http://127.0.0.1/*`<br>`http://localhost/*` | Required to send HTTP POST requests containing the course Markdown payload to the local Obsidian bridge server running strictly on the user's loopback interface. |
| `host_permissions`<br>`https://*.instructure.com/*`<br>`https://*.canvaslms.com/*` | Required to communicate with standard Canvas LMS institutional domains to fetch course module details and download course images for offline embedding. |

---

## 4. Privacy Practices & Privacy Policy URL

### Privacy Policy Field (Developer Dashboard)
In the Chrome Web Store Developer Dashboard under the **Privacy** tab:
- **Privacy Policy URL:**
  ```
  https://github.com/SixFiveMil/obsidian-canvas-sync/blob/main/PRIVACY.md
  ```
  *(Alternative standalone HTML version: `https://sixfivemil.github.io/obsidian-canvas-sync/privacy.html` or `https://raw.githubusercontent.com/SixFiveMil/obsidian-canvas-sync/main/docs/privacy.html`)*

### Single Purpose
- **Question:** Does your extension have a single purpose?
- **Answer:** **Yes**.
- **Explanation:**
  ```
  The extension only extracts course content from the user's active Canvas LMS browser session and forwards it directly to their local Obsidian vault via loopback (127.0.0.1).
  ```

### Data Usage Disclosures
- **User Data Collection:** Check **NO** for all categories:
  - Personal identification info: **No**
  - Health info: **No**
  - Financial/payment info: **No**
  - Authentication info: **No**
  - Personal communications: **No**
  - Location: **No**
  - Web history: **No**
  - User activity: **No**
  - Website content: **No** (Course content is handled exclusively in-memory on the client and dispatched strictly to `127.0.0.1`).

### Certification Checkboxes
- [x] **I certify that this extension complies with the Limited Use policy.**
- [x] **I certify that the data is not used or transferred for purposes unrelated to the item's core purpose.**
- [x] **I certify that the data is not sold, transferred, or used for personalized advertising or creditworthiness.**


---

## 5. Reviewer Instructions for Google Web Store QA Team

Provide the following exact steps in the **Reviewer Instructions (Test Accounts & Instructions)** field of the Developer Dashboard:

```
Reviewer Testing Instructions:

This extension bridges Canvas LMS course data into a local note-taking app (Obsidian) via a localhost HTTP listener on 127.0.0.1:27125.

To test the extension without requiring an Obsidian installation, you can run a lightweight mock bridge server on localhost:

1. START LOCAL MOCK BRIDGE (One-line command):
   Run this in any terminal to accept the extension's sync payload:
   
   Node.js:
   node -e "const http=require('http'); http.createServer((req,res)=>{ res.setHeader('Access-Control-Allow-Origin', req.headers.origin||'*'); res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Canvas-Sync-Client'); if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;} if(req.url==='/canvas-sync'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));console.log('Sync payload received successfully!');}else{res.writeHead(404);res.end();} }).listen(27125,'127.0.0.1',()=>console.log('Mock bridge listening on 127.0.0.1:27125'));"

2. VERIFY BRIDGE CONNECTION:
   - Click the extension icon in Chrome to open the popup.
   - Click "Test Bridge".
   - You should see "Bridge reachable on localhost." in green.

3. TEST COURSE EXTRACTION & PRE-SYNC EDITING:
   - Navigate to any Canvas course page (e.g. https://canvas.instructure.com/courses/1 or any Canvas sandbox/free for teacher course).
   - Open the extension popup.
   - Notice the "Course Code" and "Course Name" fields automatically populate from the page breadcrumbs and title.
   - Edit the Course Code or Course Name in the text inputs if desired.
   - Click "Sync Active Course".
   - The status updates to "Sync complete. Check Obsidian for updated files."
   - The local terminal will print "Sync payload received successfully!", confirming the local payload delivery.

Zero remote telemetry or external servers are contacted. All traffic is strictly between the active tab and 127.0.0.1.
```

---

## 6. Packaged Release ZIP

The release package is generated at:
```
release/canvas-to-obsidian-sync-0.2.0.zip
```
- Built with Manifest V3.
- `manifest.json` is located at the root of the ZIP.
- Validated via `node apps/browser-extension/scripts/validate-dist.mjs`.
