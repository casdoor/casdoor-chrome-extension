/* eslint-disable no-undef */
"use strict";

const config = {
  applicationName: "your application name", // e.g. "application_123456"
  endpoint: "your backend url", // e.g. "http://localhost:8000"
  clientId: "your client id", // e.g. "145c8aaed59b9338672d"
  chromeExtensionId: "your chrome extension id" // e.g. "abcdefgffeplfamihkpcabdhllpilbdd"
};

const sdk = new Sdk(config);

// eslint-disable-next-line no-unused-vars
function login () {
  sdk.login((accessToken) => {
    if (accessToken) {
      alert("Login successful!");
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
function logout () {
  chrome.storage.sync.set({accessToken: ""}, () => clearUserProfile());
}

function displayUserProfile (userProfile) {
  document.getElementById("user").innerHTML = `
        <img alt="${userProfile.name}" src="${userProfile.picture}" width="50px" height="25px"/>
        <p>Hi, ${userProfile.name}</p>
    `;
  document.getElementById("loginOrLogout").innerText = "Logout";
}

function clearUserProfile () {
  document.getElementById("user").innerHTML = "";
  document.getElementById("loginOrLogout").innerText = "Login";
}
