import { BaseAdapter } from './base.js';

export class SlackAdapter extends BaseAdapter {
  readonly toolName = 'slack';

  private get clientId(): string {
    const val = process.env.SLACK_CLIENT_ID;
    if (!val) throw new Error('SLACK_CLIENT_ID is not set');
    return val;
  }

  private get clientSecret(): string {
    const val = process.env.SLACK_CLIENT_SECRET;
    if (!val) throw new Error('SLACK_CLIENT_SECRET is not set');
    return val;
  }

  private get redirectUri(): string {
    const val = process.env.SLACK_REDIRECT_URI;
    if (!val) throw new Error('SLACK_REDIRECT_URI is not set');
    return val;
  }

  getOAuthUrl(state: string): string {
    const scopes = [
      'channels:history',
      'channels:read',
      'users:read',
      'team:read',
    ].join(',');

    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: scopes,
      redirect_uri: this.redirectUri,
      state,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
    });

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Slack OAuth request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      ok: boolean;
      error?: string;
      access_token?: string;
      token_type?: string;
      scope?: string;
      authed_user?: { id: string };
      team?: { id: string; name: string };
      bot_user_id?: string;
    };

    if (!data.ok) {
      throw new Error(`Slack OAuth error: ${data.error ?? 'unknown'}`);
    }

    return {
      access_token: data.access_token ?? '',
      token_type: data.token_type ?? 'bot',
      scope: data.scope ?? '',
      authed_user: data.authed_user,
      team: data.team,
      bot_user_id: data.bot_user_id,
    };
  }

  getAccountId(tokenData: {
    access_token: string;
    authed_user?: { id: string };
    team?: { id: string };
  }): string {
    const teamId = tokenData.team?.id ?? 'unknown';
    const userId = tokenData.authed_user?.id ?? 'bot';
    return `${teamId}:${userId}`;
  }
}
