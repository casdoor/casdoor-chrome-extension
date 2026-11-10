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
      missingSelector: "管理员配置的{field}选择器“{selector}”在这个页面上没有找到，已改用自动识别",
      usernameField: "用户名输入框",
      passwordField: "密码输入框",
      submitField: "登录按钮",
      captchaField: "验证码输入框",
      captchaImageField: "验证码图片",
      captchaNoInput: "没有找到验证码输入框",
      captchaNoImage: "没有找到验证码图片",
      captchaCrossOrigin: "验证码图片来自其他网站，插件读不到",
      captchaUnread: "没有认出验证码",
      captchaManual: "验证码请手动输入（{error}）",
      captchaGaveUp: "验证码自动识别了 {n} 次都没有通过，请手动输入后登录",
      signInRefused: "登录没有成功，可能是账号或密码不对，请检查托管账户",
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
      missingSelector: "The {field} selector \"{selector}\" set by the admin matches nothing on this page, so it was found automatically",
      usernameField: "username input",
      passwordField: "password input",
      submitField: "sign-in button",
      captchaField: "captcha input",
      captchaImageField: "captcha image",
      captchaNoInput: "no captcha input was found",
      captchaNoImage: "no captcha image was found",
      captchaCrossOrigin: "the captcha image comes from another site, the extension can't read it",
      captchaUnread: "the captcha could not be read",
      captchaManual: "Please type the captcha ({error})",
      captchaGaveUp: "The captcha was read {n} times without success, please type it and sign in",
      signInRefused: "The sign-in failed, the username or the password may be wrong. Please check the managed account",
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

  // a class attribute pasted as it is, like "el-button login-btn el-button--primary", is taken as those classes
  function selectorCandidates(selector) {
    const value = selector.trim();
    const candidates = [value];
    if (/^[\w-]+(\s+[\w-]+)*$/.test(value)) {
      candidates.push("." + value.split(/\s+/).join("."));
    }
    return candidates;
  }

  function query(selector) {
    if (!selector || !selector.trim()) {
      return null;
    }
    for (const candidate of selectorCandidates(selector)) {
      try {
        const element = document.querySelector(candidate);
        if (element) {
          return element;
        }
      } catch (error) {
        // not a valid selector, try the next way of reading it
      }
    }
    return null;
  }

  const usernameHints = /user|login|account|email|mail|phone|mobile|tel|name|uid|uname|loginid|工号|账号|帳號|用户|用戶|手机|邮箱/i;
  // "登录", "登录系统", "立即登录", "Sign in", ...
  const submitHints = /^\s*(?:(?:立即|马上|安全|用户|账号)?\s*(?:登\s*录|登\s*入|登\s*陆)\s*(?:系统|平台)?|进入系统|log\s*in|log\s*on|sign\s*in|login|logon|signin|submit|确\s*定|提\s*交)\s*$/i;

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
    // buttons first, so that a link or a tab with the same words loses to the real button
    for (const selector of ["button, input[type=button], input[type=submit]", "[role=button]", "a, div[onclick], span[onclick]"]) {
      const found = [...document.querySelectorAll(selector)].find((element) => isVisible(element) && submitHints.test(element.value || element.textContent || ""));
      if (found) {
        return found;
      }
    }
    return null;
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
    // a single-page app (Vue, React, ...) signs in from its own Enter handler, submitting its <form> would only reload
    // the page; a server-side form says where it goes
    const form = input.form;
    if (form && (form.hasAttribute("action") || form.hasAttribute("method"))) {
      form.requestSubmit();
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
    body.style.whiteSpace = "pre-line";
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

  // captchas

  const captchaInputHints = /验证码|校验码|captcha|verif|vcode|checkcode|check_code|yzm|randcode|validcode|valicode|imgcode|authcode|securitycode|kaptcha/i;
  const captchaImageHints = /验证码|captcha|verif|vcode|checkcode|kaptcha|yzm|randcode|validcode|valicode|imgcode|authcode|code/i;
  const captchaErrorHints = /(验证码|校验码|captcha|verification code|security code).{0,12}(错|不正确|不对|有误|无效|失效|过期|incorrect|invalid|wrong|expired)|(错误|不正确|无效|incorrect|invalid|wrong).{0,6}(验证码|captcha)/i;
  const passwordErrorHints = /(密码|口令|账号|用户名|用户|password|username|account).{0,12}(错|不正确|不对|有误|不存在|锁定|incorrect|invalid|wrong|locked)/i;
  const MAX_CAPTCHA_TRIES = 3;

  function isShown(element) {
    if (!element || !element.isConnected) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none" && element.getClientRects().length > 0;
  }

  function findCaptchaInput(site, usernameInput, password) {
    const configured = query(site.captchaSelector);
    if (configured) {
      return configured;
    }
    const inputs = [...document.querySelectorAll("input")].filter((input) => isTextInput(input) && isVisible(input) && input !== usernameInput && input !== password);
    return inputs.find((input) => captchaInputHints.test(`${input.name} ${input.id} ${input.placeholder} ${input.className} ${input.getAttribute("aria-label") || ""} ${input.getAttribute("autocomplete") || ""}`) ||
      /(^|[^a-z])code([^a-z]|$)/i.test(`${input.name} ${input.id}`)) || null;
  }

  function center(element) {
    const rect = element.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  }

  // the captcha picture: the one the admin set, or an image or canvas of a captcha's size, the hinted and closest first
  function findCaptchaImage(site, input) {
    const configured = query(site.captchaImageSelector);
    if (configured) {
      return configured;
    }
    const [x, y] = center(input);
    const candidates = [...document.querySelectorAll("img, canvas")].filter((element) => {
      if (!isShown(element)) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width >= 40 && rect.width <= 320 && rect.height >= 15 && rect.height <= 120;
    }).map((element) => {
      const [cx, cy] = center(element);
      const hinted = captchaImageHints.test(`${element.getAttribute("src") || ""} ${element.id} ${element.className} ${element.getAttribute("alt") || ""} ${element.getAttribute("title") || ""}`);
      return {element, score: Math.hypot(cx - x, cy - y) - (hinted ? 10000 : 0)};
    });
    candidates.sort((a, b) => a.score - b.score);
    return candidates.length > 0 ? candidates[0].element : null;
  }

  function waitForImage(image, timeout) {
    if (!(image instanceof HTMLImageElement) || (image.complete && image.naturalWidth > 0)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => resolve();
      image.addEventListener("load", done, {once: true});
      image.addEventListener("error", done, {once: true});
      setTimeout(done, timeout);
    });
  }

  // the picture as it is on the page; loading its address again would give a new captcha
  async function readCaptchaImage(image) {
    if (image instanceof HTMLCanvasElement) {
      return image.toDataURL("image/png");
    }
    if (!(image instanceof HTMLImageElement)) {
      throw new Error(strings.captchaNoImage);
    }
    await waitForImage(image, 3000);
    if (!image.naturalWidth) {
      throw new Error(strings.captchaNoImage);
    }
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    try {
      return canvas.toDataURL("image/png");
    } catch (error) {
      // an image of another site without CORS taints the canvas
      throw new Error(strings.captchaCrossOrigin);
    }
  }

  function captchaCharset(site, input) {
    if (site.captchaCharset) {
      return site.captchaCharset;
    }
    const label = input.closest("label, .el-form-item, .ant-form-item, .form-group, tr, li");
    const text = `${input.placeholder} ${input.getAttribute("aria-label") || ""} ${input.title} ${label ? label.textContent : ""}`;
    return /数字|digit|number/i.test(text) ? "Digits" : "Alphanumeric";
  }

  async function solveCaptcha(site, input) {
    const image = findCaptchaImage(site, input);
    if (!image) {
      throw new Error(strings.captchaNoImage);
    }
    const data = await readCaptchaImage(image);
    const res = await send({type: "recognizeCaptcha", application: site.application, image: data, charset: captchaCharset(site, input)});
    if (!res || res.error || !res.text) {
      throw new Error((res && res.error) || strings.captchaUnread);
    }
    let text = res.text;
    if (input.maxLength > 0 && text.length > input.maxLength) {
      text = text.slice(0, input.maxLength);
    }
    setValue(input, text);
    return {data};
  }

  // a new captcha: most sign-in pages change it when the picture is clicked, some already did on the failed sign-in
  async function refreshCaptcha(site, input, before) {
    const image = findCaptchaImage(site, input);
    if (!image) {
      return;
    }
    const current = await readCaptchaImage(image).catch(() => "");
    if (current && current !== before.data) {
      return;
    }
    image.click();
    for (let i = 0; i < 15; i++) {
      await sleep(200);
      const latest = findCaptchaImage(site, input);
      if (latest) {
        await waitForImage(latest, 1000);
        const data = await readCaptchaImage(latest).catch(() => "");
        if (data && data !== before.data) {
          return;
        }
      }
    }
  }

  function submitForm(site, password) {
    const submit = findSubmit(site, password);
    if (submit) {
      submit.click();
    } else {
      pressEnter(password);
    }
  }

  // After submitting with a recognized captcha: still on the sign-in form means it was refused. A wrong captcha is
  // tried again with a new one, a wrong password is not, so that the account doesn't get locked.
  async function watchCaptchaSignIn(site, account, password, input, attempt, solved, textBefore) {
    const url = location.href;
    await sleep(2500);
    const stillHere = location.href === url && (isShown(password) || isShown(findPassword(site)));
    if (!stillHere) {
      return;
    }
    const now = document.body.innerText;
    const added = now.split(textBefore).join(" ");
    const captchaWrong = captchaErrorHints.test(added) || captchaErrorHints.test(now);
    const passwordWrong = !captchaWrong && passwordErrorHints.test(added);
    if (passwordWrong || attempt >= MAX_CAPTCHA_TRIES || (!captchaWrong && attempt >= 2)) {
      const currentInput = isShown(input) ? input : findCaptchaInput(site, null, findPassword(site));
      if (currentInput) {
        setValue(currentInput, "");
        currentInput.focus();
      }
      showNotice(passwordWrong ? strings.signInRefused : format(strings.captchaGaveUp, {n: attempt}), [], 0);
      return;
    }

    const currentPassword = isShown(password) ? password : findPassword(site);
    const currentInput = isShown(input) ? input : findCaptchaInput(site, findUsername(site, currentPassword), currentPassword);
    if (!currentPassword || !currentInput) {
      return;
    }
    if (!currentPassword.value) {
      setValue(currentPassword, account.password);
    }
    try {
      await refreshCaptcha(site, currentInput, solved);
      const next = await solveCaptcha(site, currentInput);
      const text = document.body.innerText;
      await sleep(300);
      submitForm(site, currentPassword);
      await watchCaptchaSignIn(site, account, currentPassword, currentInput, attempt + 1, next, text);
    } catch (error) {
      currentInput.focus();
      showNotice(format(strings.captchaManual, {error: error.message}), [], 0);
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

    // the captcha is read on the user's computer, see offscreen.js
    let captchaInput = null;
    let solved = null;
    let captchaError = "";
    if (site.captcha) {
      captchaInput = findCaptchaInput(site, usernameInput, password);
      if (!captchaInput) {
        captchaError = strings.captchaNoInput;
      } else {
        try {
          solved = await solveCaptcha(site, captchaInput);
        } catch (error) {
          captchaError = error.message;
        }
      }
    }

    const others = info.accounts.filter((item) => item !== account.username);
    const buttons = others.slice(0, 3).map((item) => ({label: `${strings.switchAccount} ${item}`, onClick: () => fill(info, item)}));
    if (info.recentlySubmitted && info.accounts.length > 0) {
      showNotice(strings.retry, buttons, 0);
      return;
    }
    // the admin's selectors that match nothing, so that a wrong one doesn't go unnoticed
    const missing = [
      [site.usernameSelector, strings.usernameField],
      [site.passwordSelector, strings.passwordField],
      [site.autoSubmit ? site.submitSelector : "", strings.submitField],
      [site.captcha ? site.captchaSelector : "", strings.captchaField],
      [site.captcha ? site.captchaImageSelector : "", strings.captchaImageField],
    ].filter(([selector]) => selector && selector.trim() && !query(selector));
    const warnings = missing.map(([selector, field]) => format(strings.missingSelector, {field, selector}));
    if (captchaError) {
      warnings.push(format(strings.captchaManual, {error: captchaError}));
    }
    showNotice([format(strings.filled, {app: site.displayName, user: account.username}), ...warnings].join("\n"), buttons, warnings.length > 0 ? 15000 : 8000);

    if (captchaError) {
      // nothing is submitted without the captcha, the user types it
      if (captchaInput) {
        captchaInput.focus();
      }
      return;
    }
    if (site.autoSubmit && !username) {
      await sleep(400);
      const textBefore = document.body.innerText;
      submitForm(site, password);
      if (solved) {
        watchCaptchaSignIn(site, account, password, captchaInput, 1, solved, textBefore);
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
