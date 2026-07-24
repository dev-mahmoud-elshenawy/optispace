import "server-only";

import { db } from "@/lib/db";

// Microsoft Graph via OAuth2 device flow (public client — the client id is not a secret).
// "common" lets both work and personal Microsoft accounts sign in; an org can pin its tenant
// id here if it restricts multi-tenant apps. offline_access yields a refresh token because
// Graph access tokens live only ~1h.
const TENANT = "common";
export const GRAPH_DEVICE_CODE_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`;
export const GRAPH_TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
export const GRAPH_SCOPES = "openid profile offline_access User.Read Calendars.ReadWrite";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Microsoft's OAuth endpoints require application/x-www-form-urlencoded bodies (unlike
// GitHub's JSON) — this is the single most common wiring mistake, so it's centralized here.
export function graphForm(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

export interface GraphTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  scope?: string;
}

// Persist a fresh token set. expiresAt is computed from expires_in with a small safety skew.
export async function storeGraphToken(token: GraphTokenResponse, clientId: string, account: string | null): Promise<void> {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await db.graphAuth.upsert({
    where: { id: "singleton" },
    update: {
      clientId,
      accessToken: token.access_token,
      // A refresh response may omit refresh_token — keep the existing one when so.
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      expiresAt,
      scope: token.scope ?? null,
      account,
    },
    create: {
      id: "singleton",
      clientId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt,
      scope: token.scope ?? null,
      account,
    },
  });
}

export async function fetchGraphAccount(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.userPrincipalName as string) || (data.mail as string) || null;
  } catch {
    return null;
  }
}

// A usable access token, refreshing via the stored refresh_token when the current one is
// (about to be) expired. Returns null when not connected or the refresh fails — callers
// treat null as "not connected" and no-op, mirroring resolveGithubToken.
export async function resolveGraphToken(): Promise<string | null> {
  const row = await db.graphAuth.findUnique({ where: { id: "singleton" } });
  if (!row) return null;
  // 60s skew so we renew slightly before expiry rather than mid-request.
  if (row.expiresAt.getTime() - 60_000 > Date.now()) return row.accessToken;
  if (!row.refreshToken || !row.clientId) return null;

  try {
    const res = await fetch(GRAPH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: graphForm({
        client_id: row.clientId,
        grant_type: "refresh_token",
        refresh_token: row.refreshToken,
        scope: GRAPH_SCOPES,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) return null;
    await storeGraphToken(data as GraphTokenResponse, row.clientId, row.account);
    return (data as GraphTokenResponse).access_token;
  } catch {
    return null;
  }
}

// Authenticated Graph request helper (used by the calendar read/write in later phases).
export async function graphFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await resolveGraphToken();
  if (!token) return null;
  return fetch(path.startsWith("http") ? path : `${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}
