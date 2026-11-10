// Puts the made-up company Acme into a local Casdoor with an enterprise license: the organization, the user alice with
// her managed accounts, the application she signs in to the extension with, and the four systems with form autofill.
// It replaces what an earlier run put there, so it can run again.
// Run: CASDOOR_URL=http://localhost:18100 CASDOOR_ADMIN_PASSWORD=... node e2e/setup.mjs

import {randomBytes} from "node:crypto";
import {accounts, alice, isMain} from "./acme.mjs";

const casdoor = process.env.CASDOOR_URL ?? "http://localhost:18100";
const adminPassword = process.env.CASDOOR_ADMIN_PASSWORD;

let cookie = "";

async function api(path, body) {
  const response = await fetch(`${casdoor}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {"Content-Type": "application/json", Cookie: cookie},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    cookie = setCookie.split(";")[0];
  }
  const res = await response.json();
  if (res.status !== "ok") {
    throw new Error(`${path}: ${res.msg}`);
  }
  return res.data;
}

const logo = (letter, color) =>
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="${color}"/><text x="32" y="43" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#fff">${letter}</text></svg>`);

const systems = [
  {name: "acme-oa", displayName: "Acme OA", logo: logo("O", "#2563eb"), formFill: {urls: ["http://oa.acme.test/login"], autoSubmit: true}},
  {
    name: "acme-crm",
    displayName: "Acme CRM",
    logo: logo("C", "#059669"),
    formFill: {urls: ["http://crm.acme.test/#/login"], usernameSelector: "#crm-user", passwordSelector: "#crm-pass", submitSelector: "crm-login-btn", autoSubmit: true},
  },
  {name: "acme-hr", displayName: "Acme HR", logo: logo("H", "#d97706"), formFill: {urls: ["http://hr.acme.test/login"], autoSubmit: false, allowSave: true}},
  {name: "acme-erp", displayName: "Acme ERP", logo: logo("E", "#7c3aed"), formFill: {urls: ["http://erp.acme.test/login"], autoSubmit: true, captcha: true}},
];

export async function setup() {
  if (!adminPassword) {
    throw new Error("Set CASDOOR_ADMIN_PASSWORD to the password of the admin of the local Casdoor");
  }
  await api("/api/login", {application: "app-built-in", organization: "built-in", username: "admin", password: adminPassword, type: "login", autoSignin: false});

  const builtIn = await api("/api/get-organization?id=admin/built-in");
  if (!(await api("/api/get-organization?id=admin/acme"))) {
    await api("/api/add-organization", {
      ...builtIn,
      name: "acme",
      displayName: "Acme Inc.",
      createdTime: new Date().toISOString(),
      logo: logo("A", "#111827"),
      websiteUrl: "http://oa.acme.test",
      passwordType: "bcrypt",
      accountItems: builtIn.accountItems,
    });
  }

  const template = await api("/api/get-application?id=admin/app-built-in");
  const application = (name, values) => ({
    ...template,
    owner: "admin",
    name,
    organization: "acme",
    createdTime: new Date().toISOString(),
    clientId: randomBytes(10).toString("hex"),
    clientSecret: randomBytes(20).toString("hex"),
    redirectUris: [],
    providers: [],
    signupItems: template.signupItems,
    enableSignUp: false,
    cert: template.cert,
    ...values,
  });
  for (const name of ["app-acme", ...systems.map((system) => system.name)]) {
    const existing = await api(`/api/get-application?id=admin/${name}`);
    if (existing) {
      await api("/api/delete-application", existing);
    }
  }
  await api("/api/add-application", application("app-acme", {displayName: "Acme", logo: logo("A", "#111827"), grantTypes: ["authorization_code", "refresh_token"]}));
  for (const system of systems) {
    await api(
      "/api/add-application",
      application(system.name, {
        displayName: system.displayName,
        logo: system.logo,
        formFill: {enabled: true, usernameSelector: "", passwordSelector: "", submitSelector: "", allowSave: false, captcha: false, captchaSelector: "", captchaImageSelector: "", captchaCharset: "", programs: [], ...system.formFill},
      }),
    );
  }

  const existingUser = await api(`/api/get-user?id=acme/${alice.name}`).catch(() => null);
  if (existingUser) {
    await api("/api/delete-user", existingUser);
  }
  await api("/api/add-user", {
    owner: "acme",
    name: alice.name,
    createdTime: new Date().toISOString(),
    displayName: alice.displayName,
    email: "alice@acme.test",
    password: alice.password,
    type: "normal-user",
    signupApplication: "app-acme",
    managedAccounts: [
      {application: "acme-oa", username: "alice", password: accounts.oa.alice},
      {application: "acme-crm", username: "alice", password: accounts.crm.alice},
      {application: "acme-crm", username: "alice.sales", password: accounts.crm["alice.sales"]},
      {application: "acme-erp", username: "alice", password: accounts.erp.alice},
    ],
  });
  console.log(`Acme is set up in ${casdoor}, alice signs in to the extension with the application app-acme`);
}

if (isMain(import.meta)) {
  await setup();
}
