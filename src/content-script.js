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

const userName = "admin";
const password = "123";
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

function autoLogin() {
  waitForElementToDisplay(
    "//input[@id='normal_login_username']",
    updateTime,
    () => {
      const usernameElement = document.getElementById("normal_login_username");
      usernameElement.value = userName;
      const changeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      usernameElement.dispatchEvent(changeEvent);

      waitForElementToDisplay(
        "//input[@id='normal_login_password']",
        updateTime,
        () => {
          const passwordElement = document.getElementById(
            "normal_login_password"
          );
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
  chrome.storage.sync.get("disableAutoLogin", ({disableAutoLogin}) => {
    if (!disableAutoLogin) {
      autoLogin();
    }
  });
};
