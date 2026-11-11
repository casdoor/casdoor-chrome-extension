// Signing in to Casdoor and calling its API. The sign-in is the authorization code flow with PKCE in a Chrome window
// (chrome.identity), so the extension has no client secret and never sees the user's Casdoor password. The access
// token is refreshed with the refresh token, and both are revoked on sign-out.

import {RequestError} from "../shared/messages";
import type {Connection, User} from "../shared/types";
import {getConnection, getLocal, removeLocal, setLocal, type Session} from "./storage";

/** The redirect URL of the extension from the Chrome Web Store, accepted by every Casdoor application */
export const OFFICIAL_EXTENSION_ID = "bnjbegmkpjbcpneclidlbloadenondlm";

const REFRESH_MARGIN = 60 * 1000;

export function getRedirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

export function normalizeServerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** "name" is an application of the admin organization, "owner/name" any application */
function getApplicationId(application: string): string {
  const value = application.trim();
  return value.includes("/") ? value : `admin/${value}`;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createPkce(): Promise<{verifier: string; challenge: string}> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return {verifier, challenge: base64Url(new Uint8Array(digest))};
}

interface CasdoorResponse<T> {
  status: "ok" | "error";
  msg: string;
  code?: string;
  data: T;
  data2?: unknown;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {...init, credentials: "omit", cache: "no-store"});
  } catch {
    throw new RequestError(`Can't reach ${new URL(url).origin}`, "unreachable");
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new RequestError(`${new URL(url).origin} is not a Casdoor server (HTTP ${response.status})`, "not-casdoor");
  }
}

async function requestToken(serverUrl: string, params: Record<string, string>): Promise<TokenResponse> {
  return fetchJson<TokenResponse>(`${serverUrl}/api/login/oauth/access_token`, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams(params).toString(),
  });
}

async function getClientId(connection: Connection): Promise<string> {
  const id = getApplicationId(connection.application);
  const res = await fetchJson<CasdoorResponse<{clientId?: string} | null>>(`${connection.serverUrl}/api/get-application?id=${encodeURIComponent(id)}`);
  if (res.status !== "ok" || !res.data?.clientId) {
    throw new RequestError(res.msg || `There is no application ${id} in this Casdoor`, "application");
  }
  return res.data.clientId;
}

async function getUser(serverUrl: string, accessToken: string): Promise<User> {
  const res = await fetchJson<CasdoorResponse<User>>(`${serverUrl}/api/get-account`, {headers: {Authorization: `Bearer ${accessToken}`}});
  if (res.status !== "ok" || !res.data) {
    throw new RequestError(res.msg || "Can't read the signed-in user", "account");
  }
  const {owner, name, displayName, avatar, email} = res.data;
  return {owner, name, displayName: displayName || name, avatar: avatar || "", email: email || ""};
}

export async function signIn(input: Connection): Promise<void> {
  const {connection: current, managed, managedApplication} = await getConnection();
  const connection: Connection = {
    serverUrl: normalizeServerUrl(managed ? current.serverUrl : input.serverUrl),
    application: managedApplication ? current.application : input.application.trim(),
  };
  if (!connection.serverUrl || !connection.application) {
    throw new RequestError("Enter the Casdoor server URL and the application", "connection");
  }
  if (!managedApplication) {
    await setLocal({connection});
  }

  const clientId = await getClientId(connection);
  const {verifier, challenge} = await createPkce();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = getRedirectUrl();
  const authorizeUrl = `${connection.serverUrl}/login/oauth/authorize?${new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })}`;

  let redirected: string | undefined;
  try {
    redirected = await chrome.identity.launchWebAuthFlow({url: authorizeUrl, interactive: true});
  } catch (error) {
    // the user closed the window, or Casdoor showed an error page instead of redirecting
    throw new RequestError(error instanceof Error ? error.message : String(error), "cancelled");
  }
  const params = new URL(redirected ?? "").searchParams;
  if (params.get("state") !== state) {
    throw new RequestError("The sign-in came back with a wrong state", "state");
  }
  const code = params.get("code");
  if (!code) {
    throw new RequestError(params.get("error_description") || params.get("error") || "Casdoor gave no authorization code", "code");
  }

  const token = await requestToken(connection.serverUrl, {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
  if (!token.access_token) {
    throw new RequestError(token.error_description || token.error || "Casdoor gave no access token", "token");
  }
  const user = await getUser(connection.serverUrl, token.access_token);
  await setLocal({
    session: {
      clientId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? "",
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      user,
    },
  });
}

async function revoke(serverUrl: string, clientId: string, token: string, hint: string): Promise<void> {
  if (!token) {
    return;
  }
  await fetch(`${serverUrl}/api/login/oauth/revoke`, {
    method: "POST",
    credentials: "omit",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({token, token_type_hint: hint, client_id: clientId}).toString(),
  }).catch(() => undefined);
}

export async function signOut(): Promise<void> {
  const [{session}, {connection}] = await Promise.all([getLocal(), getConnection()]);
  await removeLocal(["session"]);
  if (session && connection.serverUrl) {
    await revoke(connection.serverUrl, session.clientId, session.refreshToken, "refresh_token");
    await revoke(connection.serverUrl, session.clientId, session.accessToken, "access_token");
  }
}

let refreshing: Promise<Session | null> | null = null;

async function refresh(serverUrl: string, session: Session): Promise<Session | null> {
  if (!session.refreshToken) {
    return null;
  }
  const token = await requestToken(serverUrl, {
    grant_type: "refresh_token",
    client_id: session.clientId,
    refresh_token: session.refreshToken,
  }).catch((error: RequestError) => {
    if (error.code === "unreachable") {
      throw error;
    }
    return {} as TokenResponse;
  });
  if (!token.access_token) {
    return null;
  }
  const next: Session = {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || session.refreshToken,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  };
  await setLocal({session: next});
  return next;
}

/** The signed-in session with an access token that is good for a while, or null when the user has to sign in again */
export async function getSession(): Promise<Session | null> {
  const [{session}, {connection}] = await Promise.all([getLocal(), getConnection()]);
  if (!session || !connection.serverUrl) {
    return null;
  }
  if (session.expiresAt - Date.now() > REFRESH_MARGIN) {
    return session;
  }
  refreshing ??= refresh(connection.serverUrl, session).finally(() => {
    refreshing = null;
  });
  const next = await refreshing;
  if (!next) {
    await removeLocal(["session"]);
  }
  return next;
}

export class SignedOutError extends RequestError {
  constructor() {
    super("Sign in to Casdoor in the extension first", "signed-out");
  }
}

/** Calls the Casdoor API as the signed-in user, and signs out when Casdoor no longer takes the token */
export async function callApi<T>(path: string, init: RequestInit = {}): Promise<CasdoorResponse<T>> {
  const session = await getSession();
  const {connection} = await getConnection();
  if (!session) {
    throw new SignedOutError();
  }
  const res = await fetchJson<CasdoorResponse<T>>(`${connection.serverUrl}${path}`, {
    ...init,
    headers: {...init.headers, Authorization: `Bearer ${session.accessToken}`},
  });
  if (res.status !== "ok" && (res.data as unknown) === "Please login first") {
    await removeLocal(["session"]);
    throw new SignedOutError();
  }
  return res;
}
