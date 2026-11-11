# Casdoor browser extension

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/bnjbegmkpjbcpneclidlbloadenondlm?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/casdoor-browser-plugin/bnjbegmkpjbcpneclidlbloadenondlm)
[![Release](https://github.com/casdoor/casdoor-chrome-extension/actions/workflows/release.yml/badge.svg)](https://github.com/casdoor/casdoor-chrome-extension/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/casdoor/casdoor-chrome-extension)](LICENSE)

The Casdoor browser extension signs people into the systems that have no single sign-on, such as old OA, ERP and intranet sites, by filling their sign-in forms with the accounts kept in [Casdoor](https://casdoor.ai). The admin sets up each system once in Casdoor, the user signs in to Casdoor once in the extension, and from then on every sign-in page of those systems is filled and submitted for them.

[![Demo: signing in to four systems with the Casdoor browser extension](docs/demo.gif)](docs/demo.mp4)

## What it does

- Fills the username and password of the system's sign-in page and signs in, when the admin turns on automatic submit.
- Works with server-side forms, single-page apps that render their sign-in late or route it with `#/login`, forms without a `<form>`, and sign-in boxes in frames. The fields are found automatically, or with CSS selectors set by the admin.
- Lets the user pick an account when they have more than one for a system, and uses that account next time.
- Reads simple image captchas with a model inside the extension, on the user's computer. A refused captcha is read again with a new picture, up to three times. A refused password is never tried again, so that the account doesn't get locked.
- Offers to save the account that the user signs in with by hand, so that it is filled next time, when the admin allows it.
- Fills a sign-in page that comes back within 30 seconds of an automatic sign-in without submitting it again, and says so.
- Shows the user's systems in its popup, opens them, and fills the current page on demand when automatic filling is turned off.

## Install

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/casdoor-browser-plugin/bnjbegmkpjbcpneclidlbloadenondlm). It works in Chrome, Edge and other Chromium browsers that take extensions from the Chrome Web Store.

Where the store can't be reached, download `casdoor-extension.zip` from the [latest release](https://github.com/casdoor/casdoor-chrome-extension/releases/latest), unzip it, open `chrome://extensions`, turn on **Developer mode** and click **Load unpacked**. The package has the public key of the store's extension in its manifest, so it gets the same ID and redirect URL wherever it's unzipped. Remove it before installing the extension from the store, Chrome takes the two as the same extension.

## Set it up in Casdoor

Form autofill is part of the Casdoor Enterprise edition. Casdoor without it still fills the managed accounts, see [Open-source edition](#open-source-edition).

1. **The systems.** In the edit page of the application of each system, open the **Form autofill** tab, turn it on and enter the addresses of its sign-in pages. Set **Submit automatically**, **Let users save their accounts** and **Recognize image captchas** as the system needs, and CSS selectors only where the fields aren't found automatically.
2. **The accounts.** Give each user their account of the system as a managed account on the user's page, or let users save the account they sign in with by hand. With the organization's encrypted fields, the passwords are kept encrypted.
3. **Signing in to the extension.** Users enter the Casdoor URL and an application of their organization, as `name` for an application of the `admin` owner or as `owner/name`. Every application accepts the redirect URL of the extension from the Chrome Web Store, so there is nothing to configure. The application needs the `refresh_token` grant type to keep users signed in after their access token expires. A build of your own loaded unpacked has its own redirect URL, which the extension shows under its sign-in form to add to the application, unless it's built with `--key`.

### Sign-in page addresses

The addresses are matched the same way in Casdoor and in the extension:

| Address | Matches |
| --- | --- |
| `https://oa.example.com/login` | `https://oa.example.com/login`, `.../login?next=/` and `.../login.jsp`: a path without `*` is a prefix |
| `oa.example.com/login` | the same path over `http` and `https` |
| `*.example.com/signin` | `/signin` on every subdomain of `example.com` |
| `https://crm.example.com/*/login` | `*` matches anything in the path |
| `https://app.example.com/#/login` | the `#/login` route of a single-page app; the part after `#` only counts when the address has one |

The host has to be the same, so a page of another site never gets an account, whatever its address contains.

### Roll it out to a whole organization

IT can install the extension and set the Casdoor URL and the application for every browser with Chrome policies, and users can't change them. For example, on Windows:

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist]
"1"="bnjbegmkpjbcpneclidlbloadenondlm"

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\bnjbegmkpjbcpneclidlbloadenondlm\policy]
"serverUrl"="https://door.example.com"
"application"="app-example"
```

The same two settings, `serverUrl` and `application`, can be pushed from the Google Admin console, macOS profiles or Linux policy files. Their schema is [public/managed_schema.json](public/managed_schema.json).

### Open-source edition

Casdoor without an Enterprise license fills each user's managed accounts into the **Signin URL** of their applications, matched as a sign-in page address above, and submits them. Sign-in page rules, selectors, captchas and saving accounts need the Enterprise edition.

## Privacy and security

- Only the service worker talks to Casdoor and holds the tokens. The sign-in is the OAuth authorization code flow with PKCE in a Chrome window, so the extension has no client secret and never sees the Casdoor password. The tokens are kept in the extension's local storage, which content scripts can't read, and are revoked in Casdoor on sign-out.
- A page gets an account only when its own address is a sign-in page of the system. Casdoor checks the address again before it hands the account out, and records every time it does.
- The extension doesn't keep passwords. An account typed by hand is held for at most two minutes while the extension asks whether to save it, and is sent to Casdoor only if the user says so.
- Captcha pictures are read on the user's computer and never sent anywhere. On other pages the extension reads and sends nothing.

The privacy policy is at [casdoor.com/privacy](https://www.casdoor.com/privacy#browser-extension).

## Development

The extension is TypeScript, built with Vite: the popup is React with Tailwind CSS, the content script and the service worker are plain TypeScript.

```bash
yarn install
yarn build        # builds dist/, load it with Load unpacked
yarn build --key  # the same with the store's public key, so it has the store's ID
yarn watch        # rebuilds on every change
yarn typecheck
yarn test         # unit tests of the sign-in page matching
```

| Folder | |
| --- | --- |
| `src/background` | the service worker: signing in to Casdoor, the systems and accounts, the captcha reader |
| `src/content` | the content script: finding and filling sign-in forms, the cards on the page |
| `src/popup` | the popup |
| `src/offscreen` | the page that reads captchas with ONNX Runtime Web |
| `src/shared` | the messages between them, the sign-in page matching, the types |
| `public` | the manifest's locales, icons, policy schema and the captcha model |
| `e2e` | the end-to-end test, the made-up systems it signs in to, and the recording of the demo video |

### End-to-end test

The end-to-end test loads the extension in Chromium with Playwright and signs in to four made-up systems (`e2e/systems.mjs`) through a real Casdoor with an Enterprise license:

1. Run a Casdoor on `http://localhost:18100` with `origin = http://door.acme.test` in its `app.conf`.
2. Run the test, which puts the organization, the user and the systems into that Casdoor first:

```bash
yarn build --e2e
CASDOOR_ADMIN_PASSWORD=<password of the admin> node e2e/run.mjs
```

`node e2e/demo/record.mjs` records [docs/demo.mp4](docs/demo.mp4) and [docs/demo.gif](docs/demo.gif) in the same setup, and needs ffmpeg.

### Releases

Every commit on `master` is released by semantic-release with the version from the commit messages (`feat:` and `fix:`). The release workflow writes the version into the manifest, attaches `casdoor-extension.zip` to the GitHub release and submits it to the Chrome Web Store, where it is published once it passes the review.

## License

[Apache-2.0](LICENSE). The captcha model is from [ddddocr](https://github.com/sml2h3/ddddocr) and runs on [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), both under the MIT License.
