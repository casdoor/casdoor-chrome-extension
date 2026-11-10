// The messages to the service worker. It is the only part that talks to Casdoor and holds the tokens: a content script
// can only ask about the frame it runs in, and the popup about the extension itself.

import type {Account, CaptchaCharset, Connection, PagePlan, PendingAccount, Status, TabInfo} from "./types";

export interface Requests {
  // from content scripts, about their own frame
  "page/plan": {request: {manual: boolean}; response: PagePlan | null};
  "page/account": {request: {application: string; username: string; captcha: boolean}; response: Account};
  "page/submitted": {request: {application: string}; response: null};
  "page/captcha": {request: {application: string; image: string; charset: CaptchaCharset}; response: string};
  "page/capture": {request: {application: string; username: string; password: string}; response: null};
  "page/pending": {request: Record<string, never>; response: PendingAccount | null};
  "page/resolve": {request: {save: boolean}; response: boolean};

  // from the popup
  "popup/status": {request: {refresh: boolean}; response: Status};
  "popup/tab": {request: {tabId: number; url: string}; response: TabInfo};
  "popup/signIn": {request: Connection; response: Status};
  "popup/signOut": {request: Record<string, never>; response: Status};
  "popup/autofill": {request: {enabled: boolean}; response: Status};
}

export type RequestType = keyof Requests;

export interface Message<T extends RequestType = RequestType> {
  type: T;
  payload: Requests[T]["request"];
  /** The address of the page that a content script runs in */
  url?: string;
}

export type Reply<T extends RequestType = RequestType> =
  | {ok: true; data: Requests[T]["response"]}
  | {ok: false; error: string; code?: string};

/** Sent by the popup to a tab's content scripts */
export interface FillNow {
  type: "content/fill";
}

export class RequestError extends Error {
  constructor(message: string, readonly code = "") {
    super(message);
  }
}

export async function request<T extends RequestType>(type: T, payload: Requests[T]["request"]): Promise<Requests[T]["response"]> {
  let reply: Reply<T> | undefined;
  try {
    reply = await chrome.runtime.sendMessage({type, payload, url: location.href} satisfies Message<T>);
  } catch {
    // the extension was updated or reloaded, and this script is left behind
    throw new RequestError("The extension was updated, please reload the page", "orphaned");
  }
  if (!reply) {
    throw new RequestError("No reply from the extension");
  }
  if (!reply.ok) {
    throw new RequestError(reply.error, reply.code);
  }
  return reply.data;
}
