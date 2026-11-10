import type messages from "../../public/_locales/en/messages.json";

export type MessageKey = keyof typeof messages;

/** The text of a message in the browser's language, with $1, $2, ... replaced by the values */
export function t(key: MessageKey, ...values: (string | number)[]): string {
  return chrome.i18n.getMessage(key, values.map(String)) || key;
}
