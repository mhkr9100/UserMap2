import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { SlackAdapter } from '../adapters/slack.js';
import { getDb } from '../db/index.js';

const router = Router();
const slack = new SlackAdapter();

// In-memory state store for CSRF protection (MVP: per-process map)
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateState(): string {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now());
  return state;
}

function validateState(state: string): boolean {
  const ts = pendingStates.get(state);
  if (!ts) return false;
  pendingStates.delete(state);
  return Date.now() - ts < STATE_TTL_MS;
}

// POST /api/connect/slack — generate OAuth URL
router.post('/', (_req: Request, res: Response) => {
  try {
    const state = generateState();
    const url = slack.getOAuthUrl(state);
    res.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate OAuth URL';
    res.status(500).json({ error: message });
  }
});

// GET /api/connect/slack/callback — handle OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    return res.status(400).send(renderPage('Connection Cancelled', `<p>Slack access was denied: ${escapeHtml(error ?? '')}.</p><p><a href="javascript:window.close()">Close this window</a></p>`));
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).send(renderPage('Missing Code', '<p>Missing authorization code from Slack.</p>'));
  }

  if (!state || !validateState(state)) {
    return res.status(400).send(renderPage('Invalid State', '<p>OAuth state mismatch. Please try connecting again.</p>'));
  }

  try {
    const tokenData = await slack.exchangeCodeForToken(code);
    const accountId = slack.getAccountId(tokenData);
    const db = getDb();

    db.prepare(`
      INSERT INTO connections (tool, account_id, scopes, access_token, token_type, updated_at)
      VALUES (@tool, @account_id, @scopes, @access_token, @token_type, datetime('now'))
      ON CONFLICT(tool, account_id) DO UPDATE SET
        scopes       = excluded.scopes,
        access_token = excluded.access_token,
        token_type   = excluded.token_type,
        updated_at   = datetime('now')
    `).run({
      tool: 'slack',
      account_id: accountId,
      scopes: tokenData.scope,
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
    });

    return res.send(renderPage(
      'Slack Connected ✓',
      `<p>🎉 Slack has been connected successfully!</p>
       <p>You can now close this window and return to UserMap.</p>
       <script>setTimeout(() => window.close(), 2000);</script>`
    ));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).send(renderPage('Connection Failed', `<p>Could not complete Slack connection: ${escapeHtml(message)}</p>`));
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — UserMap</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f8f9fa; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; padding: 2rem 2.5rem;
            box-shadow: 0 4px 24px rgba(0,0,0,.08); max-width: 400px; width: 100%; text-align: center; }
    h1 { font-size: 1.4rem; margin-bottom: 1rem; color: #1a1a1a; }
    p { color: #555; line-height: 1.6; margin-bottom: .75rem; }
    a { color: #4a6cf7; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </div>
</body>
</html>`;
}

export default router;
