// Copyright 2024 The Casdoor Authors. All Rights Reserved.
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

let autoLoginTabs = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.url && tab.status === "complete") {
    const [UserLoggedIn, DisableAutoLogin] = await Promise.all([
      isUserLoggedIn(tabId),
      isDisableAutoLogin(tabId),
    ]);
    if (UserLoggedIn && !DisableAutoLogin && !autoLoginTabs.has(tabId)) {
      autoLogin(tabId, tab.url);
    }
  }
});

async function isUserLoggedIn(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: "isUserLoggedIn" },
      function (UserLoggedIn) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else {
          resolve(UserLoggedIn);
        }
      }
    );
  });
}

function getManagedAccounts(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: "getManagedAccounts" },
      function (managedAccounts) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else {
          resolve(managedAccounts);
        }
      }
    );
  });
}

async function autoLogin(tabId, url) {
  const managedAccounts = await getManagedAccounts(tabId);
  if (managedAccounts) {
    for (const managedAccount of managedAccounts) {
      if (managedAccount && url.includes(managedAccount.signinUrl)) {
        autoLoginTabs.add(tabId);
        chrome.tabs.sendMessage(tabId, {
          action: "autoLogin",
          managedAccount: managedAccount,
        });
        break;
      }
    }
  }
}

function isDisableAutoLogin(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: "isDisableAutoLogin" },
      function (DisableAutoLogin) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(DisableAutoLogin);
        }
      }
    );
  });
}

function clearAutoLoginTabs() {
  autoLoginTabs.clear();
}

setInterval(clearAutoLoginTabs, 10000);
