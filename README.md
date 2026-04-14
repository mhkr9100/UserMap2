# UserMap — Personal Context OS

> **AI knows the world. UserMap helps AI know *you*.**
>
> General AI can answer "Who is the US president?" because it has access to public data. But it can't answer "What's my career goal?" or "What did I post on Instagram last week?" because it doesn't have *your* data. UserMap is a **Personal Knowledge Permission Layer** for AI — it stores, structures, and controls access to your personal context, locally and privately, so any AI tool can truly know you.

UserMap is a **local-first Personal Context OS** that:
- Continuously ingests data from your tools (Slack, Instagram, Facebook, etc.)
- Uses **Prism Agent** to classify and structure everything into your personal knowledge graph
- Lets you explore and edit your data visually as a **MindMap** in Data Studio
- Pushes structured context to automation platforms (n8n, Make, custom webhooks)
- Logs every lifecycle event end-to-end in the **Logs** timeline

**No cloud account required. All data stays on your machine.**

---

## 🚀 Phase 5 Final Features

### 1. Left Sidebar Navigation
Full app redesign with persistent left sidebar:
- **Dashboard** — overview stats, pipeline explanation, recent activity
- **Context Search** — full-text keyword + filter search across all your data
- **Data Studio** — MindMap visualization with full CRUD (Tree/Flow/List planned for future)
- **Connectors** — Pull into UserMap + Push from UserMap (subdivided)
- **Prism Agent** — Always-on AI pipeline status, chat, resilience controls
- **Logs** — End-to-end lifecycle event timeline with filters
- **Docs** — In-app help, setup guides, architecture reference

### 2. Data Studio — MindMap Only (NotebookLM-style)
Your entire knowledge graph visualized as a radial, interactive MindMap:
- **Scroll** to zoom, **drag** to pan
- **Hover** any node to reveal Edit, Add child, and Delete actions
- **Click** category nodes to expand/collapse branches
- **Full CRUD**: create categories, edit node labels/values, delete nodes/edges
- Collapse state **persisted in localStorage** for stable UX across sessions
- Tree, Flow, and List views are future scope (clearly labeled in UI)

### 3. Logs — End-to-End Lifecycle Timeline
Every event in your personal context OS is tracked:

| Event Type | Description |
|---|---|
| `connector.pull.success` | Data successfully pulled from a source |
| `connector.pull.error` | Pull failed — check error details |
| `prism.classify` | Prism classified an item into a category |
| `prism.structure` | Prism updated the knowledge graph |
| `prism.feedback.learned` | User edit informed future classification |
| `user.create/update/delete` | Manual CRUD actions on nodes |
| `push.webhook.sent/failed` | Push connector delivery results |

**Filters:** event type, actor (system/prism/user), severity, date range, free-text search.

### 4. Connectors — Pull & Push
**Pull into UserMap:**
- Slack, Instagram, Facebook — continuous polling (default: every 60s) with checkpoint recovery
- If interrupted, resumes from last checkpoint — no data loss or double-processing

**Push from UserMap:**
- n8n, Make (Integromat), Custom Webhook
- Receives structured JSON payloads on every relevant event

### 5. Multi-DB Architecture
Polyglot storage pattern for speed + intelligence:
- **SQLite** (canonical): source of truth — entities, relationships, logs, checkpoints, connector configs
- **Chroma** (vector DB): semantic embeddings for Prism's context understanding, updated asynchronously
- **Rule**: write to canonical DB first; vector/cache layers are derived and never source-of-truth

### 6. Prism Agent — Always-On Pipeline
```
Data Pull → Prism Reads → Classify → Structure → DB Update → Checkpoint → repeat
```
- Resilient: crashes/restarts resume from last checkpoint
- Deduplication: each source event tracked by unique ID hash
- Learns from user CRUD: edits in Data Studio feed back into future classifications

### 7. Prism Memory Extractor v2 (MemPalace-inspired)

Replaces the previous stub extraction path with a full structured memory pipeline.

**Architecture mapping (MemPalace → UserMap):**

| MemPalace concept | UserMap equivalent |
|---|---|
| Wings | Prism Nodes (top-level knowledge areas) |
| Halls | Memory Categories (decision, preference, milestone, problem, emotional) |
| Rooms | Topics within a node |
| Drawers | Memory Units (rows in `prism_memory_units`) |
| L3 Deep Search | FTS over `memory_units_fts` |

**Memory categories (5 types, pattern-based — no LLM required):**

| Category | Trigger patterns |
|---|---|
| `decision` | "we decided", "because", "instead of", "architecture", "stack" |
| `preference` | "I prefer", "always use", "never use", "my rule is" |
| `milestone` | "finally", "it works", "shipped", "built", "breakthrough" |
| `problem` | "bug", "error", "doesn't work", "root cause", "workaround" |
| `emotional` | "love", "proud", "grateful", "I feel", "I wish" |

**Pipeline (canonical, no bypass):**
```
Input → parse → extractMemories() → dedup check → conflict check → prism_memory_units → FTS index → log
```

**Deduplication:**
- Exact: SHA-256 hash of normalised content — skips if already stored
- Near-duplicate: Jaccard similarity over 3+ character words — skips if ≥ 85% similar

**Conflict detection:**
- Two memories of the same category with high overlap but opposing negation are flagged
- Both sides are marked with `conflict_flag=1` and `conflict_with` arrays
- Neither is silently discarded — the user resolves conflicts

