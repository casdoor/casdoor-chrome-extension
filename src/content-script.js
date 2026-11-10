// Copyright 2022 The Casdoor Authors. All Rights Reserved.
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

// Fills the sign-in form of a legacy system with the user's managed account, and offers to save the account that the
// user signs in with by hand. The page never sees the account: it is asked for only when the form is filled.

(() => {
  if (window.casdoorFormFillLoaded) {
    return;
  }
  window.casdoorFormFillLoaded = true;

  const isZh = (navigator.language || "").toLowerCase().startsWith("zh");
  const strings = isZh
    ? {
      filled: "Casdoor 已填入 {app} 的账号 {user}",
      switchAccount: "换成",
      retry: "上次自动登录后又回到了登录页，这次没有自动提交，请检查账号是否正确",
      failed: "Casdoor 代填失败：{error}",
      askSave: "把 {app} 的账号 {user} 保存到 Casdoor，下次自动登录？",
      save: "保存",
      skip: "不用了",
      saved: "已保存到 Casdoor",
      close: "关闭",
    }
    : {
      filled: "Casdoor filled in the account {user} of {app}",
      switchAccount: "Use",
      retry: "The last automatic sign-in came back to the sign-in page, so it was not submitted this time. Please check the account",
      failed: "Casdoor could not fill the form: {error}",
      askSave: "Save the account {user} of {app} to Casdoor and sign in automatically next time?",
      save: "Save",
      skip: "No thanks",
      saved: "Saved to Casdoor",
      close: "Close",
    };

  function format(text, values) {
    return text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          resolve(chrome.runtime.lastError ? null : response);
        });
      } catch (error) {
        // the extension was reloaded and this script is orphaned
        resolve(null);
      }
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(element) {
    if (!element || element.disabled || element.readOnly) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") {
      return false;
    }
    return element.getClientRects().length > 0;
  }

  function query(selector) {
    if (!selector) {
      return null;
    }
    try {
      return document.querySelector(selector);
    } catch (error) {
      return null;
    }
  }

  const usernameHints = /user|login|account|email|mail|phone|mobile|tel|name|uid|uname|loginid|工号|账号|帳號|用户|用戶|手机|邮箱/i;
  const submitHints = /^\s*(登\s*录|登\s*入|登\s*陆|log\s*in|sign\s*in|login|signin|submit|确\s*定|提\s*交|进入系统)\s*$/i;

  function findPassword(site) {
    const configured = query(site.passwordSelector);
    if (configured) {
      return configured;
    }
    return [...document.querySelectorAll("input[type=password]")].find(isVisible) || null;
  }

  function isTextInput(input) {
    const type = (input.getAttribute("type") || "text").toLowerCase();
    return ["text", "email", "tel", "number", ""].includes(type);
  }

  function findUsername(site, password) {
    const configured = query(site.usernameSelector);
    if (configured) {
      return configured;
    }
    const scope = (password && password.form) || document;
    const inputs = [...scope.querySelectorAll("input")].filter((input) => isTextInput(input) && isVisible(input));
    const before = password
      ? inputs.filter((input) => input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING)
      : inputs;
    const candidates = before.length > 0 ? before : inputs;
    const hinted = candidates.filter((input) => usernameHints.test(`${input.name} ${input.id} ${input.placeholder} ${input.getAttribute("autocomplete") || ""} ${input.getAttribute("aria-label") || ""}`));
    const list = hinted.length > 0 ? hinted : candidates;
    return list.length > 0 ? list[list.length - 1] : null;
  }

  function findSubmit(site, password) {
    const configured = query(site.submitSelector);
    if (configured) {
      return configured;
    }
    const form = password && password.form;
    if (form) {
      const button = [...form.querySelectorAll("button, input[type=submit], input[type=image]")].find((element) => {
        const type = (element.getAttribute("type") || "submit").toLowerCase();
        return isVisible(element) && (type === "submit" || type === "image");
      });
      if (button) {
        return button;
      }
    }
    const clickable = [...document.querySelectorAll("button, input[type=button], input[type=submit], a, [role=button], div[onclick], span[onclick]")];
    return clickable.find((element) => isVisible(element) && submitHints.test(element.value || element.textContent || "")) || null;
  }

  function setValue(input, value) {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.dispatchEvent(new Event("change", {bubbles: true}));
    input.dispatchEvent(new KeyboardEvent("keyup", {bubbles: true}));
    input.blur();
  }

  function pressEnter(input) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      input.dispatchEvent(new KeyboardEvent(type, {key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true}));
    }
    if (input.form) {
      input.form.requestSubmit();
    }
  }

  async function waitForPassword(site, timeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const password = findPassword(site);
      if (password && isVisible(password)) {
        return password;
      }
      await sleep(300);
    }
    return null;
  }

  // the notices live in a shadow root so that the page styles leave them alone
  let noticeHost = null;

  function showNotice(text, buttons = [], timeout = 8000) {
    if (noticeHost) {
      noticeHost.remove();
    }
    noticeHost = document.createElement("div");
    noticeHost.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;";
    const root = noticeHost.attachShadow({mode: "open"});
    const box = document.createElement("div");
    box.style.cssText = "max-width:360px;padding:12px 14px;border-radius:10px;background:#fff;color:#1f2328;box-shadow:0 6px 24px rgba(0,0,0,.18);font:14px/1.5 -apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;border:1px solid #e5e7eb;";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:600;font-size:12px;color:#5c6ac4;margin-bottom:4px;";
    title.textContent = "Casdoor";
    const body = document.createElement("div");
    body.textContent = text;
    box.append(title, body);
    if (buttons.length > 0) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;";
      buttons.forEach((item, index) => {
        const button = document.createElement("button");
        button.textContent = item.label;
        button.style.cssText = index === 0
          ? "border:0;border-radius:6px;padding:4px 12px;background:#5c6ac4;color:#fff;cursor:pointer;font:inherit;"
          : "border:1px solid #d0d7de;border-radius:6px;padding:4px 12px;background:#fff;color:#1f2328;cursor:pointer;font:inherit;";
        button.addEventListener("click", () => {
          noticeHost.remove();
          noticeHost = null;
          item.onClick();
        });
        row.append(button);
      });
      box.append(row);
    }
    root.append(box);
    document.documentElement.append(noticeHost);
    if (timeout > 0) {
      const host = noticeHost;
      setTimeout(() => host.remove(), timeout);
    }
  }

  async function fill(info, username) {
    const site = info.site;
    // a page of the system without a sign-in form, e.g. when the URLs end with "*"
    const password = await waitForPassword(site, 15000);
    if (!password) {
      return;
    }
    const usernameInput = findUsername(site, password);
    const account = await send({type: "getAccount", application: site.application, username, autoSubmit: site.autoSubmit});
    if (!account || account.error) {
      showNotice(format(strings.failed, {error: (account && account.error) || ""}));
      return;
    }
    if (usernameInput) {
      setValue(usernameInput, account.username);
    }
    setValue(password, account.password);

    const others = info.accounts.filter((item) => item !== account.username);
    const buttons = others.slice(0, 3).map((item) => ({label: `${strings.switchAccount} ${item}`, onClick: () => fill(info, item)}));
    if (info.recentlySubmitted && info.accounts.length > 0) {
      showNotice(strings.retry, buttons, 0);
      return;
    }
    showNotice(format(strings.filled, {app: site.displayName, user: account.username}), buttons);

    if (site.autoSubmit && !username) {
      await sleep(400);
      const submit = findSubmit(site, password);
      if (submit) {
        submit.click();
      } else {
        pressEnter(password);
      }
    }
  }

  // remembers the account typed into the sign-in form, to offer saving it once the user is signed in
  function watchCapture(site) {
    if (window.casdoorCaptureSite === site.application) {
      return;
    }
    window.casdoorCaptureSite = site.application;
    const grab = () => {
      const password = findPassword(site);
      if (!password || !password.value) {
        return;
      }
      const usernameInput = findUsername(site, password);
      const username = usernameInput ? usernameInput.value.trim() : "";
      if (!username) {
        return;
      }
      send({type: "capture", application: site.application, username, password: password.value});
      // a single-page app signs in without leaving the page
      setTimeout(checkPending, 3000);
    };
    document.addEventListener("submit", grab, true);
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("button, input[type=submit], input[type=button], a, [role=button]") : null;
      if (target) {
        grab();
      }
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
        grab();
      }
    }, true);
  }

  let pendingShown = false;

  async function checkPending() {
    if (pendingShown) {
      return;
    }
    const pending = await send({type: "getPending"});
    if (!pending) {
      return;
    }
    // still on a sign-in form: the password was wrong, or the page has not moved on yet
    const password = [...document.querySelectorAll("input[type=password]")].find(isVisible);
    if (password) {
      return;
    }
    pendingShown = true;
    showNotice(format(strings.askSave, {app: pending.displayName, user: pending.username}), [
      {
        label: strings.save,
        onClick: async() => {
          const res = await send({type: "resolvePending", save: true});
          showNotice(res && res.saved ? strings.saved : format(strings.failed, {error: (res && res.error) || ""}));
        },
      },
      {label: strings.skip, onClick: () => send({type: "resolvePending", save: false})},
    ], 0);
  }

  let checkedUrl = null;

  async function check() {
    if (checkedUrl === location.href) {
      return;
    }
    checkedUrl = location.href;
    checkPending();
    const info = await send({type: "getFill"});
    if (!info || !info.site) {
      return;
    }
    if (info.accounts.length > 0) {
      fill(info);
    } else if (info.canSave) {
      watchCapture(info.site);
    }
  }

  check();
  // single-page apps change the address without loading a page
  setInterval(check, 1000);
})();
