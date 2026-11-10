// Copyright 2024 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* global importScripts, matchFormFillSite, matchLegacySigninUrl */

importScripts("match.js");

// The service worker is the only part that talks to Casdoor and holds the access token. The content scripts ask it
// for the account of the page they are on, and it only answers for a frame whose own URL is a sign-in page.

const SITES_TTL = 60 * 1000;
const PENDING_TTL = 2 * 60 * 1000;
const AUTO_SUBMIT_GAP = 30 * 1000;

let sitesCache = null;
const lastAutoSubmits = new Map();

function getSettings() {
  return chrome.storage.local.get(["endpoint", "applicationName", "accessToken", "userProfile", "disableAutoFill"]);
}

// the settings of the first versions were kept in the synced storage
async function migrateSettings() {
  const local = await chrome.storage.local.get(["migrated"]);
  if (local.migrated) {
    return;
  }
  const synced = await chrome.storage.sync.get(["endpoint", "applicationName", "disableAutoLogin"]);
  const current = await chrome.storage.local.get(["endpoint", "applicationName", "disableAutoFill"]);
  await chrome.storage.local.set({
    endpoint: current.endpoint ?? synced.endpoint ?? "",
    applicationName: current.applicationName ?? synced.applicationName ?? "",
    disableAutoFill: current.disableAutoFill ?? !!synced.disableAutoLogin,
    migrated: true,
  });
  await chrome.storage.sync.remove(["accessToken", "userProfile"]);
}

chrome.runtime.onInstalled.addListener(() => {
  migrateSettings();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.accessToken || changes.endpoint)) {
    sitesCache = null;
  }
});

function normalizeEndpoint(endpoint) {
  return (endpoint || "").trim().replace(/\/+$/, "");
}

async function signOut() {
  sitesCache = null;
  await chrome.storage.local.set({accessToken: "", userProfile: null});
}

async function callApi(path, options = {}) {
  const {endpoint, accessToken} = await getSettings();
  if (!endpoint || !accessToken) {
    return {status: "error", msg: "", data: "Please login first"};
  }
  let response;
  try {
    response = await fetch(`${endpoint}${path}`, {
      ...options,
      headers: {...(options.headers || {}), Authorization: `Bearer ${accessToken}`},
    });
  } catch (error) {
    return {status: "error", msg: error.message, unreachable: true};
  }
  let res;
  try {
    res = await response.json();
  } catch (error) {
    // a Casdoor without the API answers with a page
    return {status: "error", msg: `HTTP ${response.status}`, missing: true};
  }
  if (res.status !== "ok" && res.data === "Please login first") {
    await signOut();
  }
  return res;
}

// getSites returns the sign-in pages that the user's accounts are filled into. A Casdoor without an enterprise license
// or without form autofill falls back to the managed accounts with their sign-in URLs as regular expressions.
async function getSites() {
  const settings = await getSettings();
  if (!settings.endpoint || !settings.accessToken) {
    return null;
  }
  if (sitesCache && sitesCache.endpoint === settings.endpoint && Date.now() - sitesCache.time < SITES_TTL) {
    return sitesCache;
  }

  const res = await callApi("/api/get-form-fill-sites");
  let cache;
  if (res.status === "ok") {
    cache = {mode: "sites", sites: res.data || []};
  } else if (res.code === "edition-required" || res.missing) {
    const accountRes = await callApi("/api/get-account?managedAccounts=1");
    if (accountRes.status !== "ok") {
      return null;
    }
    const accounts = (accountRes.data && accountRes.data.managedAccounts) || [];
    cache = {mode: "legacy", accounts, message: res.code === "edition-required" ? res.msg : ""};
  } else {
    return null;
  }
  sitesCache = {...cache, endpoint: settings.endpoint, time: Date.now()};
  return sitesCache;
}

function findSite(cache, pageUrl) {
  if (cache.mode === "sites") {
    return cache.sites.find((site) => matchFormFillSite(site, pageUrl)) || null;
  }
  const accounts = cache.accounts.filter((account) => account.signinUrl && matchLegacySigninUrl(account.signinUrl, pageUrl));
  if (accounts.length === 0) {
    return null;
  }
  // the first versions always signed in
  return {application: accounts[0].application, displayName: accounts[0].application, accounts: accounts.map((account) => account.username), autoSubmit: true};
}

