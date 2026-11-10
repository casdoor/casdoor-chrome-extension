// The data that Casdoor, the service worker, the content scripts and the popup pass around

/** How the characters of an image captcha are read: "" decides from the page */
export type CaptchaCharset = "" | "Digits" | "Alphanumeric" | "Any";

/** A system whose sign-in form is filled, as /api/get-form-fill-sites returns it (without passwords) */
export interface Site {
  application: string;
  displayName: string;
  logo: string;
  /** The sign-in pages, e.g. "https://oa.example.com/login", "*.example.com/login*" */
  urls: string[];
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  autoSubmit: boolean;
  /** Whether the user may save the account that they sign in with by hand */
  allowSave: boolean;
  captcha: boolean;
  captchaSelector: string;
  captchaImageSelector: string;
  captchaCharset: CaptchaCharset;
  /** The usernames of the user's accounts of the system */
  accounts: string[];
}

export interface Account {
  username: string;
  password: string;
}

export interface User {
  owner: string;
  name: string;
  displayName: string;
  avatar: string;
  email: string;
}

/** Where the extension signs in: set by the user, or by the IT admin through a policy */
export interface Connection {
  serverUrl: string;
  application: string;
}

/** What a content script does on its page: the system it is a sign-in page of, and the accounts to fill */
export interface PagePlan {
  site: Site;
  /** The sign-in page came back within a short time after an automatic sign-in, so it is filled but not submitted */
  recentlySubmitted: boolean;
  /** How many times in a row it was signed in automatically within that short time */
  submitCount: number;
  /** The account the user used last time, when they have several */
  preferredAccount: string;
  canSave: boolean;
}

/** An account typed into a sign-in form by hand, waiting for the user to say whether to save it */
export interface PendingAccount {
  application: string;
  displayName: string;
  username: string;
}

export interface Status {
  connection: Connection;
  /** The connection is set by a policy and can't be changed */
  managed: boolean;
  user: User | null;
  autofill: boolean;
  /** The form autofill of the Casdoor enterprise edition, false when only the managed accounts are filled */
  full: boolean;
  sites: Site[];
  /** Why the systems could not be loaded */
  error: string;
  /** Where Chrome hands the sign-in back to this build of the extension */
  redirectUrl: string;
  /** Whether this is the extension from the Chrome Web Store, whose redirect URL every Casdoor application accepts */
  official: boolean;
}

export interface TabInfo {
  /** The system that the active tab is a sign-in page of */
  site: Site | null;
}
