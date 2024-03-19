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

/* eslint-disable no-undef */

const updateTime = 300;

function waitForElementToDisplay(xpath, time, func) {
  if (document.evaluate(xpath, document).iterateNext() != null) {
    func();
  } else {
    setTimeout(function() {
      waitForElementToDisplay(xpath, time, func);
    }, time);
  }
}

function autoLogin(userName, password) {
  const usernameXpath = UsernameXpaths.join(" | ");
  waitForElementToDisplay(
    usernameXpath,
    updateTime,
    () => {
      const usernameElement = document.evaluate(usernameXpath, document).iterateNext();
      usernameElement.value = userName;
      const changeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      usernameElement.dispatchEvent(changeEvent);

      const passwordXpath = PasswordXpaths.join(" | ");
      waitForElementToDisplay(
        passwordXpath,
        updateTime,
        () => {
          const passwordElement = document.evaluate(passwordXpath, document).iterateNext();
          passwordElement.value = password;
          const changeEvent = new Event("change", {
            bubbles: true,
            cancelable: true,
          });
          passwordElement.dispatchEvent(changeEvent);

          const submitXpath = SubmitXpaths.join(" | ");
          waitForElementToDisplay(
            submitXpath,
            updateTime,
            () => {
              document
                .evaluate(submitXpath, document)
                .iterateNext()
                .click();
            }
          );
        }
      );
    }
  );
}

function autoFillCasdoorConfig() {
  const applicationNameXpath = "//div[@id='CasdoorApplicationName']";
  waitForElementToDisplay(
    applicationNameXpath,
    updateTime,
    () => {
      const applicationNameDom = document.evaluate(applicationNameXpath, document).iterateNext();
      if (applicationNameDom) {
        const applicationName = applicationNameDom.getAttribute("value");
        if (applicationName) {
          chrome.storage.sync.set({applicationName});
          chrome.storage.sync.set({endpoint: window.location.origin});
        }
      }
    }
  );
}

window.onload = () => {
  chrome.storage.sync.get("accessToken", ({accessToken}) => {
    if (!accessToken) {
      autoFillCasdoorConfig();
    }
  });
};

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "autoLogin") {
    const managedAccount = message.managedAccount;
    autoLogin(managedAccount.username, managedAccount.password);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "isUserLoggedIn") {
    chrome.storage.sync.get("accessToken", ({accessToken}) => {
      if(accessToken){
        sendResponse(true);  
      } else{
        sendResponse(false);
      }
    });
    return true;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "isDisableAutoLogin") {
    chrome.storage.sync.get("disableAutoLogin", ({ disableAutoLogin }) => {
      sendResponse(disableAutoLogin);  
    });
    return true;
  }
});

chrome.runtime.onMessage.addListener(function(message, sender,sendResponse) {
  if (message.action === "getManagedAccounts") {
    chrome.storage.sync.get("accessToken", ({accessToken}) => {
      sdk.getAccount(accessToken).then((account) => {
        const managedAccounts = account.data.managedAccounts;
        sendResponse(managedAccounts);  
      });
    });
    return true;
  }
});
