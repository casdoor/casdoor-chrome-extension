/* eslint-disable no-undef */
// eslint-disable-next-line no-unused-vars
class Sdk {
  constructor (config) {
    this.config = config || {
      endpoint: "",
      applicationName: "",
      clientId: "",
      chromeExtensionId: ""
    };
  }

  getRedirectUri () {
    return encodeURIComponent(
      `https://${this.config.chromeExtensionId}.chromiumapp.org`
    );
  }

  getSignInUrl () {
    const endpoint = this.config.endpoint;
    const clientId = this.config.clientId;
    const redirectUri = this.getRedirectUri();
    const scope = "profile";
    const state = this.config.applicationName;
    return `${endpoint}/login/oauth/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  }

  getAccessTokenFromRedirectUrl (redirectUrl) {
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

  login (func) {
    // refer: https://developer.chrome.com/docs/extensions/reference/identity/#method-launchWebAuthFlow
    chrome.identity.launchWebAuthFlow(
      {
        url: this.getSignInUrl(),
        interactive: true
      },
      (redirectUrl) => {
        let accessToken = "";
        if (redirectUrl) {
          accessToken = this.getAccessTokenFromRedirectUrl(redirectUrl);
        }
        try {
          func(accessToken);
        } catch (error) {
          console.error(error);
        }
      }
    );
  }

  getUserProfileUrl () {
    const endpoint = this.config.endpoint;
    return `${endpoint}/api/userinfo`;
  }

  getUserProfile (accessToken) {
    const userProfileUrl = this.getUserProfileUrl();
    const requestConfig = {
      method: "GET",
      async: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    };
    return fetch(userProfileUrl, requestConfig)
      .then((response) => response.json())
      .catch((error) => console.error(error));
  }
}
