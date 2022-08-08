"use strict";

const userName = "admin";
const password = "123";
const updateTime = 300;

function waitForElementToDisplay(xpath, time, func) {
  if (document.evaluate(xpath, document).iterateNext() != null) {
    func();
    return;
  } else {
    setTimeout(function () {
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
  chrome.storage.sync.get("disableAutoLogin", ({ disableAutoLogin }) => {
    if (!disableAutoLogin) {
        autoLogin();
    }
  });
};