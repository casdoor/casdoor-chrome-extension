/// <reference types="node" />
import assert from "node:assert/strict";
import {test} from "node:test";
import {findSite, getEntryUrl, matchUrl} from "../src/shared/match.ts";
import type {Site} from "../src/shared/types.ts";

test("a path without * is a prefix", () => {
  assert.ok(matchUrl("https://oa.example.com/login", "https://oa.example.com/login?next=/"));
  assert.ok(matchUrl("oa.example.com/login", "http://oa.example.com/login.jsp"));
  assert.ok(!matchUrl("https://oa.example.com/login", "https://oa.example.com/home"));
});

test("the host has to be the same", () => {
  assert.ok(!matchUrl("https://oa.example.com/login", "https://oa.example.com.evil.test/login"));
  assert.ok(!matchUrl("https://oa.example.com/login", "https://evil.test/?https://oa.example.com/login"));
  assert.ok(!matchUrl("https://oa.example.com:8080/", "https://oa.example.com/"));
  assert.ok(matchUrl("*.example.com/login", "https://hr.example.com/login"));
  assert.ok(!matchUrl("*.example.com/login", "https://example.com.evil.test/login"));
});

test("the scheme counts only when the pattern has one", () => {
  assert.ok(!matchUrl("https://oa.example.com/", "http://oa.example.com/"));
  assert.ok(!matchUrl("oa.example.com/", "ftp://oa.example.com/"));
});

test("* matches anything and the fragment counts only when the pattern has one", () => {
  assert.ok(matchUrl("https://crm.example.com/*/signin", "https://crm.example.com/app/signin"));
  assert.ok(!matchUrl("https://crm.example.com/*/signin", "https://crm.example.com/app/signin/extra"));
  assert.ok(matchUrl("https://spa.example.com/#/login", "https://spa.example.com/#/login?r=1"));
  assert.ok(!matchUrl("https://spa.example.com/#/login", "https://spa.example.com/#/home"));
  assert.ok(matchUrl("https://spa.example.com/", "https://spa.example.com/#/anything"));
});

const site = (application: string, urls: string[]) => ({application, urls}) as Site;

test("findSite and getEntryUrl", () => {
  const sites = [site("oa", ["https://oa.example.com/login"]), site("hr", ["*.hr.example.com/*", "hr.example.com/signin"])];
  assert.equal(findSite(sites, "https://oa.example.com/login")?.application, "oa");
  assert.equal(findSite(sites, "https://x.hr.example.com/a")?.application, "hr");
  assert.equal(findSite(sites, "https://other.example.com/"), null);
  assert.equal(getEntryUrl(sites[1]), "https://hr.example.com/signin");
});
