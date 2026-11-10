// Copyright 2026 The Casdoor Authors. All Rights Reserved.
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

// The sign-in page patterns of form autofill, matched the same way as Casdoor matches them (object/form_fill.go):
// the host has to be the same, "*.example.com" covers the subdomains, a path without "*" is a prefix, and the part
// after "#" is compared only when the pattern has it.

function splitFormFillUrl(value) {
  value = (value || "").trim();
  let scheme = "";
  const schemeMatch = value.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//);
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

function matchFormFillHost(pattern, host) {
  if (pattern === host) {
    return true;
  }
  if (pattern.startsWith("*.")) {
    return host.endsWith(pattern.slice(1));
  }
  return false;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchFormFillUrl(pattern, pageUrl) {
  pattern = (pattern || "").trim();
  if (!pattern) {
    return false;
  }
  const [patternScheme, patternHost, patternPath] = splitFormFillUrl(pattern);
  const [pageScheme, pageHost, fullPagePath] = splitFormFillUrl(pageUrl);
  if (pageScheme !== "http" && pageScheme !== "https") {
    return false;
  }
  if (patternScheme && patternScheme !== pageScheme) {
    return false;
  }
  if (!matchFormFillHost(patternHost, pageHost)) {
    return false;
  }
  // the fragment only counts when the pattern has one, like the "#/login" route of a single-page application
  const pagePath = patternPath.includes("#") ? fullPagePath : fullPagePath.split("#")[0];
  if (!patternPath.includes("*")) {
    return pagePath.startsWith(patternPath);
  }
  const expression = "^" + escapeRegex(patternPath).replace(/\\\*/g, ".*") + "$";
  return new RegExp(expression).test(pagePath);
}

function matchFormFillSite(site, pageUrl) {
  return (site.urls || []).some((pattern) => matchFormFillUrl(pattern, pageUrl));
}

// the sign-in URL of a managed account before form autofill, a regular expression
function matchLegacySigninUrl(pattern, pageUrl) {
  try {
    return new RegExp(pattern).test(pageUrl);
  } catch (error) {
    return false;
  }
}

if (typeof module !== "undefined") {
  module.exports = {matchFormFillUrl, matchFormFillSite, matchLegacySigninUrl};
}
