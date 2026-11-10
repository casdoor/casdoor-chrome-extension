// Image captchas are read by a model in an offscreen document (src/offscreen), on the user's own computer, because a
// service worker has no canvas to turn the picture into the model's input.

import {RequestError} from "../shared/messages";
import type {CaptchaCharset} from "../shared/types";

const OFFSCREEN_PATH = "offscreen/index.html";
const MAX_IMAGE_LENGTH = 2 * 1024 * 1024;

let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [url]});
  if (contexts.length > 0) {
    return;
  }
  creating ??= chrome.offscreen
    .createDocument({url: OFFSCREEN_PATH, reasons: [chrome.offscreen.Reason.WORKERS], justification: "Reads the image captcha of a sign-in page with a local model"})
    .finally(() => {
      creating = null;
    });
  await creating;
}

export interface RecognizeRequest {
  target: "offscreen";
  image: string;
  charset: CaptchaCharset;
}

export async function recognizeCaptcha(image: string, charset: CaptchaCharset): Promise<string> {
  if (!image.startsWith("data:image/") || image.length > MAX_IMAGE_LENGTH) {
    throw new RequestError("Not a captcha picture");
  }
  await ensureOffscreen();
  const reply = (await chrome.runtime.sendMessage({target: "offscreen", image, charset} satisfies RecognizeRequest)) as {text?: string; error?: string} | undefined;
  if (!reply?.text) {
    throw new RequestError(reply?.error || "The captcha could not be read");
  }
  return reply.text;
}
