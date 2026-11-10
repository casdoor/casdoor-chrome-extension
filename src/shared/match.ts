// The sign-in pages of a system are matched the same way as Casdoor matches them (object/form_fill.go), so that the
// extension never asks for an account that Casdoor would refuse: the host has to be the same ("*.example.com" covers
// its subdomains), a path without "*" is a prefix, and the part after "#" counts only when the pattern has one.

import type {Site} from "./types";

function split(value: string): [scheme: string, host: string, rest: string] {
  value = value.trim();
  let scheme = "";
  const schemeMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.exec(value);
  if (schemeMatch) {
    scheme = schemeMatch[0].slice(0, -3).toLowerCase();
    value = value.slice(schemeMatch[0].length);
  }
  let host = value;
  let rest = "/";
  const index = value.search(/[/?#]/);
  if (index >= 0) {
    host = value.slice(0, index);
    rest = value.slice(index);
    if (!rest.startsWith("/")) {
      rest = "/" + rest;
    }
  }
  return [scheme, host.toLowerCase(), rest];
}

function matchHost(pattern: string, host: string): boolean {
  if (pattern === host) {
    return true;
  }
  return pattern.startsWith("*.") && host.endsWith(pattern.slice(1));
}

export function matchUrl(pattern: string, pageUrl: string): boolean {
  pattern = pattern.trim();
  if (!pattern) {
    return false;
  }
  const [patternScheme, patternHost, patternPath] = split(pattern);
  const [pageScheme, pageHost, fullPagePath] = split(pageUrl);
  if (pageScheme !== "http" && pageScheme !== "https") {
    return false;
  }
  if (patternScheme && patternScheme !== pageScheme) {
    return false;
  }
  if (!matchHost(patternHost, pageHost)) {
    return false;
  }
  const pagePath = patternPath.includes("#") ? fullPagePath : fullPagePath.split("#")[0];
  if (!patternPath.includes("*")) {
    return pagePath.startsWith(patternPath);
  }
  const expression = "^" + patternPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$";
  return new RegExp(expression).test(pagePath);
}

export function findSite(sites: Site[], pageUrl: string): Site | null {
  return sites.find((site) => site.urls.some((pattern) => matchUrl(pattern, pageUrl))) ?? null;
}

/** The page to open for a system: its first sign-in page without "*", with https when the pattern has no scheme */
export function getEntryUrl(site: Site): string {
  for (const pattern of site.urls) {
    if (pattern.includes("*")) {
      continue;
    }
    return /^https?:\/\//i.test(pattern) ? pattern : `https://${pattern}`;
  }
  return "";
}