**API endpoints:**
- `GET /api/prism/memories` — list all memory units (filter by category, source_tool, conflict)
- `GET /api/prism/memories?q=<query>` — FTS deep search (MemPalace L3-style)
- `POST /api/prism/extract` — extract memories from text and persist
- `GET /api/prism/memories/:id` — get single memory unit with provenance
- `PATCH /api/prism/memories/:id` — update node_label, topic, resolve conflict
- `DELETE /api/prism/memories/:id` — delete a memory unit

**Context retrieval upgrade (`POST /api/prism/context`):**
1. Searches `prism_memory_units` via FTS (structured, categorised memories) — higher signal
2. Falls back to raw `documents_fts` (verbatim store) — broad coverage
3. Returns merged results with category and confidence metadata

---

## 🛠 Quick Start

```bash
git clone https://github.com/mhkr9100/UserMap.git
cd UserMap
npm install

# Run frontend (http://localhost:3000)
npm run dev

# Run backend API server (http://localhost:5185)
npm run dev:server
```

---

## 🔌 Connecting Pull Connectors

### Slack
1. Create a Slack App at **api.slack.com/apps**
2. Add OAuth scopes: `channels:read`, `channels:history`, `users:read`
3. Install to workspace and copy the Bot Token (`xoxb-...`)
4. In UserMap → **Connectors** → Pull → Slack → **Connect**, paste your token

### Instagram / Facebook
1. Create a Meta App at **developers.facebook.com**
2. Add Instagram Basic Display API or Facebook Graph API
3. Generate a User Access Token with required permissions
4. In UserMap → **Connectors** → Pull → Instagram/Facebook → **Connect**, paste token

> ⚠️ Meta API requires app review for production access. In development mode, test with your own accounts.

---

## ⚡ Push Webhooks (n8n / Make / Custom)

### n8n
1. Add a **Webhook** trigger node in n8n, copy the URL
2. In UserMap → Connectors → Push → n8n → **Connect**, paste webhook URL

### Make (Integromat)
1. Create a scenario with a **Custom Webhook** module, copy its URL
2. In UserMap → Connectors → Push → Make → **Connect**, paste URL

### Sample payload
```json
POST https://your-endpoint.com/webhook
{
  "event": "user.update",
  "actor": "user",
  "object": "node:abc123",
  "summary": "Career node updated",
  "before": "Software Engineer",
  "after": "Senior Software Engineer",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## 🗄️ Architecture

```
Browser (React + Vite)
  └── Left Sidebar (Dashboard / Context Search / Data Studio / Connectors / Prism / Logs / Docs)
       ├── Data Studio → MindMapView (CRUD on PageNode tree, localStorage collapse)
       ├── Connectors → Pull (Slack/Instagram/Facebook) | Push (n8n/Make/Webhook)
       ├── Prism Agent → Always-on pipeline + chat interface
       └── Logs → Event timeline (connector.pull / prism.classify / user.crud / push.webhook)

Backend (Express + SQLite)  http://localhost:5185
  ├── /api/connectors        — connector config CRUD, sync trigger
  ├── /api/logs              — lifecycle event log
  ├── /api/context           — full-text search over documents
  ├── /api/prism/context     — Prism context retrieval (memory units + documents)
  ├── /api/prism/memories    — Prism Memory Units CRUD + FTS search
  ├── /api/prism/extract     — Extract memories from text → prism_memory_units
  ├── /api/import            — File/text ingestion pipeline → extraction → indexed
  └── /api/connections       — OAuth tool connections

Storage
  ├── SQLite ~/.usermap/usermap.db
  │     ├── documents          — verbatim imported content
  │     ├── documents_fts      — full-text search index
  │     ├── prism_memory_units — structured extracted memories (MemPalace-inspired)
  │     ├── memory_units_fts   — FTS index for memory units (L3 deep search)
  │     ├── logs               — lifecycle event log
  │     ├── import_jobs        — ingestion job state machine
  │     ├── connector_config   — pull/push/ai engine configs
  │     ├── prism_sessions     — chat session persistence
  │     └── prism_messages     — chat message history
  └── (future: vector DB for dense semantic embeddings — optional, never source-of-truth)
```

---

## 📋 Feature Roadmap

| Feature | Status | Notes |
|---|---|---|
| MindMap Data Studio (CRUD) | ✅ Phase 5 | NotebookLM-style, collapse/expand, full CRUD |
| Connectors: Pull (Slack/Instagram/FB) | ✅ Phase 5 | Continuous + checkpoint |
| Connectors: Push (n8n/Make/Webhook) | ✅ Phase 5 | Structured JSON payloads |
| Logs: Lifecycle timeline | ✅ Phase 5 | Filters, search, before/after detail |
| Prism Agent pipeline | ✅ Phase 5 | Always-on, checkpoint-resilient |
| Multi-DB (SQLite + Chroma) | ✅ Phase 5 | Canonical + async vector |
| Tree View | 🔜 Future scope | Hierarchical tree visualization |
| Flow Chart View | 🔜 Future scope | Directed graph visualization |
| List View | 🔜 Future scope | Tabular data view |
| Enterprise RBAC | 🔜 Planned | Role-based visibility |
| Cross-Device Sync | 🔜 Planned | P2P local sync |

---

## 🔒 Privacy & Local-First Design

- **No cloud account**: UserMap requires no sign-up, login, or external auth
- **All data is local**: SQLite DB lives at `~/.usermap/usermap.db` on your machine
- **OAuth for tools only**: Slack, GitHub, Gmail use their own OAuth — tokens stay in browser localStorage
- **Private nodes**: Flag any node as private to exclude it from context exports
- **No telemetry**: UserMap sends nothing to any external server

---

Developed with 💜 for the **Quantified Self** and **Agentic Future**.

