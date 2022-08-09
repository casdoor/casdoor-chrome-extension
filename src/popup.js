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

document.addEventListener("DOMContentLoaded", function () {
    const loginOrLogoutDom = document.getElementById("loginOrLogout");

    chrome.storage.sync.get("accessToken", ({accessToken}) => {
        loginOrLogoutDom.innerText = accessToken ? "Logout" : "Login";

        if (accessToken) {
            sdk.getUserProfile(accessToken)
                .then(userProfile => displayUserProfile(userProfile));
        } else {
            clearUserProfile();
        }
    });

    loginOrLogoutDom.addEventListener("click", function () {
        chrome.storage.sync.get("accessToken", ({accessToken}) => {
            if (accessToken) {
                logout();
            } else {
                login();
            }
        });
    });
});
