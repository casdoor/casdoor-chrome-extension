// The cards that the extension shows on a sign-in page. They live in a closed shadow root, so that the page's styles
// don't change them and the page's scripts can't read or click them.

import logo from "../../public/icons/icon32.png?inline";
import {t} from "../shared/i18n";

export type Tone = "info" | "success" | "warning" | "error";

export interface CardAction {
  label: string;
  primary?: boolean;
  onClick: () => void | Promise<void>;
}

export interface Card {
  tone: Tone;
  title: string;
  body?: string;
  /** Extra lines, e.g. a selector of the admin that matched nothing */
  notes?: string[];
  /** Usernames to switch to */
  accounts?: {current: string; others: string[]; onPick: (username: string) => void};
  actions?: CardAction[];
  /** Closes by itself after this many milliseconds, 0 keeps it open */
  duration?: number;
}

const styles = `
:host { all: initial; }
.card {
  --bg: #ffffff; --fg: #18181b; --muted: #52525b; --line: #e4e4e7; --soft: #f4f4f5;
  --brand: #5a3fe0; --brand-fg: #ffffff; --accent: var(--brand);
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: 340px; max-width: calc(100vw - 32px); box-sizing: border-box;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 12px 32px rgba(15,15,30,.16);
  font: 13px/1.5 Inter, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  overflow: hidden; animation: enter .22s cubic-bezier(.2,.8,.2,1);
}
@media (prefers-color-scheme: dark) {
  .card { --bg: #1c1c22; --fg: #f4f4f5; --muted: #a1a1aa; --line: #2e2e37; --soft: #26262e; --brand: #8b78ff; --brand-fg: #0f0f14; }
}
.card[data-tone="success"] { --accent: #16a34a; }
.card[data-tone="warning"] { --accent: #d97706; }
.card[data-tone="error"] { --accent: #dc2626; }
.card.leaving { animation: leave .18s ease-in forwards; }
@keyframes enter { from { opacity: 0; transform: translateY(-8px) scale(.98); } }
@keyframes leave { to { opacity: 0; transform: translateY(-8px) scale(.98); } }
.head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 0 14px; }
.logo { width: 18px; height: 18px; flex: none; }
.brand { font-size: 12px; font-weight: 600; color: var(--muted); letter-spacing: .01em; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); margin-left: 2px; }
.close { margin-left: auto; border: 0; background: transparent; color: var(--muted); width: 26px; height: 26px; border-radius: 8px; cursor: pointer; font-size: 18px; line-height: 1; }
.close:hover { background: var(--soft); color: var(--fg); }
.main { padding: 6px 14px 14px; }
.title { font-size: 14px; font-weight: 600; margin: 0; }
.body { margin: 2px 0 0; color: var(--muted); white-space: pre-line; }
.notes { margin: 8px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--soft); color: var(--muted); font-size: 12px; }
.notes p { margin: 0; }
.notes p + p { margin-top: 4px; }
.accounts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.chip { border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.chip:hover { border-color: var(--brand); color: var(--brand); }
.chip[aria-current="true"] { background: var(--soft); border-color: transparent; cursor: default; color: var(--fg); font-weight: 600; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.button { border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 8px; padding: 6px 12px; font: inherit; font-weight: 500; cursor: pointer; }
.button:hover { background: var(--soft); }
.button.primary { background: var(--brand); border-color: var(--brand); color: var(--brand-fg); }
.button.primary:hover { filter: brightness(1.08); }
.button:disabled { opacity: .6; cursor: progress; }
.timer { height: 2px; background: var(--accent); transform-origin: left; animation: timer linear forwards; opacity: .55; }
@keyframes timer { to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) { .card, .card.leaving, .timer { animation: none; } }
`;

type Host = HTMLElement & {card?: HTMLElement};

let host: Host | null = null;
let closeTimer = 0;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function closeCard(): void {
  window.clearTimeout(closeTimer);
  const leaving = host;
  host = null;
  if (!leaving) {
    return;
  }
  // the shadow root is closed, so the card is kept on its host
  leaving.card?.classList.add("leaving");
  window.setTimeout(() => leaving.remove(), 180);
}

export function showCard(card: Card): void {
  if (window.top !== window && window.innerWidth < 360) {
    // a frame too small for the card, like a sign-in box in an iframe: the page keeps its form and the card is skipped
    return;
  }
  closeCard();
  const next = document.createElement("casdoor-autofill") as Host;
  // the end-to-end test builds with an open root to click the cards
  const root = next.attachShadow({mode: import.meta.env.MODE === "e2e" ? "open" : "closed"});
  const style = document.createElement("style");
  style.textContent = styles;

  const box = element("section", "card");
  box.dataset.tone = card.tone;
  box.setAttribute("role", card.tone === "error" || card.tone === "warning" ? "alert" : "status");

  const head = element("div", "head");
  const image = element("img", "logo");
  image.src = logo;
  image.alt = "";
  const close = element("button", "close", "×");
  close.setAttribute("aria-label", t("close"));
  close.addEventListener("click", closeCard);
  head.append(image, element("span", "brand", "Casdoor"), element("span", "dot"), close);

  const main = element("div", "main");
  main.append(element("p", "title", card.title));
  if (card.body) {
    main.append(element("p", "body", card.body));
  }
  if (card.notes?.length) {
    const notes = element("div", "notes");
    for (const note of card.notes) {
      notes.append(element("p", "", note));
    }
    main.append(notes);
  }
  if (card.accounts && card.accounts.others.length > 0) {
    const row = element("div", "accounts");
    const {current, others, onPick} = card.accounts;
    const all = current ? [current, ...others] : others;
    for (const username of all.slice(0, 6)) {
      const chip = element("button", "chip", username);
      if (username === current) {
        chip.setAttribute("aria-current", "true");
      } else {
        chip.addEventListener("click", () => {
          closeCard();
          onPick(username);
        });
      }
      row.append(chip);
    }
    main.append(row);
  }
  if (card.actions?.length) {
    const row = element("div", "actions");
    for (const action of card.actions) {
      const button = element("button", action.primary ? "button primary" : "button", action.label);
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await action.onClick();
        } finally {
          button.disabled = false;
        }
      });
      row.append(button);
    }
    main.append(row);
  }
  box.append(head, main);

  const duration = card.duration ?? 6000;
  if (duration > 0) {
    const timer = element("div", "timer");
    timer.style.animationDuration = `${duration}ms`;
    box.append(timer);
    // a card the user is reading stays
    let remaining = duration;
    let startedAt = Date.now();
    const schedule = () => {
      closeTimer = window.setTimeout(closeCard, remaining);
    };
    box.addEventListener("mouseenter", () => {
      window.clearTimeout(closeTimer);
      remaining -= Date.now() - startedAt;
      timer.style.animationPlayState = "paused";
    });
    box.addEventListener("mouseleave", () => {
      startedAt = Date.now();
      timer.style.animationPlayState = "running";
      schedule();
    });
    schedule();
  }

  root.append(style, box);
  next.card = box;
  (document.body ?? document.documentElement).append(next);
  host = next;
}
