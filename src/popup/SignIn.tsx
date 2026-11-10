import {useState, type FormEvent} from "react";
import {t} from "../shared/i18n";
import {request, RequestError} from "../shared/messages";
import type {Status} from "../shared/types";
import {Button, CopyButton, Field, Input, Notice} from "./components/ui";

function describeError(error: unknown): string {
  if (error instanceof RequestError && error.code === "cancelled") {
    return t("signInCancelled");
  }
  return error instanceof Error ? error.message : String(error);
}

export function SignIn({status, onStatus}: {status: Status; onStatus: (status: Status) => void}) {
  const [serverUrl, setServerUrl] = useState(status.connection.serverUrl);
  const [application, setApplication] = useState(status.connection.application);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(status.error);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onStatus(await request("popup/signIn", {serverUrl, application}));
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4 px-4 pb-4 pt-5" onSubmit={submit}>
      <div>
        <h1 className="text-base font-semibold tracking-tight">{t("signInTitle")}</h1>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t("signInIntro")}</p>
      </div>

      {status.managed && <Notice>{t("managedNotice")}</Notice>}

      <Field label={t("serverUrlLabel")}>
        <Input
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="https://door.example.com"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
          disabled={status.managed}
          required
          autoFocus={!status.managed && !serverUrl}
        />
      </Field>
      <Field label={t("applicationLabel")} hint={t("applicationHint")}>
        <Input
          type="text"
          autoComplete="off"
          placeholder="app-built-in"
          value={application}
          onChange={(event) => setApplication(event.target.value)}
          disabled={status.managed && !!status.connection.application}
          required
        />
      </Field>

      {error && <Notice tone="error">{error}</Notice>}

      <Button type="submit" className="w-full" loading={busy}>
        {t("signInButton")}
      </Button>

      {!status.official && (
        <details className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <summary className="cursor-pointer select-none font-medium text-zinc-700 dark:text-zinc-300">{t("redirectTitle")}</summary>
          <p className="mt-2 leading-5">{t("redirectBody")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11px] dark:bg-zinc-900">{status.redirectUrl}</code>
            <CopyButton text={status.redirectUrl} label={t("copy")} copiedLabel={t("copied")} />
          </div>
        </details>
      )}
    </form>
  );
}
