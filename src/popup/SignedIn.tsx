import {useState} from "react";
import {t} from "../shared/i18n";
import {getEntryUrl} from "../shared/match";
import {request} from "../shared/messages";
import type {Site, Status} from "../shared/types";
import type {ActiveTab} from "./App";
import {Button, ExternalIcon, Logo, Notice, Switch, cn} from "./components/ui";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function describeSite(site: Site): string {
  if (site.accounts.length === 0) {
    return t("siteSaveOnFirst");
  }
  return site.accounts.length === 1 ? site.accounts[0] : t("siteAccounts", site.accounts.length);
}

function SiteRow({site}: {site: Site}) {
  const url = getEntryUrl(site);
  const content = (
    <>
      <Logo src={site.logo} name={site.displayName} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{site.displayName}</span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{describeSite(site)}</span>
      </span>
      {url && <ExternalIcon className="shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" />}
    </>
  );
  const className = "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left";
  if (!url) {
    return <div className={className}>{content}</div>;
  }
  return (
    <button type="button" className={cn(className, "hover:bg-zinc-50 dark:hover:bg-zinc-900")} onClick={() => chrome.tabs.create({url}).then(() => window.close())} title={hostOf(url)}>
      {content}
    </button>
  );
}

export function SignedIn({status, tab, onStatus, onReload, onFillTab}: {status: Status; tab: ActiveTab | null; onStatus: (status: Status) => void; onReload: () => Promise<void>; onFillTab: () => Promise<void>}) {
  const [busy, setBusy] = useState("");
  const user = status.user!;

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try {
      await action();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-col">
      <section className="flex items-center gap-3 px-4 py-3">
        <Logo src={user.avatar} name={user.displayName} size={36} rounded="rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{user.displayName}</div>
          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {user.owner}/{user.name}
          </div>
        </div>
        <Button variant="ghost" className="h-8 px-2.5 text-xs" loading={busy === "signOut"} onClick={() => run("signOut", async () => onStatus(await request("popup/signOut", {})))}>
          {t("signOut")}
        </Button>
      </section>

      <section className="mx-4 flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t("autofillLabel")}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{status.autofill ? t("autofillOn") : t("autofillOff")}</div>
        </div>
        <Switch checked={status.autofill} label={t("autofillLabel")} onChange={(enabled) => void request("popup/autofill", {enabled}).then(onStatus)} />
      </section>

      {tab?.site && (
        <section className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2.5 dark:bg-brand-500/10">
          <Logo src={tab.site.logo} name={tab.site.displayName} />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-brand-700 dark:text-brand-100">{t("thisPage")}</div>
            <div className="truncate font-medium">{tab.site.displayName}</div>
          </div>
          {tab.site.accounts.length > 0 && (
            <Button className="h-8 px-3 text-xs" loading={busy === "fill"} onClick={() => run("fill", onFillTab)}>
              {t("fillNow")}
            </Button>
          )}
        </section>
      )}

      <div className="space-y-3 px-4 pt-3">
        {!status.full && <Notice title={t("basicTitle")}>{t("basicBody")}</Notice>}
        {status.error && (
          <Notice tone="error" title={t("loadFailed")}>
            {status.error}
          </Notice>
        )}
      </div>

      <section className="px-2 pb-2 pt-3">
        <div className="flex items-center justify-between px-2 pb-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t("systemsTitle")} {status.sites.length > 0 && <span className="font-normal">({status.sites.length})</span>}
          </h2>
          <Button variant="ghost" className="h-7 px-2 text-xs" loading={busy === "reload"} onClick={() => run("reload", onReload)}>
            {t("refresh")}
          </Button>
        </div>
        {status.sites.length > 0 ? (
          <div className="max-h-[260px] overflow-y-auto">
            {status.sites.map((site) => (
              <SiteRow key={site.application} site={site} />
            ))}
          </div>
        ) : (
          !status.error && (
            <div className="mx-2 rounded-lg border border-dashed border-zinc-200 px-4 py-5 text-center dark:border-zinc-800">
              <div className="font-medium">{t("emptyTitle")}</div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t("emptyBody")}</div>
            </div>
          )
        )}
      </section>

      <footer className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5 text-xs text-zinc-500 dark:border-zinc-900 dark:text-zinc-400">
        <a className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100" href={`${status.connection.serverUrl}/account`} target="_blank" rel="noreferrer">
          {hostOf(status.connection.serverUrl)}
          <ExternalIcon />
        </a>
        <span>v{chrome.runtime.getManifest().version}</span>
      </footer>
    </div>
  );
}