async function getFill(sender) {
  const settings = await getSettings();
  if (settings.disableAutoFill) {
    return {};
  }
  const cache = await getSites();
  if (!cache) {
    return {};
  }
  const site = findSite(cache, sender.url);
  if (!site) {
    return {};
  }
  const key = `${sender.tab ? sender.tab.id : 0}/${site.application}`;
  const recentlySubmitted = Date.now() - (lastAutoSubmits.get(key) || 0) < AUTO_SUBMIT_GAP;
  return {
    site: {
      application: site.application,
      displayName: site.displayName || site.application,
      usernameSelector: site.usernameSelector || "",
      passwordSelector: site.passwordSelector || "",
      submitSelector: site.submitSelector || "",
      captcha: !!site.captcha,
      captchaSelector: site.captchaSelector || "",
      captchaImageSelector: site.captchaImageSelector || "",
      captchaCharset: site.captchaCharset || "",
      autoSubmit: !!site.autoSubmit && !recentlySubmitted,
      urls: site.urls || [],
    },
    accounts: site.accounts || [],
    canSave: !!site.allowSave && (site.accounts || []).length === 0,
    recentlySubmitted,
  };
}

async function getAccount(message, sender) {
  const cache = await getSites();
  if (!cache) {
    return {error: "not signed in"};
  }
  const site = findSite(cache, sender.url);
  if (!site || site.application !== message.application) {
    return {error: "not a sign-in page"};
  }

  if (cache.mode === "legacy") {
    const account = cache.accounts.find((item) => item.application === site.application && (!message.username || item.username === message.username));
    return account ? {username: account.username, password: account.password} : {error: "no account"};
  }

  const query = new URLSearchParams({application: site.application, username: message.username || "", url: sender.url});
  // so that the audit record says the captcha of this sign-in was read by the extension
  if (site.captcha) {
    query.set("captcha", "true");
  }
  const res = await callApi(`/api/get-form-fill-account?${query.toString()}`);
  if (res.status !== "ok") {
    return {error: res.msg};
  }
  if (message.autoSubmit && sender.tab) {
    lastAutoSubmits.set(`${sender.tab.id}/${site.application}`, Date.now());
  }
  return {username: res.data.username, password: res.data.password};
}

const OFFSCREEN_URL = "/src/offscreen.html";
let offscreenCreating = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]});
  if (contexts.length > 0) {
    return;
  }
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["WORKERS"],
      justification: "Reads the image captcha of a sign-in page with a local model",
    }).finally(() => {
      offscreenCreating = null;
    });
  }
  await offscreenCreating;
}

// recognizeCaptcha reads the captcha image of a sign-in page that the admin turned captcha recognition on for
async function recognizeCaptcha(message, sender) {
  const cache = await getSites();
  const site = cache && findSite(cache, sender.url);
  if (!site || !site.captcha || site.application !== message.application) {
    return {error: "captcha recognition is off for this page"};
  }
  if (typeof message.image !== "string" || !message.image.startsWith("data:image/") || message.image.length > 2 * 1024 * 1024) {
    return {error: "not a captcha image"};
  }
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({target: "offscreen", type: "recognizeCaptcha", image: message.image, charset: message.charset || ""});
  return res || {error: "captcha recognition failed"};
}

function pendingKey(tabId) {
  return `pending-${tabId}`;
}

async function capture(message, sender) {
  if (!sender.tab || !message.username || !message.password) {
    return {};
  }
  const cache = await getSites();
  const site = cache && findSite(cache, sender.url);
  if (!site || !site.allowSave || site.application !== message.application) {
    return {};
  }
  await chrome.storage.session.set({
    [pendingKey(sender.tab.id)]: {
      application: site.application,
      displayName: site.displayName || site.application,
      username: message.username,
      password: message.password,
      url: sender.url,
      time: Date.now(),
    },
  });
  return {};
}

async function getPending(sender) {
  if (!sender.tab) {
    return null;
  }
  const key = pendingKey(sender.tab.id);
  const pending = (await chrome.storage.session.get([key]))[key];
  if (!pending) {
    return null;
  }
  if (Date.now() - pending.time > PENDING_TTL) {
    await chrome.storage.session.remove([key]);
    return null;
  }
  return {application: pending.application, displayName: pending.displayName, username: pending.username};
}

