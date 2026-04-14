/**
 * Slack Sync Service
 *
 * Fetches messages from all joined public channels for every connected
 * Slack workspace token stored in the `connections` table.
 *
 * Supports:
 *  - Incremental sync via `oldest` cursor stored in `sync_state`
 *  - Pagination via Slack's `next_cursor` / `response_metadata`
 *  - De-duplication by UNIQUE(channel_id, ts) — upsert on conflict
 *  - Rate-limit handling: respects `Retry-After` header on HTTP 429
 *  - Full error and event logging via `appendLog`
 */

import { getDb } from '../db/index.js';
import { appendLog } from '../routes/logs.js';

// ---------------------------------------------------------------------------
// Slack API type shapes (minimal — only what we store)
// ---------------------------------------------------------------------------

interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
}

interface SlackMessage {
  ts: string;
  user?: string;
  bot_id?: string;
  text?: string;
  thread_ts?: string;
  attachments?: unknown[];
  files?: unknown[];
  [key: string]: unknown;
}

interface SlackListResponse {
  ok: boolean;
  error?: string;
  channels?: SlackChannel[];
  response_metadata?: { next_cursor?: string };
}

interface SlackHistoryResponse {
  ok: boolean;
  error?: string;
  messages?: SlackMessage[];
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

interface ConnectionRecord {
  id: number;
  tool: string;
  account_id: string;
  access_token: string;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call a Slack API method with automatic retry on rate-limit.
 * Returns the parsed JSON body.
 */
async function slackRequest(
  method: string,
  params: Record<string, string>,
  token: string,
  maxRetries = 3,
): Promise<unknown> {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '10', 10);
      await sleep((retryAfter + 1) * 1000);
      continue;
    }

    if (!resp.ok) {
      throw new Error(`Slack HTTP error ${resp.status} on ${method}`);
    }

    const data = await resp.json();
    return data;
  }
  throw lastError ?? new Error(`Slack request failed after retries: ${method}`);
}

// ---------------------------------------------------------------------------
// Main sync entry point
// ---------------------------------------------------------------------------

export interface SlackSyncResult {
  ok: boolean;
  error?: string;
  channels_synced: number;
  messages_imported: number;
  messages_skipped: number;
}

/**
 * Run a full incremental sync for a specific Slack connection.
 *
 * @param connectionId  Row ID from the `connections` table (tool='slack').
 *                      Pass -1 to sync all connected Slack workspaces.
 */
