// What the extension keeps. The tokens stay in chrome.storage.local, which only the extension's own pages and its
// service worker can read (content scripts are kept out with setAccessLevel), and are never synced to other devices.

import type {Connection, User} from "../shared/types";

export interface Session {
  clientId: string;
  accessToken: string;
  refreshToken: string;
  /** When the access token expires, in milliseconds */
  expiresAt: number;
  user: User;
}

interface Local {
  connection?: Connection;
  session?: Session;
  autofill?: boolean;
  /** The account used last time for each system, so that the user picks once */
  lastAccounts?: Record<string, string>;
}

export function restrictStorage(): void {
  for (const area of [chrome.storage.local, chrome.storage.session]) {
    area.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"}).catch(() => undefined);
  }
}

export async function getLocal(): Promise<Local> {
  return (await chrome.storage.local.get(["connection", "session", "autofill", "lastAccounts"])) as Local;
}

export async function setLocal(values: Partial<Local>): Promise<void> {
  await chrome.storage.local.set(values);
}

export async function removeLocal(keys: (keyof Local)[]): Promise<void> {
  await chrome.storage.local.remove(keys);
}

/** The connection set by the IT admin's policy, see public/managed_schema.json */
export async function getManagedConnection(): Promise<Partial<Connection>> {
  try {
    const policy = await chrome.storage.managed.get(["serverUrl", "application"]);
    return {
      serverUrl: typeof policy.serverUrl === "string" ? policy.serverUrl.trim() : undefined,
      application: typeof policy.application === "string" ? policy.application.trim() : undefined,
    };
  } catch {
    return {};
  }
}

let preset: Promise<Partial<Connection>> | undefined;

/**
 * The connection written into config.json of the unzipped package by whoever hands it out, so that it works as soon as
 * it is loaded. It's empty in the packages we publish.
 */
export function getPresetConnection(): Promise<Partial<Connection>> {
  preset ??= fetch(chrome.runtime.getURL("config.json"))
    .then((response) => (response.ok ? response.json() : null))
    .then((config: {serverUrl?: unknown; application?: unknown} | null) => ({
      serverUrl: typeof config?.serverUrl === "string" ? config.serverUrl.trim() : undefined,
      application: typeof config?.application === "string" ? config.application.trim() : undefined,
    }))
    .catch(() => ({}));
  return preset;
}

/**
 * The Chrome policy wins over config.json, which wins over what the user entered. Users can't change the server URL
 * once one of the two sets it, nor the application when it's set along with it.
 */
export async function getConnection(): Promise<{connection: Connection; managed: boolean; managedApplication: boolean}> {
  const [{connection}, policy, presetConnection] = await Promise.all([getLocal(), getManagedConnection(), getPresetConnection()]);
  const fixed = policy.serverUrl ? policy : presetConnection;
  const managed = !!fixed.serverUrl;
  const managedApplication = managed && !!fixed.application;
  return {
    connection: {
      serverUrl: fixed.serverUrl || connection?.serverUrl || "",
      application: (managedApplication ? fixed.application : connection?.application) || "",
    },
    managed,
    managedApplication,
  };
}

/** Things that live as long as the browser session, keyed by tab */
export const sessionStore = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await chrome.storage.session.get(key))[key] as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.session.set({[key]: value});
  },
  async remove(keys: string[]): Promise<void> {
    await chrome.storage.session.remove(keys);
  },
  async removeTab(tabId: number): Promise<void> {
    const all = await chrome.storage.session.get(null);
    const keys = Object.keys(all).filter((key) => key.split(":")[1] === String(tabId));
    if (keys.length > 0) {
      await chrome.storage.session.remove(keys);
    }
  },
};
