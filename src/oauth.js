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

const config = {
  applicationName: "your application name", // e.g. "application_123456"
  endpoint: "your backend url", // e.g. "http://localhost:8000"
  clientId: "your client id", // e.g. "145c8aaed59b9338672d"
};

const sdk = new Sdk(config);

// eslint-disable-next-line no-unused-vars
function login() {
  sdk.login((accessToken) => {
    if (accessToken) {
      chrome.storage.sync.set({accessToken}, () => {
        sdk
          .getUserProfile(accessToken)
          .then((userProfile) => displayUserProfile(userProfile));
      });
    } else {
      alert("Login failed!");
    }
  });
}

// eslint-disable-next-line no-unused-vars
function logout() {
  chrome.storage.sync.set({accessToken: ""}, () => clearUserProfile());
  chrome.storage.sync.set({userName: ""});
  chrome.storage.sync.set({password: ""});
}

function displayUserProfile(userProfile) {
  document.getElementById("user").innerHTML = `
        <img alt="${userProfile.name}" src="${userProfile.picture}" width="50px" height="25px"/>
        <p>Hi, ${userProfile.name}</p>
    `;
  document.getElementById("loginOrLogout").innerText = "Logout";
}

function clearUserProfile() {
  document.getElementById("user").innerHTML = "";
  document.getElementById("loginOrLogout").innerText = "Login";
}
