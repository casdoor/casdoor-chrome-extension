// While a tab is on a sign-in page of one of the user's systems, the browser doesn't offer to save passwords, so the
// accounts filled from Casdoor (and the ones typed there) don't end up in the browser's password manager. Chrome asks
// to save once the sign-in went through, after the page is left, so the setting comes back a while after the tab
// leaves the page. Only the browser-wide setting exists, the other tabs are without the offer for that while too.

import {sessionStore} from "./storage";

/** How long the offer to save stays off after the tab left the sign-in page */
const RELEASE_DELAY = 10 * 1000;

interface Guard {
  /** The address of the tab when the sign-in page was opened, the sign-in page itself or a page that frames it */
  url: string;
  /** When the offer to save may come back, 0 while the tab is still on the page */
  releaseAt: number;
}

const guardKey = (tabId: number) => `guard:${tabId}`;

async function getGuards(): Promise<Map<number, Guard>> {
  const all = await chrome.storage.session.get(null);
  const guards = new Map<number, Guard>();
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith("guard:")) {
      guards.set(Number(key.slice("guard:".length)), value as Guard);
    }
  }
  return guards;
}

const passwordSaving = chrome.privacy.services.passwordSavingEnabled;

/** Turns the offer to save off while a tab is guarded, and gives the user's own setting back once none is */
async function applyPasswordSaving(guarded: boolean): Promise<void> {
  try {
    const {levelOfControl} = await passwordSaving.get({});
    // set by a policy or another extension, which wins anyway
    if (levelOfControl !== "controllable_by_this_extension" && levelOfControl !== "controlled_by_this_extension") {
      return;
    }
    if (guarded) {
      await passwordSaving.set({value: false});
    } else if (levelOfControl === "controlled_by_this_extension") {
      await passwordSaving.clear({});
    }
  } catch {
    // e.g. a browser without the setting
  }
}

let sweepTimer: ReturnType<typeof setTimeout> | undefined;

/** Ends the guards whose tab has left the sign-in page long enough ago */
export async function sweepGuards(): Promise<void> {
  const guards = await getGuards();
  const now = Date.now();
  let next = 0;
  for (const [tabId, guard] of guards) {
    if (guard.releaseAt && guard.releaseAt <= now) {
      guards.delete(tabId);
      await sessionStore.remove([guardKey(tabId)]);
    } else if (guard.releaseAt) {
      next = next ? Math.min(next, guard.releaseAt) : guard.releaseAt;
    }
  }
  await applyPasswordSaving(guards.size > 0);
  clearTimeout(sweepTimer);
  if (next) {
    sweepTimer = setTimeout(() => void sweepGuards(), next - now + 100);
  }
}

/** A frame of the tab is a sign-in page of one of the user's systems */
export async function guardTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  await sessionStore.set(guardKey(tabId), {url: tab?.url ?? "", releaseAt: 0} satisfies Guard);
  await applyPasswordSaving(true);
}

/** The tab went somewhere else: the offer to save comes back a while later, unless it opens a sign-in page again */
async function onTabAddress(tabId: number, url: string): Promise<void> {
  const guard = await sessionStore.get<Guard>(guardKey(tabId));
  if (!guard || guard.releaseAt || url === guard.url) {
    return;
  }
  await sessionStore.set(guardKey(tabId), {url: guard.url, releaseAt: Date.now() + RELEASE_DELAY} satisfies Guard);
  await sweepGuards();
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url ?? (changeInfo.status === "complete" ? tab.url : undefined);
  if (url) {
    void onTabAddress(tabId, url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void sessionStore.remove([guardKey(tabId)]).then(sweepGuards);
});

// the guards live in the session storage, which a restart of the browser empties
chrome.runtime.onStartup.addListener(() => void sweepGuards());
void sweepGuards();
