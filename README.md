# casdoor-chrome-extension

Casdoor chrome extension can help the user to auto login with the casdoor application or login this extension through casdoor.

Casdoor chrome extension is very simple to use. We will show you the steps below.

## Usage

### Init the extension

Firstly, you need to set the `host_permissions` filed.

```json
"host_permissions": [
    "http://localhost:8000/*"
]
```

 `host_permissions` matches the URL of the Casdoor backend application that provides the oauth service.

### Init the config

modify the variable `CasdoorConfig` in `src/config.js`.

```js
const CasdoorConfig = {
  applicationName: "your application name", // e.g. "application_123456"
  endpoint: "your backend url", // e.g. "http://localhost:8000"
  clientId: "your client id", // e.g. "145c8aaed59b9338672d"
};
```

### Install the extension

1. Go to `chrome://extensions` and check the box for **Developer mode** in the top right.
2. Click `Load unpacked` button, then choose this project folder.
