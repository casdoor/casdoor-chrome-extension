// On a sign-in page of one of the user's systems, the extension keeps the account away from the browser's developer
// tools as far as a page can: their shortcuts and the context menu with "Inspect" are blocked, no password is filled
// while they are open, and a filled password is taken out again when they open. The tools can still be opened from the
// browser's menu, and when they are undocked into their own window a page can't tell, so this raises the bar and is
// not a lock.

import {t} from "../shared/i18n";
import {request} from "../shared/messages";
import {setValue} from "./dom";
import {showCard} from "./overlay";

/** Wider than the browser's own frame and bars around a page, narrower than docked developer tools */
const WIDTH_GAP = 200;
const HEIGHT_GAP = 260;

let guarded = false;
let zoom = 1;
let warned = false;
const filled = new Map<HTMLInputElement, string>();
/** The passwords taken out when the developer tools opened, put back once they are closed */
const taken = new Map<HTMLInputElement, string>();
const waiting: (() => void)[] = [];

export function isGuarded(): boolean {
  return guarded;
}

/**
 * Docked developer tools take their room from the page. Only the top frame can tell, a frame only knows its own size.
 * The browser's side panel takes room the same way, so it counts as open too.
 */
export function isDevtoolsOpen(): boolean {
  if (!guarded || window !== window.top) {
    return false;
  }
  return window.outerWidth - window.innerWidth * zoom > WIDTH_GAP || window.outerHeight - window.innerHeight * zoom > HEIGHT_GAP;
}

function isDevtoolsKey(event: KeyboardEvent): boolean {
  const code = event.code;
  // not Ctrl+Alt, which is AltGr on Windows and types letters like "ć"
  const windows = event.ctrlKey && !event.altKey;
  const mac = event.metaKey && event.altKey;
  return (
    code === "F12" ||
    // Ctrl+Shift+I, J, C on Windows and Linux, Cmd+Option+I, J, C on macOS
    (((windows && event.shiftKey) || mac) && (code === "KeyI" || code === "KeyJ" || code === "KeyC")) ||
    // the page source, Ctrl+U and Cmd+Option+U
    ((windows || mac) && code === "KeyU")
  );
}

function block(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** A password the extension filled, to take out again when the developer tools open */
export function rememberFilled(input: HTMLInputElement, value: string): void {
  filled.set(input, value);
}

/** Takes the password out after a sign-in that left the form on the page, e.g. a single-page app that was refused */
export function clearLater(input: HTMLInputElement, value: string, delay = 1500): void {
  setTimeout(() => {
    filled.delete(input);
    if (guarded && input.isConnected && input.value === value) {
      setValue(input, "");
    }
  }, delay);
}

function check(): void {
  if (!isDevtoolsOpen()) {
    warned = false;
    for (const [input, value] of taken) {
      if (input.isConnected && input.value === "") {
        setValue(input, value);
        filled.set(input, value);
      }
    }
    taken.clear();
    while (waiting.length > 0) {
      waiting.shift()?.();
    }
    return;
  }
  for (const [input, value] of filled) {
    if (input.isConnected && input.value === value) {
      setValue(input, "");
      taken.set(input, value);
    }
  }
  filled.clear();
  if (!warned) {
    warned = true;
    showCard({tone: "warning", title: t("devtoolsTitle"), body: t("devtoolsBody"), duration: 0});
  }
}

/** Resolves once the developer tools are closed, at once when they are */
export function whenDevtoolsClosed(): Promise<void> {
  if (!isDevtoolsOpen()) {
    return Promise.resolve();
  }
  check();
  return new Promise((resolve) => waiting.push(resolve));
}

async function readZoom(): Promise<void> {
  zoom = await request("page/zoom", {}).catch(() => zoom);
  check();
}

export async function startGuard(): Promise<void> {
  if (guarded) {
    return;
  }
  guarded = true;
  window.addEventListener("keydown", (event) => isDevtoolsKey(event) && block(event), true);
  window.addEventListener("contextmenu", block, true);
  if (window === window.top) {
    await readZoom();
    // zooming the page resizes it too
    window.addEventListener("resize", () => void readZoom());
    setInterval(check, 1000);
  }
}
