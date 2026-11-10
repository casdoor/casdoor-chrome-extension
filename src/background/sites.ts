// The systems whose sign-in forms are filled for the user, and the accounts handed out for them

import {RequestError} from "../shared/messages";
import {findSite} from "../shared/match";
import type {Account, Site} from "../shared/types";
import {callApi} from "./casdoor";

const SITES_TTL = 60 * 1000;

interface SiteList {
  sites: Site[];
  /** The form autofill of the enterprise edition; without it only the managed accounts are filled and submitted */
  full: boolean;
  fetchedAt: number;
}

let cache: SiteList | null = null;

export function clearSites(): void {
  cache = null;
}

function normalize(site: Partial<Site>): Site {
  return {
    application: site.application ?? "",
    displayName: site.displayName || site.application || "",
    logo: site.logo ?? "",
    urls: site.urls ?? [],
    usernameSelector: site.usernameSelector ?? "",
    passwordSelector: site.passwordSelector ?? "",
    submitSelector: site.submitSelector ?? "",
    autoSubmit: !!site.autoSubmit,
    allowSave: !!site.allowSave,
    captcha: !!site.captcha,
    captchaSelector: site.captchaSelector ?? "",
    captchaImageSelector: site.captchaImageSelector ?? "",
    captchaCharset: site.captchaCharset ?? "",
    accounts: site.accounts ?? [],
  };
}

export async function getSites(refresh = false): Promise<SiteList> {
  if (cache && !refresh && Date.now() - cache.fetchedAt < SITES_TTL) {
    return cache;
  }
  const res = await callApi<Partial<Site>[]>("/api/get-form-fill-sites");
  if (res.status !== "ok") {
    throw new RequestError(res.msg, res.code);
  }
  cache = {sites: (res.data ?? []).map(normalize), full: res.data2 !== false, fetchedAt: Date.now()};
  return cache;
}

export async function getSiteOfPage(url: string): Promise<Site | null> {
  const {sites} = await getSites();
  return findSite(sites, url);
}

export async function getAccount(site: Site, username: string, url: string, captcha: boolean): Promise<Account> {
  const query = new URLSearchParams({application: site.application, username, url});
  // so that the audit record says the captcha of this sign-in was read by the extension
  if (captcha) {
    query.set("captcha", "true");
  }
  const res = await callApi<Account>(`/api/get-form-fill-account?${query}`);
  if (res.status !== "ok" || !res.data) {
    throw new RequestError(res.msg || "Casdoor gave no account", res.code);
  }
  return {username: res.data.username, password: res.data.password};
}

export async function saveAccount(site: Site, account: Account, url: string): Promise<void> {
  const res = await callApi<null>("/api/save-form-fill-account", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({application: site.application, username: account.username, password: account.password, url}),
  });
  if (res.status !== "ok") {
    throw new RequestError(res.msg, res.code);
  }
  clearSites();
}