async function resolvePending(message, sender) {
  if (!sender.tab) {
    return {};
  }
  const key = pendingKey(sender.tab.id);
  const pending = (await chrome.storage.session.get([key]))[key];
  await chrome.storage.session.remove([key]);
  if (!pending || !message.save) {
    return {};
  }
  const res = await callApi("/api/save-form-fill-account", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({application: pending.application, username: pending.username, password: pending.password, url: pending.url}),
  });
  sitesCache = null;
  return res.status === "ok" ? {saved: true} : {error: res.msg};
}

function getRedirectUri() {
  return chrome.identity.getRedirectURL();
}

async function login(message) {
  const endpoint = normalizeEndpoint(message.endpoint);
  const applicationName = (message.applicationName || "").trim();
  if (!/^https?:\/\//.test(endpoint) || !applicationName) {
    return {error: "endpoint"};
  }
  await chrome.storage.local.set({endpoint, applicationName});

  let application;
  try {
    const response = await fetch(`${endpoint}/api/get-application?id=admin/${encodeURIComponent(applicationName)}`);
    application = (await response.json()).data;
  } catch (error) {
    return {error: error.message};
  }
  if (!application || !application.clientId) {
    return {error: "application"};
  }

  const state = crypto.randomUUID();
  const authorizeUrl = `${endpoint}/login/oauth/authorize?` + new URLSearchParams({
    client_id: application.clientId,
    response_type: "token",
    redirect_uri: getRedirectUri(),
    scope: "openid profile",
    state,
  }).toString();

  let redirectUrl;
  try {
    redirectUrl = await chrome.identity.launchWebAuthFlow({url: authorizeUrl, interactive: true});
  } catch (error) {
    return {error: error.message};
  }
  const params = new URLSearchParams(new URL(redirectUrl).hash.slice(1));
  if (params.get("state") !== state || !params.get("access_token")) {
    return {error: "token"};
  }

  sitesCache = null;
  await chrome.storage.local.set({accessToken: params.get("access_token")});
  const accountRes = await callApi("/api/get-account");
  if (accountRes.status !== "ok") {
    await signOut();
    return {error: accountRes.msg};
  }
  const user = accountRes.data;
  await chrome.storage.local.set({userProfile: {name: user.name, displayName: user.displayName, avatar: user.avatar, owner: user.owner}});
  return {ok: true};
}

async function getStatus() {
  await migrateSettings();
  const settings = await getSettings();
  const status = {
    endpoint: settings.endpoint || "",
    applicationName: settings.applicationName || "",
    user: settings.accessToken ? settings.userProfile : null,
    autoFill: !settings.disableAutoFill,
    redirectUri: getRedirectUri(),
  };
  if (status.user) {
    const cache = await getSites();
    if (cache) {
      status.mode = cache.mode;
      status.message = cache.message || "";
      status.sites = cache.mode === "sites"
        ? cache.sites.map((site) => ({name: site.displayName || site.application, accounts: site.accounts.length}))
        : cache.accounts.map((account) => ({name: account.application, accounts: 1}));
    }
  }
  return status;
}

const handlers = {
  getFill: (message, sender) => getFill(sender),
  getAccount: (message, sender) => getAccount(message, sender),
  recognizeCaptcha: (message, sender) => recognizeCaptcha(message, sender),
  capture: (message, sender) => capture(message, sender),
  getPending: (message, sender) => getPending(sender),
  resolvePending: (message, sender) => resolvePending(message, sender),
  login: (message) => login(message),
  logout: () => signOut().then(() => ({ok: true})),
  getStatus: () => getStatus(),
  setAutoFill: (message) => chrome.storage.local.set({disableAutoFill: !message.enabled}).then(() => ({ok: true})),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message && message.type];
  if (!handler) {
    return false;
  }
  // the content scripts only reach the handlers that act on their own frame, the rest are for the popup
  const fromExtension = (sender.url || "").startsWith(chrome.runtime.getURL(""));
  if (!fromExtension && ["login", "logout", "getStatus", "setAutoFill"].includes(message.type)) {
    return false;
  }
  handler(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({error: error.message}));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([pendingKey(tabId)]);
  for (const key of lastAutoSubmits.keys()) {
    if (key.startsWith(`${tabId}/`)) {
      lastAutoSubmits.delete(key);
    }
  }
});
