// Filling a sign-in form with the user's account from Casdoor, and signing in when the admin turned that on

import {t} from "../shared/i18n";
import {request} from "../shared/messages";
import type {Account, PagePlan, Site} from "../shared/types";
import {CaptchaError, findCaptchaInput, newCaptcha, readRefusal, solveCaptcha} from "./captcha";
import {findPassword, findUsername, isShown, isUsable, query, setValue, sleep, submit, waitFor} from "./dom";
import {showCard, type Card} from "./overlay";

const MAX_CAPTCHA_TRIES = 3;

export interface FillOptions {
  /** The account the user picked */
  username?: string;
  /** Started by the user, from the popup or by picking an account, rather than by opening the page */
  manual?: boolean;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The selectors of the admin that match nothing on this page, so that a wrong one doesn't go unnoticed */
function missingSelectors(site: Site): string[] {
  const fields: [string, string][] = [
    [site.usernameSelector, t("fieldUsername")],
    [site.passwordSelector, t("fieldPassword")],
    [site.autoSubmit ? site.submitSelector : "", t("fieldSubmit")],
    [site.captcha ? site.captchaSelector : "", t("fieldCaptcha")],
    [site.captcha ? site.captchaImageSelector : "", t("fieldCaptchaImage")],
  ];
  return fields.filter(([selector]) => selector.trim() && !query(selector)).map(([selector, field]) => t("selectorMissing", field, selector));
}

function accountSwitcher(plan: PagePlan, current: string): Card["accounts"] {
  const others = plan.site.accounts.filter((username) => username !== current);
  if (others.length === 0) {
    return undefined;
  }
  return {current, others, onPick: (username) => void fill(plan, {username, manual: true})};
}

function chooseAccount(plan: PagePlan): void {
  showCard({
    tone: "info",
    title: t("chooseAccountTitle", plan.site.displayName),
    body: t("chooseAccountBody"),
    accounts: {current: "", others: plan.site.accounts, onPick: (username) => void fill(plan, {username, manual: true})},
    duration: 0,
  });
}

export async function fill(plan: PagePlan, options: FillOptions = {}): Promise<void> {
  const {site} = plan;
  // a page of the system without a sign-in form, e.g. when the pattern ends with "*", or a form that shows up late
  const password = await waitFor(() => {
    const found = findPassword(site);
    return isUsable(found) ? found : null;
  }, options.manual ? 3000 : 15000);
  if (!password) {
    if (options.manual) {
      showCard({tone: "warning", title: t("noFormTitle"), body: t("noFormBody", site.displayName)});
    }
    return;
  }
  if (site.accounts.length === 0) {
    return;
  }
  if (!options.username && !plan.preferredAccount && site.accounts.length > 1) {
    chooseAccount(plan);
    return;
  }

  let account: Account;
  try {
    account = await request("page/account", {
      application: site.application,
      username: options.username || plan.preferredAccount || site.accounts[0],
      captcha: site.captcha,
    });
  } catch (error) {
    showCard({tone: "error", title: t("fillFailedTitle", site.displayName), body: errorText(error), duration: 0});
    return;
  }

  const usernameInput = findUsername(site, password);
  if (usernameInput) {
    setValue(usernameInput, account.username);
  }
  setValue(password, account.password);

  let captchaInput: HTMLInputElement | null = null;
  let picture = "";
  let captchaProblem = "";
  if (site.captcha) {
    captchaInput = findCaptchaInput(site, [usernameInput, password]);
    if (!captchaInput) {
      captchaProblem = t("captchaNoInput");
    } else {
      try {
        picture = await solveCaptcha(site, captchaInput);
      } catch (error) {
        captchaProblem = errorText(error);
      }
    }
  }

  const notes = missingSelectors(site);
  if (captchaProblem) {
    notes.push(t("captchaManual", captchaProblem));
  }
  const accounts = accountSwitcher(plan, account.username);

  if (plan.recentlySubmitted && !options.manual) {
    // the page came back after an automatic sign-in: a server-side form shows why on the page it loads
    const refusal = readRefusal("");
    if (refusal === "password") {
      showCard({tone: "error", title: t("refusedTitle", site.displayName), body: t("refusedBody"), accounts, duration: 0});
      return;
    }
    if (refusal !== "captcha" || !picture || plan.submitCount >= MAX_CAPTCHA_TRIES) {
      showCard(
        refusal === "captcha"
          ? {tone: "warning", title: t("captchaGaveUpTitle"), body: t("captchaGaveUpBody", plan.submitCount), duration: 0}
          : {tone: "warning", title: t("cameBackTitle"), body: t("cameBackBody", site.displayName), notes, accounts, duration: 0},
      );
      if (refusal === "captcha" && captchaInput) {
        setValue(captchaInput, "");
        captchaInput.focus();
      }
      return;
    }
    // a wrong captcha is tried again with the new one of this page
  }
  if (!site.autoSubmit || captchaProblem) {
    showCard({tone: captchaProblem ? "warning" : "success", title: t("filledTitle", site.displayName), body: t("filledBody", account.username), notes, accounts, duration: notes.length > 0 ? 0 : 6000});
    captchaInput?.focus();
    return;
  }

  showCard({tone: "success", title: t("signingInTitle", site.displayName), body: t("filledBody", account.username), notes, accounts, duration: 4000});
  await sleep(500);
  await request("page/submitted", {application: site.application}).catch(() => null);
  const textBefore = document.body.innerText;
  submit(site, password);
  if (captchaInput && picture) {
    await retryCaptcha(site, account, captchaInput, picture, textBefore);
  }
}

/**
 * After a sign-in with a captcha that was read: still on the sign-in form means it was refused. A wrong captcha is
 * tried again with a new one, a wrong password is not, so that the account doesn't get locked.
 */
async function retryCaptcha(site: Site, account: Account, input: HTMLInputElement, picture: string, textBefore: string): Promise<void> {
  const url = location.href;
  for (let attempt = 1; ; attempt++) {
    await sleep(2500);
    const password = findPassword(site);
    if (location.href !== url || !isShown(password)) {
      return;
    }
    const refusal = readRefusal(textBefore);
    const currentInput = isShown(input) ? input : findCaptchaInput(site, [findUsername(site, password), password]);
    if (refusal === "password" || attempt >= MAX_CAPTCHA_TRIES || (refusal === "unknown" && attempt >= 2) || !currentInput) {
      if (currentInput) {
        setValue(currentInput, "");
        currentInput.focus();
      }
      showCard(
        refusal === "password"
          ? {tone: "error", title: t("refusedTitle", site.displayName), body: t("refusedBody"), duration: 0}
          : {tone: "warning", title: t("captchaGaveUpTitle"), body: t("captchaGaveUpBody", attempt), duration: 0},
      );
      return;
    }
    if (!password.value) {
      setValue(password, account.password);
    }
    try {
      await newCaptcha(site, currentInput, picture);
      picture = await solveCaptcha(site, currentInput);
    } catch (error) {
      currentInput.focus();
      showCard({tone: "warning", title: t("captchaManualTitle"), body: error instanceof CaptchaError ? error.message : errorText(error), duration: 0});
      return;
    }
    textBefore = document.body.innerText;
    await sleep(300);
    submit(site, password);
  }
}
