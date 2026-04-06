# UserMap — Phase 1 + Phase 2

> **Your personal context hub** — connect your tools once and let AI know your world.

Standalone workspace for capturing, organizing, and exporting reusable context — with one-click tool integrations that keep all data strictly local.

---

## What's Included

| Phase | Status | Features |
|---|---|---|
| **Phase 1** | ✅ Complete | Auth, UserMap tree, memory, context import/export, server-side consolidation, Slack OAuth |
| **Phase 2** | ✅ Complete | GitHub and Gmail OAuth connections; unified local context query across all tools |
| **Phase 3** | 🔜 Planned | Google Drive, Notion, Linear adapters |
| **Phase 4** | 🔜 Planned | Background sync agent, automatic context injection into AI tools |
| **Phase 5** | 🔜 Planned | Local Ollama embeddings, semantic vector search across all sources |

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
cp .env.example .env
# Edit .env with your credentials (see sections below)
cp apps/server/.env.example apps/server/.env
# Edit apps/server/.env with your Slack app credentials
```

### 3. Run local dev (server + desktop)

```bash
npm run dev
```

- **API server** → `http://localhost:5185`
- **Desktop UI** → `http://localhost:3000`

---

## Required Environment Variables

### Phase 1 (Core)

| Variable | Description |
|---|---|
| `VITE_AUTH_POOL_ID` | AWS Cognito User Pool ID |
| `VITE_AUTH_CLIENT_ID` | AWS Cognito App Client ID |
| `VITE_API_BASE_URL` | Base URL of the UserMap backend API |
| `PORT` | Local API server port (default: 5185) |
| `APP_URL` | Local server base URL |

### Phase 2 (Tool Integrations)

| Variable | Tool | Where to get it |
|---|---|---|
| `VITE_SLACK_CLIENT_ID` | Slack | [api.slack.com/apps](https://api.slack.com/apps) |
| `VITE_SLACK_CLIENT_SECRET` | Slack | [api.slack.com/apps](https://api.slack.com/apps) |
| `VITE_GITHUB_CLIENT_ID` | GitHub | [github.com/settings/developers](https://github.com/settings/developers) |
| `VITE_GITHUB_CLIENT_SECRET` | GitHub | [github.com/settings/developers](https://github.com/settings/developers) |
| `VITE_GOOGLE_CLIENT_ID` | Gmail | [console.cloud.google.com](https://console.cloud.google.com/apis/credentials) |
| `VITE_GOOGLE_CLIENT_SECRET` | Gmail | [console.cloud.google.com](https://console.cloud.google.com/apis/credentials) |

Copy `.env.example` to `.env` and fill in your values before running locally.

---

## Connecting Tools (Phase 2)

1. Click the **Tools** button in the top-right header.
2. Click **Connect** next to Slack, GitHub, or Gmail.
3. An OAuth popup opens — log in and authorize UserMap.
4. The popup closes and the tool shows **Connected** ✅.
5. GitHub users can also paste a **Personal Access Token** instead of OAuth.

All tokens are stored in your browser's `localStorage` only — nothing leaves your device.

---

## Slack App Setup (Phase 1 Server)

You need a Slack app to enable the Connect Slack button on the server side.

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

## Server API Reference

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

## Unified Context Query (Phase 2 Frontend)

Once tools are connected, context can be queried programmatically from the same local origin:

```ts
import { queryContext } from './services/contextQuery';

const result = await queryContext({
  query: 'project deadline next week',
  sources: ['slack', 'github', 'gmail'], // optional — defaults to all connected
  limit: 10
});

// result.results is ToolContextItem[], sorted newest-first, tagged by source
```

---

## Adding a New Integration

1. Create `services/integrations/<tool>.ts` — extend `BaseAdapter`, implement `buildOAuthUrl`, `exchangeCode`, and `fetchContext`.
2. Add the singleton to `ADAPTERS` in `services/integrations/index.ts`.
3. Add display metadata to `INTEGRATION_META` in the same file.
4. Add `VITE_<TOOL>_CLIENT_ID` / `VITE_<TOOL>_CLIENT_SECRET` to `.env.example`.
5. Done — the UI picks it up automatically. No other files need to change.

---

## Data Storage

UserMap stores everything in `~/.usermap/usermap.db` (SQLite).  
No data ever leaves your machine.

To change the storage path set `USERMAP_DATA_DIR` in `apps/server/.env`.
