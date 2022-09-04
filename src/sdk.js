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
// eslint-disable-next-line no-unused-vars
class Sdk {
  constructor(config) {
    this.config = config || {
      endpoint: "",
      applicationName: "",
    };
  }

  getRedirectUri() {
    return encodeURIComponent(
      chrome.identity.getRedirectURL("")
    );
  }

  getSignInUrl(clientId) {
    const endpoint = this.config.endpoint;
    const redirectUri = this.getRedirectUri();
    const scope = "profile";
    const state = this.config.applicationName;
    return `${endpoint}/login/oauth/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  }

  getAccessTokenFromRedirectUrl(redirectUrl) {
    if (redirectUrl) {
      const hashTagIndex = redirectUrl.indexOf("#");
      const questionMaskIndex = redirectUrl.indexOf("?");
      if (
        hashTagIndex > 0 &&
        questionMaskIndex > 0 &&
        hashTagIndex < questionMaskIndex
      ) {
        // e.g. "https://${extensionId}.chromiumapp.org#token=${accessToken}?state=${state}&token_type=bearer"
        return redirectUrl.substring(hashTagIndex + 7, questionMaskIndex);
      }
    }
    return "";
  }

  login(func) {
    this.getApplication().then(application => {
      // refer: https://developer.chrome.com/docs/extensions/reference/identity/#method-launchWebAuthFlow
      chrome.identity.launchWebAuthFlow(
        {
          url: this.getSignInUrl(application.clientId),
          interactive: true,
        },
        (redirectUrl) => {
          let accessToken = "";
          if (!chrome.runtime.lastError && redirectUrl) {
            accessToken = this.getAccessTokenFromRedirectUrl(redirectUrl);
          }
          try {
            func(accessToken);
          } catch (error) {
            console.error(error);
          }
        }
      );
    });
  }

  getUserProfileUrl() {
    const endpoint = this.config.endpoint;
    return `${endpoint}/api/userinfo`;
  }

  getUserProfile(accessToken) {
    const userProfileUrl = this.getUserProfileUrl();
    const requestConfig = {
      method: "GET",
      async: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    };
    return fetch(userProfileUrl, requestConfig)
      .then((response) => response.json())
      .catch((error) => console.error(error));
  }

  getAccountUrl() {
    const endpoint = this.config.endpoint;
    return `${endpoint}/api/get-account?managedAccounts=1`;
  }

  getAccount(accessToken) {
    const accountUrl = this.getAccountUrl();
    const requestConfig = {
      method: "GET",
      async: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    };
    return fetch(accountUrl, requestConfig)
      .then((response) => response.json())
      .catch((error) => console.error(error));
  }

  getApplicationUrl(id) {
    const endpoint = this.config.endpoint;
    return `${endpoint}/api/get-application?id=${id}`;
  }

  getApplication() {
    const applicationUrl = this.getApplicationUrl(`admin/${this.config.applicationName}`);
    const requestConfig = {
      method: "GET",
      async: true,
      headers: {
        "Content-Type": "application/json",
      },
    };
    return fetch(applicationUrl, requestConfig)
      .then((response) => response.json())
      .catch((error) => console.error(error));
  }
}
