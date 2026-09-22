## 📝 Summary of Changes

*Briefly describe what was added, changed, or fixed in this PR.*

---

## 🚦 Runbook Checklist

Before merging, ensure you have completed all relevant steps from [RUNBOOK.md](RUNBOOK.md):

### 1. Feature Development
- [ ] Branched from up-to-date `develop`
- [ ] Unit tests added/updated where applicable
- [ ] Passed quality gate locally: `npm run check:all`

### 2. Integration & Smoke Testing
- [ ] Tested in a local Obsidian test vault (`main.js`, `manifest.json`, `styles.css`)
- [ ] Verified sync workflow and error handling
- [ ] Confirmed zero errors in Obsidian Developer Console (`Ctrl+Shift+I`)

### 3. Documentation & Visual Assets
- [ ] Updated `README.md` / `docs/` if UI or settings changed
- [ ] Updated screenshots in `docs/assets/` (if UI was modified)
- [ ] Sanitized all images (no real tokens, passwords, or personal student info)

### 4. Release Readiness (if merging to `main`)
- [ ] Version bumped with `npm version <patch|minor|major>`
- [ ] Passed release gate: `npm run release:check`
