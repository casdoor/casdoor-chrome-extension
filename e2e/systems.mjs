// Four made-up legacy systems without single sign-on, for the end-to-end test and the demo video. Each one is a host
// of acme.test, which the browser maps to this server (--host-resolver-rules):
//   oa.acme.test   a server-side form that posts and redirects
//   crm.acme.test  a single-page app that renders its sign-in late, with no <form> and a <div> button
//   hr.acme.test   takes any account, for saving the account typed by hand
//   erp.acme.test  a sign-in page with an image captcha that the server checks
// Run: node e2e/systems.mjs [port]

import {randomBytes, randomInt} from "node:crypto";
import {createServer} from "node:http";
import {accounts, isMain} from "./acme.mjs";



const sessions = new Map();
// the demo video slows the sign-ins down, so that the filled form can be seen before the next page
let signInDelay = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stats = {erpRefusedCaptchas: 0, oaSignIns: 0};

function session(req, res) {
  const sid = /sid=(\w+)/.exec(req.headers.cookie ?? "")?.[1];
  if (sid && sessions.has(sid)) {
    return sessions.get(sid);
  }
  const id = randomBytes(12).toString("hex");
  const data = {id};
  sessions.set(id, data);
  res.setHeader("Set-Cookie", `sid=${id}; Path=/; HttpOnly; SameSite=Lax`);
  return data;
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

const escape = (value) => String(value).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);

const base = `
*{box-sizing:border-box} body{margin:0;font:15px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937;background:var(--bg)}
.shell{min-height:100vh;display:grid;place-items:center;padding:32px}
.box{width:380px;background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.12);padding:36px}
.mark{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:20px;background:var(--accent)}
h1{font-size:22px;margin:18px 0 4px} .sub{color:#6b7280;margin:0 0 24px}
label{display:block;font-size:13px;font-weight:600;color:#374151;margin:14px 0 6px}
input{width:100%;height:42px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;font:inherit}
input:focus{outline:2px solid var(--accent);border-color:transparent}
button,.btn{margin-top:22px;width:100%;height:44px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer;display:grid;place-items:center}
.error{margin-top:14px;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:14px}
.row{display:flex;gap:10px;align-items:center} .row input{flex:1} .row img{height:42px;border-radius:8px;border:1px solid #e5e7eb;cursor:pointer}
.top{height:64px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px;padding:0 28px}
.top .mark{width:32px;height:32px;font-size:15px;border-radius:9px}
.page{max-width:960px;margin:32px auto;padding:0 28px} .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px}
.card{background:#fff;border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06)} .card b{display:block;font-size:26px;margin-top:6px}
`;

