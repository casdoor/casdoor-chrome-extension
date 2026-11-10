// Runs in every frame. It asks the service worker whether the frame is a sign-in page of one of the user's systems, and
// does nothing else on other pages: it reads nothing and sends nothing.

import {request, type FillNow} from "../shared/messages";
import type {PagePlan} from "../shared/types";
import {offerSave, watchSignIn} from "./capture";
import {fill} from "./fill";

declare global {
  interface Window {
    casdoorAutofill?: boolean;
  }
}

async function getPlan(manual = false): Promise<PagePlan | null> {
  return request("page/plan", {manual}).catch(() => null);
}

let checkedUrl = "";

async function check(): Promise<void> {
  if (checkedUrl === location.href) {
    return;
  }
  checkedUrl = location.href;
  void offerSave();
  const plan = await getPlan();
  if (!plan) {
    return;
  }
  if (plan.site.accounts.length > 0) {
    await fill(plan);
  } else if (plan.canSave) {
    watchSignIn(plan.site);
  }
}

if (!window.casdoorAutofill) {
  window.casdoorAutofill = true;

  chrome.runtime.onMessage.addListener((message: FillNow) => {
    if (message?.type !== "content/fill") {
      return false;
    }
    void getPlan(true).then((plan) => plan && fill(plan, {manual: true}));
    return false;
  });

  void check();
  // single-page apps change the address without loading a page
  setInterval(() => void check(), 1000);
}
