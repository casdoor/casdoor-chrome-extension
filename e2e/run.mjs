// End-to-end test of the extension against a real Casdoor with an enterprise license and the made-up systems of Acme.
//   1. Start a Casdoor that answers on CASDOOR_URL (default http://localhost:18100) with origin http://door.acme.test
//   2. CASDOOR_ADMIN_PASSWORD=... node e2e/setup.mjs
//   3. node scripts/build.mjs --e2e && node e2e/run.mjs
// The browser maps door.acme.test to Casdoor and the other hosts of acme.test to e2e/systems.mjs. The extension is
// loaded with the key of the Chrome Web Store, so it has the same ID and Casdoor accepts its redirect URL as it is.

import {cp, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {chromium} from "playwright";
import {accounts, alice} from "./acme.mjs";
import {setup} from "./setup.mjs";
import {startSystems} from "./systems.mjs";

export const STORE_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwl8NNBVpojU9JGUsZ1VUyZmBqRG2Jy9TdYGXJZPGHTVLD2YHZkBt9gv22eZZdAG1u3vif8KFRgdc5ljSoRLB4w6F3XlOFAdJp48eJ991yCSciT6dRpPMDPr7LLxgy01ZUHlYeHN4yAnloWo9MFBNK9fPZaGyEu3MNa6pJTGzxE2qqEIuJedFeylEE7w87i8QnNRlwJBrGxaAyeSTVPr9q22zXI8Lx4Ld1FT05vc2lSpAhPhuRsjpidvwH3OWn4wIFIz7hrNyQh9pE6n1VMmPxEPUueGNJ2o+DJR7E8BwnkCLEG4nWgQYzTCtMhsWWuauAUhbeim6MPT4h/DrFzdmtQIDAQAB";
export const STORE_ID = "bnjbegmkpjbcpneclidlbloadenondlm";

const casdoorUrl = process.env.CASDOOR_URL ?? "http://localhost:18100";
const systemsPort = Number(process.env.SYSTEMS_PORT ?? 18200);

/** A copy of the build with the store's key, so that it gets the ID of the extension from the Chrome Web Store */
export async function prepareExtension(build) {
  const dir = await mkdtemp(join(tmpdir(), "casdoor-extension-"));
  await cp(resolve(build), dir, {recursive: true});
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  await writeFile(join(dir, "manifest.json"), JSON.stringify({...manifest, key: STORE_KEY}, null, 2));
  return dir;
}

export async function launch(extension, options = {}) {
  const casdoorHost = new URL(casdoorUrl).host;
  const userData = await mkdtemp(join(tmpdir(), "casdoor-profile-"));
  const context = await chromium.launchPersistentContext(userData, {
    // the headless shell has no extensions, the new headless mode of Chromium has
    channel: "chromium",
    headless: options.headless ?? true,
    viewport: options.viewport ?? {width: 1280, height: 800},
    locale: options.locale ?? "en-US",
    recordVideo: options.recordVideo,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      `--host-resolver-rules=MAP door.acme.test ${casdoorHost}, MAP *.acme.test 127.0.0.1:${systemsPort}`,
      "--no-proxy-server",
      ...(options.args ?? []),
    ],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  return {context, worker, extensionId: new URL(worker.url()).host, userData};
}

/** Signs in to the extension from its popup, opened in a tab, through Casdoor's sign-in window */
export async function signIn(context, extensionId, {slowly = 0} = {}) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await popup.getByLabel(/Casdoor server URL/).pressSequentially("http://door.acme.test", {delay: slowly});
  await popup.getByLabel(/^Application/).pressSequentially("app-acme", {delay: slowly});
  const authWindow = context.waitForEvent("page");
  await popup.getByRole("button", {name: "Sign in with Casdoor"}).click();
  const auth = await authWindow;
  await auth.getByPlaceholder(/username/i).pressSequentially(alice.name, {delay: slowly});
  await auth.locator("input[type=password]").pressSequentially(alice.password, {delay: slowly});
  await auth.getByRole("button", {name: "Sign In"}).click();
  await popup.getByText(alice.displayName).waitFor({timeout: 20000});
  return popup;
}

/** The text of the card the extension shows on a page */
export async function cardText(page) {
  const card = page.locator("casdoor-autofill section").last();
  await card.waitFor({timeout: 15000});
  return card.innerText();
}

const results = [];

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({name, ok: true});
    console.log(`  ok    ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({name, ok: false});
    console.log(`  FAIL  ${name}\n        ${String(error?.message ?? error).split("\n").slice(0, 4).join("\n        ")}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function adminApi(path, body) {
  let cookie = "";
  const login = await fetch(`${casdoorUrl}/api/login`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({application: "app-built-in", organization: "built-in", username: "admin", password: process.env.CASDOOR_ADMIN_PASSWORD, type: "login"}),
  });
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const response = await fetch(`${casdoorUrl}${path}`, {method: body ? "POST" : "GET", headers: {Cookie: cookie, "Content-Type": "application/json"}, body: body && JSON.stringify(body)});
  return (await response.json()).data;
}

async function main() {
  await setup();
  const systems = await startSystems(systemsPort);
  const extension = await prepareExtension("dist-e2e");
  const {context, worker, extensionId, userData} = await launch(extension);
  console.log(`Extension ${extensionId}, Casdoor ${casdoorUrl}, systems on ${systemsPort}`);

  try {
    await step("loads with the ID of the Chrome Web Store", async () => {
      assert(extensionId === STORE_ID, `the ID is ${extensionId}`);
    });

    await step("is not filled before signing in", async () => {
      const page = await context.newPage();
      await page.goto("http://oa.acme.test/login");
      await page.waitForTimeout(2500);
      assert((await page.inputValue("#password")) === "", "the password was filled");
      await page.close();
    });

    let popup;
    await step("signs in with the authorization code flow and PKCE", async () => {
      popup = await signIn(context, extensionId);
      const session = await worker.evaluate(() => chrome.storage.local.get("session").then((data) => data.session));
      assert(session?.refreshToken, "no refresh token");
      assert(session.user.name === alice.name, `signed in as ${session.user.name}`);
    });

    await step("lists the systems in the popup", async () => {
      for (const name of ["Acme OA", "Acme CRM", "Acme HR", "Acme ERP"]) {
        await popup.getByText(name, {exact: true}).waitFor({timeout: 5000});
      }
      assert(await popup.getByText("2 accounts").isVisible(), "the two CRM accounts are not shown");
    });

    await step("OA: fills the form and signs in", async () => {
      const page = await context.newPage();
      await page.goto("http://oa.acme.test/login");
      await page.waitForURL("http://oa.acme.test/home", {timeout: 15000});
      assert((await page.locator("#who").innerText()) === "alice", "signed in as someone else");
      await step("OA: a sign-in page that comes back within 30 seconds is filled but not submitted", async () => {
        await page.goto("http://oa.acme.test/login");
        const text = await cardText(page);
        assert(/Filled, not signed in/.test(text), text);
        assert((await page.inputValue("#password")) === accounts.oa.alice, "the password was not filled");
        await page.waitForTimeout(1500);
        assert(page.url() === "http://oa.acme.test/login", "it was submitted again");
      });
      await page.close();
    });

    await step("OA: a wrong password is not tried again", async () => {
      const user = await adminApi("/api/get-user?id=acme/alice");
      const real = user.managedAccounts.find((account) => account.application === "acme-oa").password;
      const withPassword = (password) => ({...user, managedAccounts: user.managedAccounts.map((account) => (account.application === "acme-oa" ? {...account, password} : account))});
      await adminApi("/api/update-user?id=acme/alice", withPassword("Wrong-Password"));
      await context.clearCookies();
      const before = (await (await fetch(`http://127.0.0.1:${systemsPort}/stats`)).json()).oaSignIns;
      const page = await context.newPage();
      try {
        await page.goto("http://oa.acme.test/login");
        await page.locator("casdoor-autofill").getByText(/refused the sign-in/).waitFor({timeout: 15000});
        await page.waitForTimeout(3000);
        const after = (await (await fetch(`http://127.0.0.1:${systemsPort}/stats`)).json()).oaSignIns;
        assert(after - before === 1, `signed in ${after - before} times`);
      } finally {
        await adminApi("/api/update-user?id=acme/alice", withPassword(real === "***" ? accounts.oa.alice : real));
        await page.close();
      }
    });

    await step("a page of another host with the same form gets nothing", async () => {
      const page = await context.newPage();
      await page.route("http://phish.acme.test/login", (route) => route.fulfill({contentType: "text/html", body: '<form><input name="username"><input id="password" type="password"><button>Sign in</button></form>'}));
      await page.goto("http://phish.acme.test/login");
      await page.waitForTimeout(3000);
      assert((await page.inputValue("#password")) === "", "the password was filled into another host");
      await page.close();
    });

    await step("Casdoor refuses an account for a page that is not a sign-in page of the system", async () => {
      const {session} = await worker.evaluate(() => chrome.storage.local.get("session"));
      const response = await fetch(`${casdoorUrl}/api/get-form-fill-account?application=acme-oa&url=${encodeURIComponent("http://phish.acme.test/login")}`, {headers: {Authorization: `Bearer ${session.accessToken}`}});
      const res = await response.json();
      assert(res.status === "error", "Casdoor handed out the account");
      assert(response.headers.get("cache-control") === "no-store", "the account response may be cached");
    });

    await step("CRM: a late single-page app with two accounts asks which one, then signs in", async () => {
      const page = await context.newPage();
      await page.goto("http://crm.acme.test/");
      const text = await cardText(page);
      assert(/Sign in to Acme CRM as/.test(text), text);
      await page.locator("casdoor-autofill").getByRole("button", {name: "alice.sales"}).click();
      await page.waitForURL(/#\/dashboard/, {timeout: 10000});
      assert((await page.locator("#who").innerText()) === "alice.sales", "signed in as the wrong account");
      await page.close();
    });

    await step("CRM: the account picked last time is used without asking", async () => {
      const page = await context.newPage();
      await page.goto("http://crm.acme.test/");
      await page.waitForURL(/#\/dashboard/, {timeout: 10000});
      assert((await page.locator("#who").innerText()) === "alice.sales", "used another account");
      await page.close();
    });

    await step("ERP: reads the image captcha and signs in", async () => {
      const page = await context.newPage();
      await page.goto("http://erp.acme.test/login");
      await page.waitForURL("http://erp.acme.test/home", {timeout: 20000});
      await page.close();
    });

    await step("ERP: reads a new captcha after one is refused", async () => {
      await context.clearCookies();
      const before = await (await fetch(`http://127.0.0.1:${systemsPort}/stats`)).json();
      const page = await context.newPage();
      await page.goto("http://erp.acme.test/login?refuseFirst");
      await page.waitForURL("http://erp.acme.test/home", {timeout: 30000});
      const after = await (await fetch(`http://127.0.0.1:${systemsPort}/stats`)).json();
      assert(after.erpRefusedCaptchas > before.erpRefusedCaptchas, "the first captcha was not refused");
      await page.close();
    });

    await step("HR: offers to save the account typed by hand and saves it to Casdoor", async () => {
      const page = await context.newPage();
      await page.goto("http://hr.acme.test/login");
      await page.waitForTimeout(1500);
      await page.fill("#hr-user", "E1024");
      await page.fill("#hr-pass", "Hr-Typed-2026");
      await page.click("button[type=submit]");
      await page.waitForURL("http://hr.acme.test/home");
      const text = await cardText(page);
      assert(/Save your Acme HR account to Casdoor/.test(text), text);
      await page.locator("casdoor-autofill").getByRole("button", {name: "Save"}).click();
      await page.locator("casdoor-autofill").getByText("Saved to Casdoor").waitFor({timeout: 10000});
      const user = await adminApi("/api/get-user?id=acme/alice");
      assert(user.managedAccounts.some((account) => account.application === "acme-hr" && account.username === "E1024"), "not in Casdoor");
      await page.close();
    });

    await step("HR: the saved account is filled next time", async () => {
      await popup.reload();
      await popup.getByRole("button", {name: "Refresh"}).click();
      const page = await context.newPage();
      await page.goto("http://hr.acme.test/login");
      const text = await cardText(page);
      assert(/Filled Acme HR/.test(text), text);
      assert((await page.inputValue("#hr-user")) === "E1024", "the username was not filled");
      await page.close();
    });

    await step("refreshes an expired access token with the refresh token", async () => {
      const before = await worker.evaluate(async () => {
        const {session} = await chrome.storage.local.get("session");
        await chrome.storage.local.set({session: {...session, expiresAt: Date.now() - 1000}});
        return session.accessToken;
      });
      await popup.reload();
      await popup.getByText(alice.displayName).waitFor({timeout: 10000});
      await popup.getByText("Acme OA", {exact: true}).waitFor({timeout: 10000});
      const after = await worker.evaluate(() => chrome.storage.local.get("session").then((data) => data.session));
      assert(after && after.accessToken !== before, "the token was not refreshed");
      assert(after.expiresAt > Date.now(), "the new token is expired");
    });

    await step("autofill off: nothing is filled", async () => {
      await popup.getByRole("switch").click();
      await popup.getByText(/Off, use Fill now/).waitFor();
      await context.clearCookies();
      const page = await context.newPage();
      await page.goto("http://oa.acme.test/login");
      await page.waitForTimeout(2500);
      assert((await page.inputValue("#password")) === "", "filled with autofill off");
      await step("autofill off: Fill now from the popup fills the page", async () => {
        const tabId = await worker.evaluate(async () => (await chrome.tabs.query({url: "http://oa.acme.test/*"}))[0].id);
        await worker.evaluate((id) => chrome.tabs.sendMessage(id, {type: "content/fill"}), tabId);
        await page.waitForURL("http://oa.acme.test/home", {timeout: 10000});
      });
      await popup.getByRole("switch").click();
      await page.close();
    });

    await step("signing out revokes the tokens and stops filling", async () => {
      const {session} = await worker.evaluate(() => chrome.storage.local.get("session"));
      await popup.getByRole("button", {name: "Sign out"}).click();
      await popup.getByRole("button", {name: "Sign in with Casdoor"}).waitFor();
      const response = await fetch(`${casdoorUrl}/api/get-account`, {headers: {Authorization: `Bearer ${session.accessToken}`}});
      const res = await response.json();
      assert(res.status !== "ok", "the access token still works");
      await context.clearCookies();
      const page = await context.newPage();
      await page.goto("http://oa.acme.test/login");
      await page.waitForTimeout(2500);
      assert((await page.inputValue("#password")) === "", "filled after signing out");
      await page.close();
    });
  } finally {
    await context.close();
    systems.close();
    await rm(extension, {recursive: true, force: true});
    await rm(userData, {recursive: true, force: true}).catch(() => undefined);
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith("run.mjs")) {
  await main();
}
