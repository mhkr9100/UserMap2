# UserMap — Offline / Airgapped Setup Guide

> **For AI assistants and agent environments** that cannot use terminal network
> access (`git clone`, `npm install`), but can fetch files via browser/HTTP tools.

---

## Quick Reference

| Artifact | Path | Purpose |
|---|---|---|
| Reconstruction manifest | `ai-setup.json` | JSON list of every source file + raw GitHub URLs |
| Source bundle | `bundle.txt` | All source files concatenated with `--- FILE: path ---` delimiters |
| Static demo | `static-demo/index.html` | Zero-dependency UI preview (serve with Python) |
| Generation scripts | `scripts/make-manifest.mjs` | Regenerate `ai-setup.json` |
| | `scripts/make-bundle.mjs` | Regenerate `bundle.txt` |

---

## Option A — Reconstruct repo from `ai-setup.json`

### 1. Fetch the manifest

```
https://raw.githubusercontent.com/mhkr9100/UserMap/main/ai-setup.json
```

The manifest contains:

```json
{
  "owner": "mhkr9100",
  "repo": "UserMap",
  "ref": "<commit-sha>",
  "files": [
    { "path": "package.json", "url": "https://raw.githubusercontent.com/..." },
    { "path": "apps/web/src/main.tsx", "url": "https://raw.githubusercontent.com/..." }
  ]
}
```

### 2. Fetch each file

For every entry in `files[]`, fetch `url` and write it to `path` relative to
your working directory.

**Python example:**

```python
import json, urllib.request, os

manifest = json.load(open("ai-setup.json"))
for f in manifest["files"]:
    os.makedirs(os.path.dirname(f["path"]) or ".", exist_ok=True)
    urllib.request.urlretrieve(f["url"], f["path"])
    print("✓", f["path"])
```

**Node.js example (no deps):**

```js
const { readFileSync } = require('fs');
const { mkdir, writeFile } = require('fs/promises');
const { get } = require('https');
const path = require('path');

const manifest = JSON.parse(readFileSync('ai-setup.json', 'utf8'));

async function fetchFile(url) {
  return new Promise((resolve, reject) => {
    let data = '';
    get(url, res => { res.on('data', c => data += c); res.on('end', () => resolve(data)); }).on('error', reject);
  });
}

(async () => {
  for (const f of manifest.files) {
    const dir = path.dirname(f.path);
    if (dir !== '.') await mkdir(dir, { recursive: true });
    const content = await fetchFile(f.url);
    await writeFile(f.path, content);
    console.log('✓', f.path);
  }
})();
```

---

## Option B — Use `bundle.txt` directly

### 1. Fetch the bundle

```
https://raw.githubusercontent.com/mhkr9100/UserMap/main/bundle.txt
```

The bundle is a single text file (~500 KB) with this format:

```
================================================================================
UserMap — Source Bundle
Generated: 2026-04-14T...
Files: 84
================================================================================

--- FILE: README.md ---
# UserMap — Personal Context OS
...

--- FILE: package.json ---
{
  "name": "usermap-root",
  ...
}

--- FILE: components/Sidebar.tsx ---
...
```

### 2. Explode bundle → files (Python)

```python
import os

bundle = open("bundle.txt").read()
sections = bundle.split("\n--- FILE: ")

for section in sections[1:]:           # skip header
    newline = section.index("\n")
    path = section[:newline].strip().rstrip(" ---")
    content = section[newline + 1:]
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    open(path, "w").write(content)
    print("✓", path)
```

---

## Option C — Preview UI without Node.js

The `static-demo/index.html` is a fully self-contained UI that runs without
any build step or npm packages.

### Serve locally

```bash
# From repo root
python3 -m http.server 8080 --directory static-demo/
# Then open: http://localhost:8080/
```

Or from any directory:

```bash
cd static-demo
python3 -m http.server 8080
# Open: http://localhost:8080/
```

### What the demo shows

- **Dashboard** — activity summary (live if backend running, empty otherwise)
- **Prism Chat** — AI chat interface (requires backend for real responses)
- **Data Studio** — MindMap, Context Search, User Files, Import tabs
- **Connectors** — Pull / Push / AI Engines / Custom APIs panels
- **Logs** — Real-time pipeline event log

### Connect to a running backend

If you have the backend running at `http://localhost:5185`, the demo
will automatically detect it and load real data. Start it with:

```bash
npm run dev:server
```

### Limitations in pure-static mode

- No AI chat responses (requires Prism backend)
- No import/export functionality
- No real connector status
- No log events

---

## Regenerating artifacts

If you need to regenerate `ai-setup.json` or `bundle.txt` after making changes:

```bash
# Regenerate manifest (pins to current HEAD SHA by default)
node scripts/make-manifest.mjs

# Regenerate manifest pinned to main branch ref
node scripts/make-manifest.mjs --ref main

# Regenerate bundle
node scripts/make-bundle.mjs

# Both at once (also available as npm scripts)
npm run gen:manifest
npm run gen:bundle
```

---

## Excluded files

The following are excluded from both `ai-setup.json` and `bundle.txt` by
design to keep the manifest focused and size reasonable:

| Category | Examples |
|---|---|
| Binary media | `.png`, `.jpg`, `.gif`, `.webp`, `.mp4`, `.mp3` |
| Font files | `.woff`, `.woff2`, `.ttf`, `.otf`, `.eot` |
| Lock files | `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` |
| Build artifacts | `dist/`, `dist-electron/` |
| Runtime data | `node_modules/`, `uploads/`, `.db`, `.sqlite` |
| Generated artifacts | `bundle.txt`, `ai-setup.json` (auto-generated, not source) |

SVG icons are excluded from the bundle (they are binary-adjacent and bulky)
but the components that reference them are included.

---

## Architecture Overview (for AI agents)

```
UserMap/
├── App.tsx                    # Root React app — page router
├── components/                # All UI page components
│   ├── Sidebar.tsx            # Left navigation
│   ├── PrismAgentPage.tsx     # AI chat interface
│   ├── DataStudioPage.tsx     # MindMap + import
│   ├── ConnectorsPage.tsx     # Pull/Push/AI connectors
│   ├── LogsPage.tsx           # Event log viewer
│   └── ...
├── services/                  # Business logic + integrations
│   ├── prismAgent.ts          # AI agent orchestration
│   ├── integrations/          # Adapter-pattern connectors
│   └── workspaceApi.ts        # Backend API client
├── hooks/                     # React hooks (auth, user map, integrations)
├── apps/server/               # Express backend (port 5185)
│   └── src/
│       ├── db/index.ts        # SQLite schema + seed
│       ├── routes/            # REST API routes
│       └── index.ts           # Server entry point
├── apps/desktop/              # Legacy desktop app (port 5173)
├── static-demo/               # Zero-dependency static preview
├── scripts/                   # Generation scripts
├── ai-setup.json              # File manifest (auto-generated)
└── bundle.txt                 # Source bundle (auto-generated)
```

### Key API endpoints (backend on port 5185)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | Health check |
| `POST` | `/api/prism/chat` | Send message to Prism AI |
| `GET` | `/api/prism/sessions` | List chat sessions |
| `POST` | `/api/import` | Upload file for ingestion |
| `POST` | `/api/import/text` | Import text directly |
| `GET` | `/api/import/jobs` | List import jobs |
| `GET` | `/api/connectors` | List connectors |
| `GET` | `/api/logs` | Get log events |
| `GET` | `/api/custom-apis` | List custom APIs |
| `GET` | `/api/dashboard/summary` | Dashboard stats |
