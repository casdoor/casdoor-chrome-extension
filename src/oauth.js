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

let sdk;
sdk = new Sdk(CasdoorConfig);

function getStorageData(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, (data) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        resolve(data);
      }
    });
  });
}

function initInputParamSdk(){
  return new Promise((resolve, reject) => {
  Promise.all([getStorageData("applicationName"), getStorageData("endpoint")])
    .then(([applicationData, endpointData]) => {
      const applicationName = applicationData.applicationName;
      const endpoint = endpointData.endpoint;

      if (applicationName && endpoint) {
        CasdoorConfig.applicationName = applicationName;
        CasdoorConfig.endpoint = endpoint;
      }
      sdk = new Sdk(CasdoorConfig);
      resolve(sdk);
    })
    .catch((error) => {
      console.error("init SDK failed:", error);
      reject(error);
    });
  });
}

// eslint-disable-next-line no-unused-vars
function login() {
  initInputParamSdk().then((sdk) => {
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
  })
}

// eslint-disable-next-line no-unused-vars
function logout() {
  chrome.storage.sync.set({accessToken: ""}, () => clearUserProfile());
  setInputDisabledState(false, "endpoint", "applicationName");
}

function displayUserProfile(userProfile) {
  document.getElementById("user").innerHTML = `
        <img alt="${userProfile.name}" src="${userProfile.picture}" width="50px"/>
        <p>Hi, ${userProfile.name}</p>
    `;
  setTimeout(function() {
    updateDisabledInput("endpoint", userProfile.iss)
    updateDisabledInput("applicationName", userProfile.applicationName)
  }, 100);
  document.getElementById("loginOrLogout").innerText = "Logout";
}

function clearUserProfile() {
  document.getElementById("user").innerHTML = "";
  document.getElementById("loginOrLogout").innerText = "Login";
}

function updateDisabledInput(id,value){
  document.getElementById(id).disabled = false;
  document.getElementById(id).value = value;
  document.getElementById(id).disabled = true;
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

const intervalDetectToken = setInterval(getDomAccessToken, 3000);

let accessToken;
let applicationName;

function getDomAccessToken() {
  if(window.location.pathname != "/src/popup.html"){
    accessToken = document.getElementById("CasdoorAccessToken").getAttribute("value");
    applicationName = document.getElementById("CasdoorApplicationName").getAttribute("value");
    if (accessToken && applicationName) {
      sdk.getUserProfile(accessToken).then((userProfile) => {
        userProfile.applicationName = applicationName;
        if(userProfile){
          showNotification(confirmCallback, userProfile);
        }
        clearInterval(intervalDetectToken);  
      });
    }
  } else{
    clearInterval(intervalDetectToken);
  }
}

function confirmCallback(userProfile) {
  if (accessToken && userProfile) {
    chrome.storage.sync.set({ accessToken: accessToken,userProfile: userProfile});
  } else {
    alert("Login failed!");
  }
}


function showNotification(confirmCallback, userProfile) {
  const notification = document.createElement("div");
  const userDiv = document.createElement("div");
  const endpointDataDiv = document.createElement("div");
  const applicationNameDataDiv = document.createElement("div");
  const buttonDiv = document.createElement("div");
  const confirmButton = document.createElement("button");
  const cancelButton = document.createElement("button");

  notification.style.position = "fixed";
  notification.style.top = "10px";
  notification.style.right = "10px";
  notification.style.padding = "10px";
  notification.style.margin = "10px";
  notification.style.backgroundColor = "#eceff7";
  notification.style.color = "#000000";

  userDiv.style.display = "flex";
  userDiv.style.margin = "10px";
  userDiv.style.justifyContent = 'center';
  userDiv.style.alignItems = 'center';

  endpointDataDiv.style.marginBottom = "10px";
  endpointDataDiv.style.marginTop = "10px";

  buttonDiv.style.marginTop = "10px";
  buttonDiv.style.display = "flex";
  buttonDiv.style.justifyContent = "space-between";

  notification.textContent = "Whether to log in to the current account?";
  
  userDiv.innerHTML=`
  <img alt="${userProfile.name}" src="${userProfile.picture}" width="50px" style="margin-right: 10px;"/>
  <p>${userProfile.name}</p>
  `

  cancelButton.textContent = "Cancel";

  confirmButton.textContent = "OK";

  endpointDataDiv.innerHTML  = `endpoint: <span style="background-color: lightgray;">${userProfile.iss}</span>`;

  applicationNameDataDiv.innerHTML  = `applicationName: <span style="background-color: lightgray;">${userProfile.applicationName}</span>`;
  
  confirmButton.onclick = () => {
    if (confirmCallback && typeof confirmCallback === "function") {
      confirmCallback(userProfile);
    }
    document.body.removeChild(notification);
  };

  cancelButton.onclick = () => {
    document.body.removeChild(notification);
  };

  notification.appendChild(userDiv);
  notification.appendChild(endpointDataDiv);
  notification.appendChild(applicationNameDataDiv);
  buttonDiv.appendChild(cancelButton);
  buttonDiv.appendChild(confirmButton);
  notification.appendChild(buttonDiv);
  document.body.appendChild(notification);


  setTimeout(() => {
    if(document.body.contains(notification)){
      document.body.removeChild(notification);
    }
  }, 5000);
}
