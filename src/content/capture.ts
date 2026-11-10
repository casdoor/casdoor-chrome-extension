// When the admin lets users save their accounts, the account that the user signs in with by hand is held by the
// service worker for two minutes, and saved to Casdoor only if the user says so once the sign-in went through.

import {t} from "../shared/i18n";
import {request} from "../shared/messages";
import type {Site} from "../shared/types";
import {findPassword, findUsername, isUsable} from "./dom";
import {closeCard, showCard} from "./overlay";

let watched = "";

export function watchSignIn(site: Site): void {
  if (watched === site.application) {
    return;
  }
  watched = site.application;
  const grab = () => {
    const password = findPassword(site);
    if (!password?.value) {
      return;
    }
    const username = findUsername(site, password)?.value.trim() ?? "";
    if (!username) {
      return;
    }
    void request("page/capture", {application: site.application, username, password: password.value}).catch(() => null);
    // a single-page app signs in without loading a new page
    setTimeout(() => void offerSave(), 3000);
  };
  document.addEventListener("submit", grab, true);
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("button, input[type=submit], input[type=button], input[type=image], a, [role=button]")) {
      grab();
    }
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      grab();
    }
  }, true);
}

let offered = false;

export async function offerSave(): Promise<void> {
  if (offered) {
    return;
  }
  const pending = await request("page/pending", {}).catch(() => null);
  // still on a sign-in form: the password was wrong, or the page has not moved on yet
  if (!pending || [...document.querySelectorAll("input[type=password]")].some(isUsable)) {
    return;
  }
  offered = true;
  showCard({
    tone: "info",
    title: t("saveTitle", pending.displayName),
    body: t("saveBody", pending.username),
    duration: 0,
    actions: [
      {
        label: t("saveSkip"),
        onClick: () => {
          closeCard();
          void request("page/resolve", {save: false}).catch(() => null);
        },
      },
      {
        label: t("saveConfirm"),
        primary: true,
        onClick: async () => {
          try {
            await request("page/resolve", {save: true});
            showCard({tone: "success", title: t("savedTitle"), body: t("savedBody", pending.displayName)});
          } catch (error) {
            showCard({tone: "error", title: t("saveFailedTitle"), body: error instanceof Error ? error.message : String(error), duration: 0});
          }
        },
      },
    ],
  });
}
