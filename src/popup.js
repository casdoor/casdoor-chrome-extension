"use strict";

document.addEventListener("DOMContentLoaded", function () {
  const enableAutoLoginDom = document.getElementById("enableAutoLogin");

  chrome.storage.sync.get("disableAutoLogin", ({ disableAutoLogin }) => {
    enableAutoLoginDom.checked = !disableAutoLogin;
  });

  enableAutoLoginDom.addEventListener("click", function () {
    chrome.storage.sync.set({ disableAutoLogin: !enableAutoLoginDom.checked });
  });
});
