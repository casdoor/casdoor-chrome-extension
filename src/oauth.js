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

const CasdoorConfig = {
  applicationName: "",
  endpoint: "",
};
chrome.storage.sync.get("applicationName", ({applicationName}) => {
  if (applicationName) {
    CasdoorConfig.applicationName = applicationName;
  }
});
chrome.storage.sync.get("endpoint", ({endpoint}) => {
  if (endpoint) {
    CasdoorConfig.endpoint = endpoint;
  }
});

const sdk = new Sdk(CasdoorConfig);

// eslint-disable-next-line no-unused-vars
function login() {
  sdk.login((accessToken) => {
    if (accessToken) {
      chrome.storage.sync.set({accessToken}, () => {
        sdk
          .getUserProfile(accessToken)
          .then((userProfile) => displayUserProfile(userProfile));
      });
      setInputDisabledState(true, "endpoint", "applicationName");
    } else {
      alert("Login failed!");
    }
  });
}

// eslint-disable-next-line no-unused-vars
function logout() {
  chrome.storage.sync.set({accessToken: ""}, () => clearUserProfile());
  setInputDisabledState(false, "endpoint", "applicationName");
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

function setInputDisabledState(disabledState, ...elementIds) {
  elementIds.forEach(elementId => {
    const inputElement = document.getElementById(elementId);
    if (inputElement) {
      inputElement.disabled = disabledState;
    } else {
      console.warn(`No element found with ID: ${elementId}`);
    }
  });
}
