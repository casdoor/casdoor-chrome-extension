// Image captchas on sign-in pages: finding the input and the picture, reading the picture as it is shown (loading its
// address again would give a new captcha), and telling from the page whether a sign-in was refused for the captcha or
// for the password.

import {t} from "../shared/i18n";
import {request} from "../shared/messages";
import type {CaptchaCharset, Site} from "../shared/types";
import {isShown, isUsable, query, setValue, sleep} from "./dom";

const inputHints = /验证码|校验码|captcha|verif|vcode|checkcode|check_code|yzm|randcode|validcode|valicode|imgcode|authcode|securitycode|kaptcha/i;
const imageHints = /验证码|captcha|verif|vcode|checkcode|kaptcha|yzm|randcode|validcode|valicode|imgcode|authcode|code/i;
const captchaRefused = /(验证码|校验码|captcha|verification code|security code).{0,12}(错|不正确|不对|有误|无效|失效|过期|incorrect|invalid|wrong|expired)|(错误|不正确|无效|incorrect|invalid|wrong).{0,6}(验证码|captcha)/i;
const passwordRefused = /(密码|口令|账号|用户名|用户|password|username|account).{0,12}(错|不正确|不对|有误|不存在|锁定|incorrect|invalid|wrong|locked)|(incorrect|invalid|wrong|错误的?)\s*(user\s*name|username|account|password|密码|账号)/i;

export class CaptchaError extends Error {}

function describe(element: Element): string {
  return ["name", "id", "placeholder", "class", "aria-label", "autocomplete", "src", "alt", "title"].map((name) => element.getAttribute(name) ?? "").join(" ");
}

export function findCaptchaInput(site: Site, exclude: (HTMLInputElement | null)[]): HTMLInputElement | null {
  const configured = query(site.captchaSelector);
  if (configured instanceof HTMLInputElement) {
    return configured;
  }
  return (
    [...document.querySelectorAll<HTMLInputElement>("input")].find((input) => {
      if (!isUsable(input) || exclude.includes(input) || !["text", "tel", "number", ""].includes((input.getAttribute("type") ?? "text").toLowerCase())) {
        return false;
      }
      return inputHints.test(describe(input)) || /(^|[^a-z])code([^a-z]|$)/i.test(`${input.name} ${input.id}`);
    }) ?? null
  );
}

function center(element: Element): [number, number] {
  const rect = element.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

/** The picture the admin set, or an image or canvas of a captcha's size, hinted ones and the closest to the input first */
export function findCaptchaImage(site: Site, input: HTMLInputElement): HTMLImageElement | HTMLCanvasElement | null {
  const configured = query(site.captchaImageSelector);
  if (configured instanceof HTMLImageElement || configured instanceof HTMLCanvasElement) {
    return configured;
  }
  const [x, y] = center(input);
  const ranked = [...document.querySelectorAll<HTMLImageElement | HTMLCanvasElement>("img, canvas")]
    .filter((element) => {
      if (!isShown(element)) {
        return false;
      }
      const {width, height} = element.getBoundingClientRect();
      return width >= 40 && width <= 320 && height >= 15 && height <= 120;
    })
    .map((element) => {
      const [cx, cy] = center(element);
      return {element, score: Math.hypot(cx - x, cy - y) - (imageHints.test(describe(element)) ? 10000 : 0)};
    })
    .sort((a, b) => a.score - b.score);
  return ranked[0]?.element ?? null;
}

async function waitForImage(image: HTMLImageElement, timeout: number): Promise<void> {
  if (image.complete && image.naturalWidth > 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), {once: true});
    image.addEventListener("error", () => resolve(), {once: true});
    setTimeout(resolve, timeout);
  });
}

async function readImage(image: HTMLImageElement | HTMLCanvasElement): Promise<string> {
  if (image instanceof HTMLCanvasElement) {
    return image.toDataURL("image/png");
  }
  await waitForImage(image, 3000);
  if (!image.naturalWidth) {
    throw new CaptchaError(t("captchaNoImage"));
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    // a picture from another site without CORS can't be read
    throw new CaptchaError(t("captchaCrossOrigin"));
  }
}

function guessCharset(site: Site, input: HTMLInputElement): CaptchaCharset {
  if (site.captchaCharset) {
    return site.captchaCharset;
  }
  const label = input.closest("label, .el-form-item, .ant-form-item, .form-group, tr, li");
  const text = `${input.placeholder} ${input.getAttribute("aria-label") ?? ""} ${input.title} ${label?.textContent ?? ""}`;
  return /数字|digit|number/i.test(text) ? "Digits" : "Alphanumeric";
}

/** Reads the captcha and types it in, returns the picture that was read */
export async function solveCaptcha(site: Site, input: HTMLInputElement): Promise<string> {
  const image = findCaptchaImage(site, input);
  if (!image) {
    throw new CaptchaError(t("captchaNoImage"));
  }
  const picture = await readImage(image);
  let text = await request("page/captcha", {application: site.application, image: picture, charset: guessCharset(site, input)});
  if (input.maxLength > 0 && text.length > input.maxLength) {
    text = text.slice(0, input.maxLength);
  }
  setValue(input, text);
  return picture;
}

/** A new captcha after a refused one: most pages change it when the picture is clicked, some already did */
export async function newCaptcha(site: Site, input: HTMLInputElement, previous: string): Promise<void> {
  const image = findCaptchaImage(site, input);
  if (!image) {
    return;
  }
  const current = await readImage(image).catch(() => "");
  if (current && current !== previous) {
    return;
  }
  image.click();
  for (let i = 0; i < 15; i++) {
    await sleep(200);
    const latest = findCaptchaImage(site, input);
    if (latest instanceof HTMLImageElement) {
      await waitForImage(latest, 1000);
    }
    const picture = latest ? await readImage(latest).catch(() => "") : "";
    if (picture && picture !== previous) {
      return;
    }
  }
}

export type Refusal = "captcha" | "password" | "unknown";

/** Why the page refused a sign-in, from the text that appeared after it was submitted */
export function readRefusal(textBefore: string): Refusal {
  const now = document.body.innerText;
  // a page loaded after the sign-in has all of its text new
  const added = textBefore ? now.split(textBefore).join(" ") : now;
  if (captchaRefused.test(added) || captchaRefused.test(now)) {
    return "captcha";
  }
  return passwordRefused.test(added) ? "password" : "unknown";
}
