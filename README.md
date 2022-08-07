# casdoor-chrome-extension

Casdoor chrome extension can help the user to auto login with the casdoor application.

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
]
```

You need to change the `matches` filed followed by [match patterns rules](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns).

### Install the extension

1. Go to `chrome://extensions` and check the box for **Developer mode** in the top right.
2. Click `Load unpacked` button, then choose this project folder.