function page(title, accent, bg, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>:root{--accent:${accent};--bg:${bg}}${base}</style></head><body>${body}</body></html>`;
}

function home(title, accent, bg, user, letter) {
  return page(
    title,
    accent,
    bg,
    `<div class="top"><div class="mark">${letter}</div><strong>${title}</strong><span style="margin-left:auto;color:#6b7280">Signed in as <b id="who">${escape(user)}</b></span></div>
     <div class="page"><h1>Good morning, ${escape(user)}</h1><p class="sub">Here is what is waiting for you today.</p>
     <div class="cards"><div class="card">Approvals<b>12</b></div><div class="card">Messages<b>5</b></div><div class="card">Tasks<b>8</b></div></div></div>`,
  );
}

function oaLogin(error = "") {
  return page(
    "Acme OA",
    "#2563eb",
    "linear-gradient(135deg,#dbeafe,#eff6ff)",
    `<div class="shell"><form class="box" method="post" action="/login"><div class="mark">O</div><h1>Acme OA</h1><p class="sub">Office automation, sign in with your OA account</p>
     <label for="username">Username</label><input id="username" name="username" autocomplete="username">
     <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password">
     <button type="submit">Sign in</button>${error ? `<div class="error">${error}</div>` : ""}</form></div>`,
  );
}

const crmApp = page(
  "Acme CRM",
  "#059669",
  "linear-gradient(135deg,#d1fae5,#ecfdf5)",
  `<div id="app"></div><script>
  const app = document.getElementById("app");
  function render() {
    if (location.hash.startsWith("#/dashboard")) {
      app.innerHTML = '<div class="top"><div class="mark">C</div><strong>Acme CRM</strong><span style="margin-left:auto;color:#6b7280">Signed in as <b id="who"></b></span></div><div class="page"><h1>Pipeline</h1><p class="sub">Your deals this quarter.</p><div class="cards"><div class="card">Open deals<b>24</b></div><div class="card">Won<b>9</b></div><div class="card">Forecast<b>$1.2M</b></div></div></div>';
      document.getElementById("who").textContent = sessionStorage.getItem("crmUser");
      return;
    }
    app.innerHTML = '<div class="shell"><div class="box"><p class="sub">Loading...</p></div></div>';
    // the sign-in renders late, like a single-page app that loads its bundle first
    setTimeout(() => {
      app.innerHTML = '<div class="shell"><div class="box"><div class="mark">C</div><h1>Acme CRM</h1><p class="sub">Customer relationships</p>' +
        '<label>Account</label><input id="crm-user" class="crm-input">' +
        '<label>Password</label><input id="crm-pass" class="crm-input" type="password">' +
        '<div class="btn crm-login-btn" role="button">Log in</div><div id="crm-error"></div></div></div>';
      document.querySelector(".crm-login-btn").addEventListener("click", async () => {
        const user = document.getElementById("crm-user").value, password = document.getElementById("crm-pass").value;
        const res = await fetch("/api/login", {method: "POST", body: JSON.stringify({user, password})});
        if (res.ok) { sessionStorage.setItem("crmUser", user); location.hash = "#/dashboard"; }
        else document.getElementById("crm-error").innerHTML = '<div class="error">Wrong account or password</div>';
      });
    }, 1200);
  }
  addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/login"; else render();
  </script>`,
);

function hrLogin() {
  return page(
    "Acme HR",
    "#d97706",
    "linear-gradient(135deg,#fef3c7,#fffbeb)",
    `<div class="shell"><form class="box" method="post" action="/login"><div class="mark">H</div><h1>Acme HR</h1><p class="sub">People, payroll and leave</p>
     <label for="hr-user">Employee ID</label><input id="hr-user" name="employee">
     <label for="hr-pass">Password</label><input id="hr-pass" name="password" type="password">
     <button type="submit">Sign in</button></form></div>`,
  );
}

function erpLogin(error = "") {
  return page(
    "Acme ERP",
    "#7c3aed",
    "linear-gradient(135deg,#ede9fe,#f5f3ff)",
    `<div class="shell"><form class="box" method="post"><div class="mark">E</div><h1>Acme ERP</h1><p class="sub">Finance and supply chain</p>
     <label for="erp-user">Username</label><input id="erp-user" name="user">
     <label for="erp-pass">Password</label><input id="erp-pass" name="pass" type="password">
     <label for="verifyCode">Verification code</label><div class="row"><input id="verifyCode" name="verifyCode" placeholder="4 digits" maxlength="4">
     <img id="captcha" src="/captcha.svg?${Date.now()}" width="120" height="42" alt="captcha" onclick="this.src='/captcha.svg?'+Date.now()"></div>
     <button type="submit">Sign in</button>${error ? `<div class="error">${error}</div>` : ""}</form></div>`,
  );
}

function captchaSvg(text) {
  const digits = [...text]
    .map((digit, i) => `<text x="${14 + i * 26}" y="${31 + randomInt(-3, 4)}" transform="rotate(${randomInt(-12, 13)} ${22 + i * 26} 24)" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#3b2a6b">${digit}</text>`)
    .join("");
  const lines = Array.from({length: 3}, () => `<line x1="${randomInt(0, 40)}" y1="${randomInt(5, 40)}" x2="${randomInt(80, 120)}" y2="${randomInt(5, 40)}" stroke="#b9a7f0" stroke-width="1.5"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="42" viewBox="0 0 120 42"><rect width="120" height="42" fill="#f4f1ff"/>${lines}${digits}</svg>`;
}

function send(res, status, body, type = "text/html; charset=utf-8") {
  res.writeHead(status, {"Content-Type": type, "Cache-Control": "no-store"});
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, {Location: location});
  res.end();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const system = url.hostname.endsWith(".acme.test") ? url.hostname.split(".")[0] : "";
  const s = session(req, res);
  const form = req.method === "POST" && !url.pathname.startsWith("/api/") ? new URLSearchParams(await readBody(req)) : null;

  switch (`${req.method} ${system} ${url.pathname}`) {
    case "GET oa /":
    case "GET oa /login":
      return send(res, 200, oaLogin());
    case "POST oa /login":
      stats.oaSignIns++;
      await sleep(signInDelay);
      if (accounts.oa[form.get("username")] === form.get("password")) {
        s.oa = form.get("username");
        return redirect(res, "/home");
      }
      return send(res, 200, oaLogin("Incorrect username or password"));
    case "GET oa /home":
      return s.oa ? send(res, 200, home("Acme OA", "#2563eb", "#f1f5f9", s.oa, "O")) : redirect(res, "/login");
    case "GET crm /":
      return send(res, 200, crmApp);
    case "POST crm /api/login": {
      const {user, password} = JSON.parse(await readBody(req));
      return send(res, accounts.crm[user] === password ? 200 : 401, "{}", "application/json");
    }
    case "GET hr /":
    case "GET hr /login":
      return send(res, 200, hrLogin());
    case "POST hr /login":
      s.hr = form.get("employee");
      return redirect(res, "/home");
    case "GET hr /home":
      return s.hr ? send(res, 200, home("Acme HR", "#d97706", "#fffbeb", s.hr, "H")) : redirect(res, "/login");
    case "GET erp /":
    case "GET erp /login":
      return send(res, 200, erpLogin());
    case "GET erp /captcha.svg":
      s.captcha = String(randomInt(1000, 10000));
      return send(res, 200, captchaSvg(s.captcha), "image/svg+xml");
    case "POST erp /login": {
      await sleep(signInDelay);
      // ?refuseFirst refuses the first captcha whatever it is, to test reading a new one
      const refuse = url.searchParams.has("refuseFirst") && !s.refusedOnce;
      if (refuse || form.get("verifyCode") !== s.captcha) {
        s.refusedOnce = true;
        stats.erpRefusedCaptchas++;
        return send(res, 200, erpLogin("The verification code is incorrect"));
      }
      if (accounts.erp[form.get("user")] !== form.get("pass")) {
        return send(res, 200, erpLogin("Wrong password"));
      }
      s.erp = form.get("user");
      return redirect(res, "/home");
    }
    case "GET erp /home":
      return s.erp ? send(res, 200, home("Acme ERP", "#7c3aed", "#f5f3ff", s.erp, "E")) : redirect(res, "/login");
    case "GET  /stats":
      return send(res, 200, JSON.stringify(stats), "application/json");
    default:
      return send(res, 404, "Not found", "text/plain");
  }
});

export function startSystems(port, options = {}) {
  signInDelay = options.signInDelay ?? 0;
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (isMain(import.meta)) {
  const port = Number(process.argv[2] ?? 18200);
  await startSystems(port);
  console.log(`Acme systems on http://127.0.0.1:${port}, map *.acme.test to it`);
}
