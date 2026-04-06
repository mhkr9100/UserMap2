/**
 * GitHubAdapter — connects UserMap to GitHub via OAuth.
 *
 * Required env vars:
 *   VITE_GITHUB_CLIENT_ID      — from your GitHub OAuth App settings
 *   VITE_GITHUB_CLIENT_SECRET  — from your GitHub OAuth App settings
 *
 * OAuth scopes requested: repo (read), user (read)
 *
 * The GitHub REST API is called directly from the browser using the user's
 * personal access token (or the OAuth token).  No data is sent to any
 * UserMap backend.
 *
 * Token exchange notes:
 *   GitHub does not support PKCE for OAuth Apps.  The client secret must be
 *   kept server-side.  This adapter therefore delegates the exchange to a
 *   local proxy endpoint at POST /api/integrations/github/token (same pattern
 *   as the Slack adapter).  When running as a Tauri desktop app you can
 *   replace that call with a Tauri command that calls GitHub from Rust.
 *
 * Alternative — Personal Access Token (PAT) mode:
 *   If the user already has a GitHub PAT they can paste it directly.  The UI
 *   offers both OAuth and PAT flows via the IntegrationsPanel.
 */

import { BaseAdapter } from './base';
import type { IntegrationId, IntegrationConnection, ToolContextItem } from '../../types';

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;
const CLIENT_SECRET = import.meta.env.VITE_GITHUB_CLIENT_SECRET as string | undefined;

/** Maximum characters to include from a PR or issue body. */
const MAX_BODY_LENGTH = 200;
/** Maximum characters to include from a comment body. */
const MAX_COMMENT_LENGTH = 300;

/** Scopes requested from GitHub. */
const SCOPES = 'repo user:email read:user';

interface GitHubTokenResponse {
    access_token?: string;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
}

interface GitHubUser {
    login: string;
    name?: string;
}

interface GitHubEvent {
    type: string;
    repo?: { name: string };
    payload?: {
        commits?: Array<{ message: string; sha: string }>;
        pull_request?: { title: string; body?: string; html_url: string };
        issue?: { title: string; body?: string; html_url: string };
        comment?: { body: string };
    };
    created_at?: string;
}

export class GitHubAdapter extends BaseAdapter {
    readonly id: IntegrationId = 'github';
    override readonly supportsPAT: boolean = true;

    buildOAuthUrl(redirectUri: string): string {
        if (!CLIENT_ID) {
            throw new Error('VITE_GITHUB_CLIENT_ID is not set. Add it to your .env file.');
        }
        const state = crypto.randomUUID();
        sessionStorage.setItem('usermap_github_oauth_state', state);

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: redirectUri,
            scope: SCOPES,
            state
        });
        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    async exchangeCode(code: string, redirectUri: string): Promise<IntegrationConnection> {
        if (!CLIENT_ID || !CLIENT_SECRET) {
            throw new Error('VITE_GITHUB_CLIENT_ID and VITE_GITHUB_CLIENT_SECRET must both be set.');
        }

        // Delegate to local proxy — see class-level doc comment.
        const response = await fetch('/api/integrations/github/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: redirectUri })
        });

        if (!response.ok) {
            const data: GitHubTokenResponse = await response.json().catch(() => ({}));
            throw new Error(
                data.error_description || data.error || `GitHub token exchange failed (${response.status}).`
            );
        }

        const data: GitHubTokenResponse = await response.json();
        if (!data.access_token) {
            throw new Error(data.error_description || data.error || 'GitHub did not return an access token.');
        }

        // Resolve the authenticated user's login name.
        const userRes = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${data.access_token}`,
                Accept: 'application/vnd.github+json'
            }
        });
        const userData: GitHubUser = userRes.ok ? await userRes.json() : { login: 'unknown' };

        const connection: IntegrationConnection = {
            id: 'github',
            accessToken: data.access_token,
            connectedAt: new Date().toISOString(),
            accountName: userData.login || userData.name
        };
        this.saveConnection(connection);
        return connection;
    }

    /**
     * PAT shortcut: store a Personal Access Token directly (no OAuth popup).
     * This is offered in the UI as an alternative to the OAuth flow.
     */
    async connectWithPAT(pat: string): Promise<IntegrationConnection> {
        const userRes = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${pat}`,
                Accept: 'application/vnd.github+json'
            }
        });

        if (!userRes.ok) {
            throw new Error('Invalid GitHub Personal Access Token. Please check and try again.');
        }

        const userData: GitHubUser = await userRes.json();
        const connection: IntegrationConnection = {
            id: 'github',
            accessToken: pat,
            connectedAt: new Date().toISOString(),
            accountName: userData.login || userData.name
        };
        this.saveConnection(connection);
        return connection;
    }

    async fetchContext(
        connection: IntegrationConnection,
        query: string,
        limit: number
    ): Promise<ToolContextItem[]> {
        const items: ToolContextItem[] = [];
        const headers = {
            Authorization: `Bearer ${connection.accessToken}`,
            Accept: 'application/vnd.github+json'
        };

        // Fetch recent public events for the authenticated user.
        const userRes = await fetch('https://api.github.com/user', { headers });
        if (!userRes.ok) return items;

        const user: GitHubUser = await userRes.json();

        const eventsRes = await fetch(
            `https://api.github.com/users/${encodeURIComponent(user.login)}/events?per_page=50`,
            { headers }
        );
        if (!eventsRes.ok) return items;

        const events: GitHubEvent[] = await eventsRes.json();
        const queryLower = query.toLowerCase();

        for (const event of events) {
            let text = '';
            let title = event.repo?.name || 'GitHub';
            const meta: Record<string, string> = { repo: event.repo?.name || '' };

            if (event.type === 'PushEvent') {
                const msgs = (event.payload?.commits || [])
                    .map((c) => c.message)
                    .filter(Boolean)
                    .join('; ');
                if (!msgs) continue;
                text = `Pushed commits: ${msgs}`;
            } else if (event.type === 'PullRequestEvent') {
                const pr = event.payload?.pull_request;
                if (!pr) continue;
                title = pr.title;
                text = `Pull request: ${pr.title}${pr.body ? ` — ${pr.body.slice(0, MAX_BODY_LENGTH)}` : ''}`;
                meta.url = pr.html_url;
            } else if (event.type === 'IssuesEvent') {
                const issue = event.payload?.issue;
                if (!issue) continue;
                title = issue.title;
                text = `Issue: ${issue.title}${issue.body ? ` — ${issue.body.slice(0, MAX_BODY_LENGTH)}` : ''}`;
                meta.url = issue.html_url;
            } else if (event.type === 'IssueCommentEvent') {
                const comment = event.payload?.comment;
                if (!comment) continue;
                text = `Comment: ${comment.body.slice(0, MAX_COMMENT_LENGTH)}`;
            } else {
                continue;
            }

            if (query && !text.toLowerCase().includes(queryLower) && !title.toLowerCase().includes(queryLower)) {
                continue;
            }

            items.push({
                source: 'github',
                title,
                text,
                date: event.created_at,
                meta
            });

            if (items.length >= limit) break;
        }

        return items;
    }
}

export const githubAdapter = new GitHubAdapter();
