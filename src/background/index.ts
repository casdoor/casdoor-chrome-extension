// The service worker answers the content scripts and the popup. A content script only gets an account for the frame it
// runs in, and only when that frame's own URL is a sign-in page of the system; Casdoor checks the URL again.

import {RequestError, type Message, type Reply, type RequestType, type Requests} from "../shared/messages";
import {findSite} from "../shared/match";
import type {PagePlan, PendingAccount, Site, Status} from "../shared/types";
import {recognizeCaptcha} from "./captcha";
import {getRedirectUrl, getSession, OFFICIAL_EXTENSION_ID, signIn, signOut} from "./casdoor";
import {clearSites, getAccount, getSiteOfPage, getSites, saveAccount} from "./sites";
import {getConnection, getLocal, restrictStorage, sessionStore, setLocal} from "./storage";

/** A sign-in page that comes back within this time after an automatic sign-in is filled but not submitted again */
const RESUBMIT_GAP = 30 * 1000;
/** How long an account typed by hand waits for the user to say whether to save it */
const PENDING_TTL = 2 * 60 * 1000;

restrictStorage();

interface Sender {
  tabId: number;
  url: string;
}

interface Captured extends PendingAccount {
  password: string;
  url: string;
  time: number;
}

const submitKey = (tabId: number, application: string) => `submit:${tabId}:${application}`;
const pendingKey = (tabId: number) => `pending:${tabId}`;

/** The automatic sign-ins of a system in a tab, in a row, each within RESUBMIT_GAP of the one before */
async function getSubmits(tabId: number, application: string): Promise<{time: number; count: number}> {
  const submitted = await sessionStore.get<{time: number; count: number}>(submitKey(tabId, application));
  return submitted && Date.now() - submitted.time < RESUBMIT_GAP ? submitted : {time: 0, count: 0};
}

async function isAutofillOn(): Promise<boolean> {
  return (await getLocal()).autofill !== false;
}

async function requireSite(sender: Sender, application: string): Promise<Site> {
  const site = await getSiteOfPage(sender.url);
  if (!site || site.application !== application) {
    throw new RequestError("This page is not a sign-in page of the system");
  }
  return site;
}

type PageHandlers = {[T in RequestType as T extends `page/${string}` ? T : never]: (payload: Requests[T]["request"], sender: Sender) => Promise<Requests[T]["response"]>};
type PopupHandlers = {[T in RequestType as T extends `popup/${string}` ? T : never]: (payload: Requests[T]["request"]) => Promise<Requests[T]["response"]>};

const pageHandlers: PageHandlers = {
  async "page/plan"({manual}, sender) {
    if ((!manual && !(await isAutofillOn())) || !(await getSession())) {
      return null;
    }
    const site = await getSiteOfPage(sender.url);
    if (!site) {
      return null;
    }
    const submitted = await getSubmits(sender.tabId, site.application);
    const lastAccount = (await getLocal()).lastAccounts?.[site.application] ?? "";
    const plan: PagePlan = {
      site,
      recentlySubmitted: submitted.count > 0,
      submitCount: submitted.count,
      preferredAccount: site.accounts.includes(lastAccount) ? lastAccount : site.accounts.length === 1 ? site.accounts[0] : "",
      canSave: site.allowSave && site.accounts.length === 0,
    };
    return plan;
  },

  async "page/account"({application, username, captcha}, sender) {
    const site = await requireSite(sender, application);
    const account = await getAccount(site, username, sender.url, captcha && site.captcha);
    if (site.accounts.length > 1) {
      const {lastAccounts} = await getLocal();
      await setLocal({lastAccounts: {...lastAccounts, [application]: account.username}});
    }
    return account;
  },

  async "page/submitted"({application}, sender) {
    await requireSite(sender, application);
    const submitted = await getSubmits(sender.tabId, application);
    await sessionStore.set(submitKey(sender.tabId, application), {time: Date.now(), count: submitted.count + 1});
    return null;
  },

  async "page/captcha"({application, image, charset}, sender) {
    const site = await requireSite(sender, application);
    if (!site.captcha) {
      throw new RequestError("Captcha recognition is off for this system");
    }
    return recognizeCaptcha(image, site.captchaCharset || charset);
  },

  async "page/capture"({application, username, password}, sender) {
    const site = await requireSite(sender, application);
    if (!site.allowSave || !username || !password) {
      return null;
    }
    const captured: Captured = {application, displayName: site.displayName, username, password, url: sender.url, time: Date.now()};
    await sessionStore.set(pendingKey(sender.tabId), captured);
    return null;
  },

  async "page/pending"(_, sender) {
    const captured = await sessionStore.get<Captured>(pendingKey(sender.tabId));
    if (!captured) {
      return null;
    }
    if (Date.now() - captured.time > PENDING_TTL) {
      await sessionStore.remove([pendingKey(sender.tabId)]);
      return null;
    }
    return {application: captured.application, displayName: captured.displayName, username: captured.username};
  },

  async "page/resolve"({save}, sender) {
    const captured = await sessionStore.get<Captured>(pendingKey(sender.tabId));
    await sessionStore.remove([pendingKey(sender.tabId)]);
    if (!captured || !save) {
      return false;
    }
    // the account was typed on a sign-in page of the system, see page/capture
    const {sites} = await getSites();
    const site = findSite(sites, captured.url);
    if (!site || site.application !== captured.application) {
      throw new RequestError("The system is no longer filled for you");
    }
    await saveAccount(site, {username: captured.username, password: captured.password}, captured.url);
    return true;
  },
};

