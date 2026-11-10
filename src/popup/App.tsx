import {useCallback, useEffect, useState} from "react";
import {t} from "../shared/i18n";
import {request, type FillNow} from "../shared/messages";
import type {Site, Status} from "../shared/types";
import {SignedIn} from "./SignedIn";
import {SignIn} from "./SignIn";
import {Spinner} from "./components/ui";

export interface ActiveTab {
  id: number;
  site: Site | null;
}

async function getActiveTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    return null;
  }
  const {site} = await request("popup/tab", {tabId: tab.id, url: tab.url}).catch(() => ({site: null}));
  return {id: tab.id, site};
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<ActiveTab | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async (refresh: boolean) => {
    try {
      const next = await request("popup/status", {refresh});
      setStatus(next);
      setTab(next.user ? await getActiveTab() : null);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const fillTab = useCallback(async () => {
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, {type: "content/fill"} satisfies FillNow).catch(() => undefined);
      window.close();
    }
  }, [tab]);

  return (
    <div className="flex min-h-[200px] flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-900">
        <img src="/icons/icon32.png" alt="" className="h-6 w-6" />
        <span className="text-[15px] font-semibold tracking-tight">Casdoor</span>
        <span className="ml-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">{t("popupBadge")}</span>
      </header>
      {!status ? (
        <div className="flex flex-1 items-center justify-center p-8 text-zinc-400">{loadError ? <span className="text-red-600">{loadError}</span> : <Spinner className="h-5 w-5" />}</div>
      ) : status.user ? (
        <SignedIn status={status} tab={tab} onStatus={setStatus} onReload={() => load(true)} onFillTab={fillTab} />
      ) : (
        <SignIn status={status} onStatus={setStatus} />
      )}
    </div>
  );
}
