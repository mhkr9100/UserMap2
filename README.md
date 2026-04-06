# UserMap

Standalone workspace for capturing, organizing, and exporting reusable context — with one-click tool integrations that keep all data strictly local.

## What It Includes

- Account sign-in and recovery flows
- UserMap tree editing (Phase 1)
- Storyboard and filtered context views (Phase 1)
- Prompt and JSON export controls (Phase 1)
- Context import and server-backed consolidation (Phase 1)
- **GitHub and Gmail tool connections via OAuth** (Phase 2)
- **Unified local context query across all connected tools** (Phase 2)

## Required Environment Variables

### Phase 1 (Core)

| Variable | Description |
|---|---|
| `VITE_AUTH_POOL_ID` | AWS Cognito User Pool ID |
| `VITE_AUTH_CLIENT_ID` | AWS Cognito App Client ID |
| `VITE_API_BASE_URL` | Base URL of the UserMap backend API |

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

## Development

```bash
npm install
npm run dev
```

## Connecting Tools (Phase 2)

1. Click the **Tools** button in the top-right header.
2. Click **Connect** next to Slack, GitHub, or Gmail.
3. An OAuth popup opens — log in and authorize UserMap.
4. The popup closes and the tool shows **Connected** ✅.
5. GitHub users can also paste a **Personal Access Token** instead of OAuth.

All tokens are stored in your browser's `localStorage` only — nothing leaves your device.

## Unified Context Query API

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

This is the same API shape used by ChatGPT plugins or browser extensions that call `POST /api/context` on the local server.

## Adding a New Integration

1. Create `services/integrations/<tool>.ts` — extend `BaseAdapter`, implement `buildOAuthUrl`, `exchangeCode`, and `fetchContext`.
2. Add the singleton to `ADAPTERS` in `services/integrations/index.ts`.
3. Add display metadata to `INTEGRATION_META` in the same file.
4. Add `VITE_<TOOL>_CLIENT_ID` / `VITE_<TOOL>_CLIENT_SECRET` to `.env.example`.
5. Done — the UI picks it up automatically. No other files need to change.

## Roadmap

| Phase | Status | Features |
|---|---|---|
| **Phase 1** | ✅ Complete | Auth, UserMap tree, memory, context import/export, consolidation |
| **Phase 2** | ✅ Complete | Slack, GitHub, Gmail OAuth connections; unified local context query |
| **Phase 3** | 🔜 Planned | Google Drive, Notion, Linear adapters |
| **Phase 4** | 🔜 Planned | Background sync agent, automatic context injection into AI tools |
| **Phase 5** | 🔜 Planned | Local Ollama embeddings, semantic vector search across all sources |