async function getStatus(refresh: boolean): Promise<Status> {
  const [{connection, managed, managedApplication}, session, local] = await Promise.all([getConnection(), getSession(), getLocal()]);
  const status: Status = {
    connection,
    managed,
    managedApplication,
    user: session?.user ?? null,
    autofill: local.autofill !== false,
    full: true,
    sites: [],
    error: "",
    redirectUrl: getRedirectUrl(),
    official: chrome.runtime.id === OFFICIAL_EXTENSION_ID,
  };
  if (status.user) {
    try {
      const list = await getSites(refresh);
      status.sites = list.sites;
      status.full = list.full;
    } catch (error) {
      status.error = error instanceof Error ? error.message : String(error);
      if (!(await getSession())) {
        status.user = null;
      }
    }
  }
  return status;
}

const popupHandlers: PopupHandlers = {
  "popup/status": ({refresh}) => getStatus(refresh),

  async "popup/tab"({url}) {
    if (!(await getSession())) {
      return {site: null};
    }
    return {site: await getSiteOfPage(url).catch(() => null)};
  },

  async "popup/signIn"(connection) {
    clearSites();
    await signIn(connection);
    return getStatus(true);
  },

  async "popup/signOut"() {
    clearSites();
    await signOut();
    return getStatus(false);
  },

  async "popup/autofill"({enabled}) {
    await setLocal({autofill: enabled});
    return getStatus(false);
  },
};

/** The popup, or another page of the extension; content scripts never run in those */
/**
 * The address of the frame. Chrome reports the frame's address as of its last navigation, which can lag behind a
 * single-page app that has just changed its address (like adding "#/login"), so the content script sends its own,
 * and it is taken only on the same origin as the frame.
 */
function getPageUrl(senderUrl: string, claimed: string | undefined): string {
  try {
    if (claimed && new URL(claimed).origin === new URL(senderUrl).origin) {
      return claimed;
    }
  } catch {
    // not a URL, keep the frame's address
  }
  return senderUrl;
}

function isFromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && (sender.url ?? "").startsWith(chrome.runtime.getURL(""));
}

async function handle(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (message.type.startsWith("page/")) {
    // the URL of the frame the content script runs in, not of the tab
    if (!sender.tab?.id || !sender.url || sender.id !== chrome.runtime.id) {
      throw new RequestError("Not a page");
    }
    const handler = pageHandlers[message.type as keyof PageHandlers] as (payload: unknown, sender: Sender) => Promise<unknown>;
    return handler(message.payload, {tabId: sender.tab.id, url: getPageUrl(sender.url, message.url)});
  }
  if (message.type.startsWith("popup/") && isFromExtensionPage(sender)) {
    const handler = popupHandlers[message.type as keyof PopupHandlers] as (payload: unknown) => Promise<unknown>;
    return handler(message.payload);
  }
  throw new RequestError("Unknown request");
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse: (reply: Reply) => void) => {
  if (!message || typeof message.type !== "string" || !(message.type in pageHandlers || message.type in popupHandlers)) {
    return false;
  }
  handle(message, sender)
    .then((data) => sendResponse({ok: true, data} as Reply))
    .catch((error: unknown) => {
      const code = error instanceof RequestError ? error.code : "";
      sendResponse({ok: false, error: error instanceof Error ? error.message : String(error), code});
    });
  return true;
});

// the versions before 2.0 kept the Casdoor address and application under other keys, sometimes in the synced storage
chrome.runtime.onInstalled.addListener(async ({reason}) => {
  if (reason !== chrome.runtime.OnInstalledReason.UPDATE) {
    return;
  }
  const oldKeys = ["endpoint", "applicationName", "accessToken", "userProfile", "disableAutoFill", "disableAutoLogin", "migrated"];
  const [local, synced] = await Promise.all([chrome.storage.local.get(oldKeys), chrome.storage.sync.get(oldKeys)]);
  const serverUrl = (local.endpoint || synced.endpoint || "") as string;
  const application = (local.applicationName || synced.applicationName || "") as string;
  if (serverUrl && !(await getLocal()).connection) {
    await setLocal({connection: {serverUrl, application}});
  }
  await Promise.all([chrome.storage.local.remove(oldKeys), chrome.storage.sync.remove(oldKeys)]);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void sessionStore.removeTab(tabId);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "local" && (changes.connection || changes.session)) || area === "managed") {
    clearSites();
  }
});
