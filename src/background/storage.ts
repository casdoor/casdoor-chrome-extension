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

/** What the IT admin's policy sets, see public/managed_schema.json */
async function getPolicy(): Promise<Record<string, unknown>> {
  try {
    return await chrome.storage.managed.get(["serverUrl", "application", "protectSignInPages"]);
  } catch {
    return {};
  }
}

let preset: Promise<Record<string, unknown>> | undefined;

/**
 * What is written into config.json of the unzipped package by whoever hands it out, so that it works as soon as it is
 * loaded. It's empty in the packages we publish.
 */
function getPreset(): Promise<Record<string, unknown>> {
  preset ??= fetch(chrome.runtime.getURL("config.json"))
    .then((response) => (response.ok ? response.json() : null))
    .then((config: unknown) => (config && typeof config === "object" ? (config as Record<string, unknown>) : {}))
    .catch(() => ({}));
  return preset;
}

function toConnection(settings: Record<string, unknown>): Partial<Connection> {
  return {
    serverUrl: typeof settings.serverUrl === "string" ? settings.serverUrl.trim() : undefined,
    application: typeof settings.application === "string" ? settings.application.trim() : undefined,
  };
}

/** Whether the sign-in pages of the systems are protected, see background/guard.ts. On unless the policy or config.json turns it off */
export async function isGuardOn(): Promise<boolean> {
  const [policy, presetSettings] = await Promise.all([getPolicy(), getPreset()]);
  for (const settings of [policy, presetSettings]) {
    if (typeof settings.protectSignInPages === "boolean") {
      return settings.protectSignInPages;
    }
  }
  return true;
}

/**
 * The Chrome policy wins over config.json, which wins over what the user entered. Users can't change the server URL
 * once one of the two sets it, nor the application when it's set along with it.
 */
export async function getConnection(): Promise<{connection: Connection; managed: boolean; managedApplication: boolean}> {
  const [{connection}, policySettings, presetSettings] = await Promise.all([getLocal(), getPolicy(), getPreset()]);
  const policy = toConnection(policySettings);
  const presetConnection = toConnection(presetSettings);
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
