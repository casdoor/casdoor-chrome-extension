# casdoor-chrome-extension

Casdoor chrome extension can help the user to auto login with the casdoor application or login this extension through casdoor.

Casdoor chrome extension is very simple to use. We will show you the steps below.

## Usage

### Init the extension

Firstly, you need to set the match rules about your casdoor application's login URL in the `mainfest.json`.

```json
"content_scripts": [
    {
        "matches": [
            "https://*.casdoor.com/login",
            "https://*.casdoor.org/login"
        ],
        "js": [
            "/src/content-script.js"
        ]
    }
],
"host_permissions": [
    "http://localhost:8000/*"
]
```

`content_scripts` matches the URL you need to auto login to Casdoor, and `host_permissions` matches the URL of the Casdoor backend application that provides the oauth service.

You need to change the `matches` filed followed by [match patterns rules](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns).


### Init the config

modify the variable `config` in `oauth.js`.

 ```js
 const config = {
     applicationName: "application_1f4v78",
     endpoint: "http://localhost:8000",
     clientId: "145c8aaed59b9338672d"
 };
 ```

### Install the extension

1. Go to `chrome://extensions` and check the box for **Developer mode** in the top right.
2. Click `Load unpacked` button, then choose this project folder.
