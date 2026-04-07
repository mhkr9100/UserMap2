# UserMap — Phase 1 + Phase 2 + Phase 3 + Phase 4

> **Your personal context hub** — connect your tools once and let AI know your world.

Standalone workspace for capturing, organizing, and exporting reusable context — with one-click tool integrations and AI assistant chat that keeps all data strictly local.

---

## What's Included

| Phase | Status | Features |
|---|---|---|
| **Phase 1** | ✅ Complete | Auth, UserMap tree, memory, context import/export, server-side consolidation, Slack OAuth |
| **Phase 2** | ✅ Complete | GitHub and Gmail OAuth connections; unified local context query across all tools |
| **Phase 3** | ✅ Complete | Flowchart, timeline, and full-text search views; advanced filter/highlight UI |
| **Phase 4** | ✅ Complete | ChatGPT, Claude, Gemini cloud AI chat; Ollama local LLM bridge (one-click, offline); AI Chat panel with auto context injection |
| **Phase 5** | 🔜 Planned | Background sync agent, plugin marketplace, semantic vector search |

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

## Phase 4: AI Integrations

### Cloud AI Assistants (ChatGPT, Claude, Gemini)

Connect any supported cloud AI to UserMap in seconds — no copy/paste ever needed. When you ask a question in the **AI Chat** panel, your entire UserMap context is automatically injected so the AI always knows your world.

#### Setup

1. Click the **AI** button in the top-right header to open the AI Chat panel.
2. If no AI is connected yet, click **Tools** → **AI Assistants** section → **Add API Key**.
3. Paste your API key and click **Save**. The key is validated and stored **only in your browser's localStorage** — never sent to UserMap servers.
4. Return to the AI Chat panel, pick your AI, and start chatting.

| AI | API Key Source |
|----|---------------|
| **ChatGPT** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Claude** | [console.anthropic.com](https://console.anthropic.com/) |
| **Gemini** | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |

#### Privacy & Security

- API keys are stored in `localStorage` only — they never reach UserMap servers.
- Messages are sent directly from your browser to the AI provider's API.
- No conversation history is persisted anywhere — it resets when you close the panel.

---

### Local LLM — Ollama (Fully Offline)

Run AI context queries entirely offline using any locally installed [Ollama](https://ollama.com) model.

#### One-Click Setup

1. Install Ollama: [ollama.com](https://ollama.com) (macOS / Windows / Linux).
2. Pull a model: `ollama pull llama3.2` (or any preferred model).
3. Start Ollama (it runs automatically on macOS; on Linux: `ollama serve`).
4. In UserMap → **Tools** → **AI Assistants** → **Ollama (Local)** → click **Connect Local**.
5. UserMap auto-detects Ollama at `localhost:11434`, picks the best available model, and connects instantly.

#### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_OLLAMA_URL` | `http://localhost:11434` | Override if Ollama runs on a different host/port |

> **CORS**: Ollama allows CORS from any origin by default. If you've locked it down,
> set `OLLAMA_ORIGINS=http://localhost:3000` in your Ollama environment.

---

### Adding a New AI Integration

AI adapters extend `BaseAdapter` the same way data-source adapters do, but set `isAIAssistant = true` and implement `sendMessage()` instead of (or in addition to) `fetchContext()`.

```ts
// services/integrations/myai.ts
import { BaseAdapter } from './base';
export class MyAIAdapter extends BaseAdapter {
    readonly id = 'myai' as IntegrationId;
    readonly supportsApiKey = true;
    readonly isAIAssistant = true;

    override async connectWithApiKey(key: string) { /* validate + save */ }
    async fetchContext() { return []; }          // AI adapters return no data
    override async sendMessage(messages, ctx) { /* call API, return { text } */ }
    buildOAuthUrl() { throw new Error('N/A'); }
    async exchangeCode() { throw new Error('N/A'); }
}
```

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

### Phase 4 (AI Integrations)

AI API keys are entered through the UI and stored in `localStorage` — no environment variables needed for ChatGPT, Claude, or Gemini.

| Variable | Description |
|---|---|
| `VITE_OLLAMA_URL` | Ollama base URL (default: `http://localhost:11434`) |
| `VITE_CLAUDE_PROXY_URL` | Optional CORS proxy for Claude in browser-only dev mode |

Copy `.env.example` to `.env` and fill in your values before running locally.

---

## Connecting Tools

1. Click the **Tools** button in the top-right header.
2. **Data Sources** (Slack, GitHub, Gmail): Click **Connect** → OAuth popup.
3. **AI Assistants** (ChatGPT, Claude, Gemini): Click **Add API Key** → paste key → **Save**.
4. **Ollama (Local)**: Click **Connect Local** — auto-detects your running Ollama instance.
5. GitHub users can also use a **Personal Access Token** instead of OAuth.

All tokens and API keys are stored in your browser's `localStorage` only — nothing leaves your device.

---

## AI Chat Panel

Open the **AI** button in the top header to access the chat panel:

- Select which AI assistant to use from the dropdown.
- Type a question — your **entire UserMap context** (from all connected data sources) is automatically injected into the AI's system prompt.
- No copy/paste, no manual context export needed.
- Switch between ChatGPT, Claude, Gemini, and Ollama without losing context.
- Click **Clear** to reset the conversation.

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
  sources: ['slack', 'github', 'gmail'], // optional — defaults to all connected data sources
  limit: 10
});

// result.results is ToolContextItem[], sorted newest-first, tagged by source
```

---

## Adding a New Integration

1. Create `services/integrations/<tool>.ts` — extend `BaseAdapter`, implement `buildOAuthUrl`, `exchangeCode`, and `fetchContext`.
2. Add the singleton to `ADAPTERS` in `services/integrations/index.ts`.
3. Add display metadata to `INTEGRATION_META` in the same file (include `category: 'data-source' | 'ai-assistant'`).
4. Add `VITE_<TOOL>_CLIENT_ID` / `VITE_<TOOL>_CLIENT_SECRET` to `.env.example`.
5. Done — the UI picks it up automatically. No other files need to change.

---

## Data Storage

UserMap stores everything in `~/.usermap/usermap.db` (SQLite).  
No data ever leaves your machine.

To change the storage path set `USERMAP_DATA_DIR` in `apps/server/.env`.

