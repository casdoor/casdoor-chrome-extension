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

const isZh = (navigator.language || "").toLowerCase().startsWith("zh");
const strings = isZh
  ? {
    endpoint: "Casdoor 地址",
    application: "应用名称",
    autoFill: "自动填写登录表单",
    redirectUri: "要加到应用回调地址里的地址：",
    login: "登录 Casdoor",
    logout: "退出",
    sites: "可以代填的系统：",
    accounts: "{n} 个账号",
    canSave: "手动登录一次后保存",
    noSites: "还没有可以代填的系统",
    legacy: "这个 Casdoor 没有表单代填，按托管账号的登录地址代填",
    errorEndpoint: "请填写以 http:// 或 https:// 开头的 Casdoor 地址和应用名称",
    errorApplication: "找不到这个应用",
    errorLogin: "登录失败：",
  }
  : {
    endpoint: "Casdoor URL",
    application: "Application name",
    autoFill: "Fill sign-in forms automatically",
    redirectUri: "Add this to the redirect URLs of the application:",
    login: "Sign in to Casdoor",
    logout: "Sign out",
    sites: "Systems filled for you:",
    accounts: "{n} account(s)",
    canSave: "saved after you sign in by hand",
    noSites: "No system is filled for you yet",
    legacy: "This Casdoor has no form autofill, the sign-in URLs of the managed accounts are used",
    errorEndpoint: "Please enter the Casdoor URL starting with http:// or https://, and the application name",
    errorApplication: "The application is not found",
    errorLogin: "Sign-in failed: ",
  };

const $ = (id) => document.getElementById(id);

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function renderSites(status) {
  const box = $("sites");
  box.textContent = "";
  if (!status.user || !status.sites) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (status.sites.length === 0) {
    box.textContent = strings.noSites;
    return;
  }
  const title = document.createElement("div");
  title.textContent = strings.sites;
  const list = document.createElement("ul");
  for (const site of status.sites) {
    const item = document.createElement("li");
    const detail = site.accounts > 0 ? strings.accounts.replace("{n}", site.accounts) : strings.canSave;
    item.textContent = isZh ? `${site.name}（${detail}）` : `${site.name} (${detail})`;
    list.append(item);
  }
  box.append(title, list);
}

async function render() {
  const status = await send({type: "getStatus"});
  $("endpoint").value = status.endpoint;
  $("applicationName").value = status.applicationName;
  $("autoFill").checked = status.autoFill;
  $("redirectUri").textContent = status.redirectUri;

  const signedIn = !!status.user;
  $("endpoint").disabled = signedIn;
  $("applicationName").disabled = signedIn;
  $("loginOrLogout").textContent = signedIn ? strings.logout : strings.login;
  $("user").hidden = !signedIn;
  if (signedIn) {
    $("avatar").src = status.user.avatar || "/images/icon48.png";
    $("userName").textContent = status.user.displayName || status.user.name;
    $("userOrg").textContent = `${status.user.owner}/${status.user.name}`;
  }
  $("message").textContent = signedIn && status.mode === "legacy" ? (status.message || strings.legacy) : "";
  renderSites(status);
  return status;
}

document.addEventListener("DOMContentLoaded", async() => {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = strings[element.dataset.i18n];
  });
  let status = await render();

  $("autoFill").addEventListener("change", () => send({type: "setAutoFill", enabled: $("autoFill").checked}));

  $("loginOrLogout").addEventListener("click", async() => {
    if (status.user) {
      await send({type: "logout"});
      status = await render();
      return;
    }
    $("loginOrLogout").disabled = true;
    $("message").textContent = "";
    const res = await send({type: "login", endpoint: $("endpoint").value, applicationName: $("applicationName").value});
    $("loginOrLogout").disabled = false;
    if (res && res.error) {
      const errors = {endpoint: strings.errorEndpoint, application: strings.errorApplication};
      $("message").textContent = errors[res.error] || strings.errorLogin + res.error;
      return;
    }
    status = await render();
  });
});
