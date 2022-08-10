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

document.addEventListener("DOMContentLoaded", function() {
  const enableAutoLoginDom = document.getElementById("enableAutoLogin");

  chrome.storage.sync.get("disableAutoLogin", ({disableAutoLogin}) => {
    enableAutoLoginDom.checked = !disableAutoLogin;
  });

  enableAutoLoginDom.addEventListener("click", function() {
    chrome.storage.sync.set({disableAutoLogin: !enableAutoLoginDom.checked});
  });
});

document.addEventListener("DOMContentLoaded", function() {
  const loginOrLogoutDom = document.getElementById("loginOrLogout");

  chrome.storage.sync.get("accessToken", ({accessToken}) => {
    loginOrLogoutDom.innerText = accessToken ? "Logout" : "Login";

    if (accessToken) {
      sdk
        .getUserProfile(accessToken)
        .then((userProfile) => displayUserProfile(userProfile));
    } else {
      clearUserProfile();
    }
  });

  loginOrLogoutDom.addEventListener("click", function() {
    chrome.storage.sync.get("accessToken", ({accessToken}) => {
      if (accessToken) {
        logout();
      } else {
        login();
      }
    });
  });
});
