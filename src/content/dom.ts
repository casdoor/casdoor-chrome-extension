// Finding the fields of a sign-in form and typing into them the way a user would, so that the page's own scripts
// (React, Vue, jQuery, ...) see the values.

import type {Site} from "../shared/types";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isShown(element: Element | null | undefined): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) {
    return false;
  }
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && element.getClientRects().length > 0;
}

export function isUsable(element: Element | null | undefined): element is HTMLInputElement {
  return element instanceof HTMLInputElement && isShown(element) && !element.disabled && !element.readOnly;
}

/** A selector set by the admin. A class attribute pasted as it is ("el-button login-btn") is read as those classes. */
export function query(selector: string): HTMLElement | null {
  const value = selector.trim();
  if (!value) {
    return null;
  }
  const candidates = [value];
  if (/^[\w-]+(\s+[\w-]+)*$/.test(value)) {
    candidates.push("." + value.split(/\s+/).join("."));
  }
  for (const candidate of candidates) {
    try {
      const element = document.querySelector<HTMLElement>(candidate);
      if (element) {
        return element;
      }
    } catch {
      // not a valid selector, try the next way of reading it
    }
  }
  return null;
}

function describe(element: Element): string {
  const attributes = ["name", "id", "placeholder", "autocomplete", "aria-label", "title", "class"];
  return attributes.map((name) => element.getAttribute(name) ?? "").join(" ");
}

function isTextInput(input: HTMLInputElement): boolean {
  return ["text", "email", "tel", "number", ""].includes((input.getAttribute("type") ?? "text").toLowerCase());
}

const usernameHints = /user|login|account|email|mail|phone|mobile|tel|name|uid|loginid|工号|账号|帳號|用户|用戶|手机|邮箱/i;
const submitHints = /^\s*(?:(?:立即|马上|安全|用户|账号)?\s*(?:登\s*录|登\s*入|登\s*陆)\s*(?:系统|平台)?|进入系统|log\s*in|log\s*on|sign\s*in|login|logon|signin|submit|确\s*定|提\s*交)\s*$/i;

export function findPassword(site: Site): HTMLInputElement | null {
  const configured = query(site.passwordSelector);
  if (configured instanceof HTMLInputElement) {
    return configured;
  }
  return [...document.querySelectorAll<HTMLInputElement>("input[type=password]")].find(isUsable) ?? null;
}

export function findUsername(site: Site, password: HTMLInputElement | null): HTMLInputElement | null {
  const configured = query(site.usernameSelector);
  if (configured instanceof HTMLInputElement) {
    return configured;
  }
  const scope: ParentNode = password?.form ?? document;
  const inputs = [...scope.querySelectorAll<HTMLInputElement>("input")].filter((input) => isTextInput(input) && isUsable(input));
  // the username comes before the password
  const before = password ? inputs.filter((input) => input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING) : inputs;
  const candidates = before.length > 0 ? before : inputs;
  const hinted = candidates.filter((input) => usernameHints.test(describe(input)));
  const list = hinted.length > 0 ? hinted : candidates;
  return list.at(-1) ?? null;
}

export function findSubmit(site: Site, password: HTMLInputElement | null): HTMLElement | null {
  const configured = query(site.submitSelector);
  if (configured) {
    return configured;
  }
  const form = password?.form;
  if (form) {
    const button = [...form.querySelectorAll<HTMLElement>("button, input[type=submit], input[type=image]")].find((element) => {
      const type = (element.getAttribute("type") ?? "submit").toLowerCase();
      return isShown(element) && (type === "submit" || type === "image");
    });
    if (button) {
      return button;
    }
  }
  // real buttons first, so that a link or a tab with the same words loses to the button
  for (const selector of ["button, input[type=button], input[type=submit]", "[role=button]", "a, div[onclick], span[onclick]"]) {
    const found = [...document.querySelectorAll<HTMLElement>(selector)].find((element) => {
      const text = element instanceof HTMLInputElement ? element.value : element.textContent ?? "";
      return isShown(element) && submitHints.test(text);
    });
    if (found) {
      return found;
    }
  }
  return null;
}

/** Types a value into an input through the native setter, so that frameworks that track the value see the change */
export function setValue(input: HTMLInputElement, value: string): void {
  input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: value}));
  input.dispatchEvent(new Event("change", {bubbles: true}));
  input.dispatchEvent(new KeyboardEvent("keyup", {bubbles: true}));
  input.blur();
}

export function submit(site: Site, password: HTMLInputElement): void {
  const button = findSubmit(site, password);
  if (button) {
    button.click();
    return;
  }
  for (const type of ["keydown", "keypress", "keyup"]) {
    password.dispatchEvent(new KeyboardEvent(type, {key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true}));
  }
  // a single-page app signs in from its own Enter handler and submitting its form would only reload the page, while a
  // server-side form says where it goes
  const form = password.form;
  if (form && (form.hasAttribute("action") || form.hasAttribute("method"))) {
    form.requestSubmit();
  }
}

/** Waits for something to appear on the page, like a sign-in form that a single-page app renders late */
export async function waitFor<T>(find: () => T | null, timeout: number): Promise<T | null> {
  const start = Date.now();
  for (;;) {
    const found = find();
    if (found) {
      return found;
    }
    if (Date.now() - start > timeout) {
      return null;
    }
    await sleep(250);
  }
}
