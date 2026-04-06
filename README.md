# UserMap — Phase 1 MVP

> **Your personal context hub** — connect your tools once and let AI know your world.

UserMap runs **entirely on your machine**. No cloud account required. Install it, connect your tools (starting with Slack), and UserMap exposes a local API that AI assistants and browser extensions can query for context about your work.

---

## What's in Phase 1

| Piece | What it does |
|---|---|
| **`apps/server`** | TypeScript + Express local API server with SQLite storage |
| **`apps/desktop`** | Simple React dashboard — connect tools, view connections, query context |
| **Slack OAuth** | One-click Connect → popup login → done, no API keys to copy |
| **Context API** | `POST /api/context` — keyword/FTS search over your local data store |
| **Adapter pattern** | Extensible base class ready for GitHub, Gmail, Drive, … in Phase 1.1 |

---

## Quick Start

### 1. Clone & install dependencies

```bash
git clone https://github.com/mhkr9100/UserMap.git
cd UserMap
npm install          # installs workspace deps for server + desktop
```

### 2. Configure environment

```bash
cp .env.example apps/server/.env
# Edit apps/server/.env with your Slack app credentials (see below)
```

### 3. Run local dev (server + desktop)

```bash
npm run dev
```

- **API server** → `http://localhost:5185`
- **Desktop UI** → `http://localhost:5173`

Open `http://localhost:5173` in your browser.

---

## Slack App Setup

You need a Slack app to enable the Connect Slack button.

1. Go to **https://api.slack.com/apps** → Create New App → From scratch.
2. Name it **UserMap** and select your workspace.
3. In **OAuth & Permissions**, add this Redirect URL:
   ```
   http://localhost:5185/api/connect/slack/callback
   ```
4. Add these **Bot Token Scopes**:
   - `channels:history`
   - `channels:read`
   - `users:read`
   - `team:read`
5. Copy **Client ID** and **Client Secret** from Basic Information.
6. Paste them into `apps/server/.env`:
   ```env
   SLACK_CLIENT_ID=your-client-id
   SLACK_CLIENT_SECRET=your-client-secret
   SLACK_REDIRECT_URI=http://localhost:5185/api/connect/slack/callback
   ```

---

## API Reference

All endpoints served from `http://localhost:5185`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Server health + connection count |
| `GET` | `/api/connections` | List of connected tools |
| `POST` | `/api/connect/slack` | Returns Slack OAuth URL |
| `GET` | `/api/connect/slack/callback` | OAuth callback — persists connection |
| `POST` | `/api/context` | Retrieve relevant context snippets |

### POST /api/context

```json
{
  "query": "project deadline",
  "sources": ["slack"],
  "limit": 5
}
```

Response:
```json
{
  "query": "project deadline",
  "results": [
    {
      "source": "slack",
      "doc_id": "C123/1700000000.000",
      "content": "We pushed the deadline to Friday...",
      "metadata": { "channel": "C123" },
      "created_at": "2024-11-14T10:00:00.000Z"
    }
  ]
}
```

---

## Data Storage

UserMap stores everything in `~/.usermap/usermap.db` (SQLite).  
No data ever leaves your machine.

To change the storage path set `USERMAP_DATA_DIR` in `apps/server/.env`.

---

## Current Limitations

- **No background sync yet** — documents must be ingested via the API directly (Phase 1.1 adds the Slack sync worker).
- **Keyword search only** — FTS5 full-text search is fast but not semantic. Chroma vector search is planned for Phase 1.1.
- **Slack only** — GitHub, Gmail, Google Drive adapters come in Phase 1.1.
- **No installer yet** — run from source for now; a packaged desktop app (Tauri) is on the roadmap.

---

## Roadmap

### Phase 1.1
- Background Slack sync worker (polls every N minutes)
- Chroma semantic search (replaces FTS5, same API contract)
- GitHub adapter

### Phase 2
- Gmail + Google Drive adapters
- ChatGPT / Claude plugin that calls `/api/context` automatically
- Browser extension for context injection

### Phase 3
- Packaged desktop installer (Tauri) — one-click download from website
- Flow chart / timeline views of aggregated data
- Multi-account support per tool

