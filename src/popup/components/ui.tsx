import type {ButtonHTMLAttributes, InputHTMLAttributes, ReactNode} from "react";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Spinner({className}: {className?: string}) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600",
  secondary: "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
};

export function Button({variant = "primary", loading, className, children, disabled, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?: Variant; loading?: boolean}) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Field({label, hint, children}: {label: string; hint?: ReactNode; children: ReactNode}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>}
    </label>
  );
}

export function Input({className, ...props}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-brand-500 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-900/60",
        className,
      )}
      {...props}
    />
  );
}

export function Switch({checked, onChange, label}: {checked: boolean; onChange: (checked: boolean) => void; label: string}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", checked ? "bg-brand-600 dark:bg-brand-500" : "bg-zinc-300 dark:bg-zinc-700")}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

const tones = {
  info: "border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-100",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
  error: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200",
};

export function Notice({tone = "info", title, children}: {tone?: keyof typeof tones; title?: string; children: ReactNode}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-xs leading-5", tones[tone])} role={tone === "error" ? "alert" : undefined}>
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-0.5 opacity-90" : undefined}>{children}</div>
    </div>
  );
}

/** A logo from Casdoor, or the first letter of the name when there is none or it doesn't load */
export function Logo({src, name, size = 32, rounded = "rounded-lg"}: {src?: string; name: string; size?: number; rounded?: string}) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  const style = {width: size, height: size};
  if (src) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900", rounded)} style={style}>
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain p-1"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.replaceWith(Object.assign(document.createElement("span"), {textContent: letter, className: "text-sm font-semibold text-zinc-500"}));
          }}
        />
      </span>
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-zinc-100 text-sm font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400", rounded)} style={style}>
      {letter}
    </span>
  );
}

export function ExternalIcon({className}: {className?: string}) {
  return (
    <svg className={cn("h-3.5 w-3.5", className)} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9.5 3H13v3.5M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyButton({text, label, copiedLabel}: {text: string; label: string; copiedLabel: string}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-7 px-2 text-xs"
      onClick={async (event) => {
        const button = event.currentTarget;
        await navigator.clipboard.writeText(text);
        button.textContent = copiedLabel;
        setTimeout(() => (button.textContent = label), 1500);
      }}
    >
      {label}
    </Button>
  );
}