export async function syncSlack(connectionId?: number): Promise<SlackSyncResult[]> {
  const db = getDb();

  // Fetch connection(s)
  const conns: ConnectionRecord[] = connectionId != null
    ? (db.prepare('SELECT * FROM connections WHERE id = ? AND tool = ?').all(connectionId, 'slack') as ConnectionRecord[])
    : (db.prepare("SELECT * FROM connections WHERE tool = 'slack'").all() as ConnectionRecord[]);

  if (conns.length === 0) {
    appendLog({
      event_type: 'slack.sync.skipped',
      source_tool: 'slack',
      actor: 'system',
      summary: 'No Slack connections found — skipping sync',
      severity: 'warn',
    });
    return [];
  }

  const results: SlackSyncResult[] = [];

  for (const conn of conns) {
    const result = await syncConnection(conn);
    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Per-connection sync
// ---------------------------------------------------------------------------

async function syncConnection(conn: ConnectionRecord): Promise<SlackSyncResult> {
  const db = getDb();
  const token = conn.access_token;
  const accountLabel = `slack:${conn.account_id}`;

  appendLog({
    event_type: 'slack.sync.started',
    source_tool: 'slack',
    actor: 'system',
    object_ref: accountLabel,
    summary: `Starting Slack sync for workspace ${conn.account_id}`,
  });

  // Update or insert sync_state
  db.prepare(`
    INSERT INTO sync_state (tool, status, updated_at)
    VALUES (?, 'syncing', datetime('now'))
    ON CONFLICT(tool) DO UPDATE SET
      status = 'syncing',
      error_msg = NULL,
      updated_at = datetime('now')
  `).run(accountLabel);

  // Update connector_config status
  db.prepare(`
    UPDATE connector_config
    SET last_run = datetime('now'), last_status = 'syncing', last_error = NULL, updated_at = datetime('now')
    WHERE connector_type = 'slack'
  `).run();

  let channelsSynced = 0;
  let messagesImported = 0;
  let messagesSkipped = 0;

  try {
    // ── Step 1: list all joined channels ────────────────────────────────────
    const channels = await listAllChannels(token);

    if (channels.length === 0) {
      appendLog({
        event_type: 'slack.sync.no_channels',
        source_tool: 'slack',
        actor: 'system',
        object_ref: accountLabel,
        summary: 'No joined channels found in this workspace',
        severity: 'info',
      });
    }

    // ── Step 2: for each channel, fetch history ──────────────────────────────
    for (const channel of channels) {
      let channelImported = 0;
      let channelSkipped = 0;

      try {
        const { imported, skipped } = await syncChannelHistory(
          token,
          channel.id,
          channel.name,
          conn.id,
        );
        channelImported += imported;
        channelSkipped += skipped;
      } catch (chErr: unknown) {
        const msg = chErr instanceof Error ? chErr.message : String(chErr);
        appendLog({
          event_type: 'slack.sync.channel_error',
          source_tool: 'slack',
          actor: 'system',
          object_ref: `${accountLabel}#${channel.name}`,
          summary: `Error syncing channel #${channel.name}: ${msg}`,
          severity: 'error',
        });
      }

      messagesImported += channelImported;
      messagesSkipped += channelSkipped;
      channelsSynced += 1;
    }

    // ── Step 3: mark success ────────────────────────────────────────────────
    db.prepare(`
      UPDATE sync_state SET
        status = 'idle',
        last_synced = datetime('now'),
        updated_at = datetime('now')
      WHERE tool = ?
    `).run(accountLabel);

    db.prepare(`
      UPDATE connector_config
      SET last_status = 'ok', updated_at = datetime('now')
      WHERE connector_type = 'slack'
    `).run();

    appendLog({
      event_type: 'slack.sync.completed',
      source_tool: 'slack',
      actor: 'system',
      object_ref: accountLabel,
      summary: `Slack sync complete: ${messagesImported} imported, ${messagesSkipped} skipped across ${channelsSynced} channels`,
    });

    return { ok: true, channels_synced: channelsSynced, messages_imported: messagesImported, messages_skipped: messagesSkipped };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    db.prepare(`
      UPDATE sync_state SET
        status = 'error',
        error_msg = ?,
        updated_at = datetime('now')
      WHERE tool = ?
    `).run(msg, accountLabel);

    db.prepare(`
      UPDATE connector_config
      SET last_status = 'error', last_error = ?, updated_at = datetime('now')
      WHERE connector_type = 'slack'
    `).run(msg);

    appendLog({
      event_type: 'slack.sync.error',
      source_tool: 'slack',
      actor: 'system',
      object_ref: accountLabel,
      summary: `Slack sync failed: ${msg}`,
      severity: 'error',
    });

    return { ok: false, error: msg, channels_synced: channelsSynced, messages_imported: messagesImported, messages_skipped: messagesSkipped };
  }
}

// ---------------------------------------------------------------------------
// List all channels (pagination)
// ---------------------------------------------------------------------------

async function listAllChannels(token: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor = '';

  do {
    const params: Record<string, string> = {
      types: 'public_channel',
      exclude_archived: 'true',
      limit: '200',
    };
    if (cursor) params.cursor = cursor;

    const data = (await slackRequest('conversations.list', params, token)) as SlackListResponse;

    if (!data.ok) {
      throw new Error(`conversations.list error: ${data.error ?? 'unknown'}`);
    }

    const batch = (data.channels ?? []).filter((c) => c.is_member);
    channels.push(...batch);

    cursor = data.response_metadata?.next_cursor ?? '';
  } while (cursor);

  return channels;
}

// ---------------------------------------------------------------------------
// Sync a single channel (pagination + upsert)
// ---------------------------------------------------------------------------

async function syncChannelHistory(
  token: string,
  channelId: string,
  channelName: string,
  connectionId: number,
): Promise<{ imported: number; skipped: number }> {
  const db = getDb();
  let imported = 0;
  let skipped = 0;
  let cursor = '';

  // Use the most-recent ts in the DB as `oldest` for incremental sync
  const lastRow = db.prepare(
    'SELECT ts FROM slack_messages WHERE channel_id = ? ORDER BY ts DESC LIMIT 1',
  ).get(channelId) as { ts: string } | undefined;
  const oldest = lastRow?.ts ?? '0';

  const upsert = db.prepare(`
    INSERT INTO slack_messages
      (connection_id, channel_id, ts, user_id, text, thread_ts, timestamp, attachments, files, raw_json)
    VALUES
      (@connection_id, @channel_id, @ts, @user_id, @text, @thread_ts, @timestamp, @attachments, @files, @raw_json)
    ON CONFLICT(channel_id, ts) DO UPDATE SET
      text        = excluded.text,
      user_id     = excluded.user_id,
      thread_ts   = excluded.thread_ts,
      attachments = excluded.attachments,
      files       = excluded.files,
      raw_json    = excluded.raw_json
  `);

  do {
    const params: Record<string, string> = {
      channel: channelId,
      limit: '200',
      oldest,
    };
    if (cursor) params.cursor = cursor;

    const data = (await slackRequest('conversations.history', params, token)) as SlackHistoryResponse;

    if (!data.ok) {
      // 'not_in_channel' means the bot was removed — skip gracefully
      if (data.error === 'not_in_channel') break;
      throw new Error(`conversations.history error for #${channelName}: ${data.error ?? 'unknown'}`);
    }

    const messages = data.messages ?? [];

    const insertMany = db.transaction((msgs: SlackMessage[]) => {
      for (const msg of msgs) {
        const tsNum = parseFloat(msg.ts);
        if (isNaN(tsNum)) {
          skipped += 1;
          continue;
        }
        const isoTs = new Date(tsNum * 1000).toISOString();

        const info = upsert.run({
          connection_id: connectionId,
          channel_id: channelId,
          ts: msg.ts,
          user_id: msg.user ?? msg.bot_id ?? null,
          text: msg.text ?? '',
          thread_ts: msg.thread_ts ?? null,
          timestamp: isoTs,
          attachments: JSON.stringify(msg.attachments ?? []),
          files: JSON.stringify(msg.files ?? []),
          raw_json: JSON.stringify(msg),
        });

        if (info.changes > 0) {
          imported += 1;
        } else {
          skipped += 1;
        }
      }
    });

    insertMany(messages);

    cursor = data.response_metadata?.next_cursor ?? '';
  } while (cursor);

  return { imported, skipped };
}
