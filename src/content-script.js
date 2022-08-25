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
  const usernameXpath = "//input[contains(@id,'username')] | //input[contains(@name,'username')] | //input[contains(@placeholder,'username')]";
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

      const passwordXpath = "//input[@type='password'] | //input[contains(@id,'password')] | //input[contains(@name,'password')] | //input[contains(@placeholder,'password')]";
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

          waitForElementToDisplay(
            "//button[@type='submit']",
            updateTime,
            () => {
              document
                .evaluate("//button[@type='submit']", document)
                .iterateNext()
                .click();
            }
          );
        }
      );
    }
  );
}

window.onload = () => {
  const url = window.location.href;
  chrome.storage.sync.get("accessToken", ({accessToken}) => {
    if (accessToken) {
      const usernameKey = url + "username";
      chrome.storage.sync.get(usernameKey, (userName) => {
        if (userName[usernameKey]) {
          const passwordKey = url + "password";
          chrome.storage.sync.get(passwordKey, (password) => {
            if (password[passwordKey]) {
              chrome.storage.sync.get("disableAutoLogin", ({disableAutoLogin}) => {
                if (!disableAutoLogin) {
                  autoLogin(userName[usernameKey], password[passwordKey]);
                }
              });
            }
          });
        }
      });
    }
  });
};
