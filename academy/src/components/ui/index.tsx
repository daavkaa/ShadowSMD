import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-strong shadow-[0_4px_0_0_#5b34c4] active:translate-y-[2px] active:shadow-[0_2px_0_0_#5b34c4]",
  secondary: "bg-white text-ink border-2 border-line hover:border-lavender",
  ghost: "text-primary-strong hover:bg-lavender-soft",
  danger: "bg-danger text-white hover:opacity-90",
};
const base = "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-bold transition disabled:opacity-50 disabled:pointer-events-none min-h-12";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(base, variants[variant], className)} {...p} />;
}

export function ButtonLink({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(base, variants[variant], className)} {...p} />;
}

export function Card({ className, children, ...p }: ComponentProps<"section">) {
  return (
    <section className={cx("rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)] sm:p-6", !/\bbg-/.test(className ?? "") && "bg-surface", className)} {...p}>
      {children}
    </section>
  );
}

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-canvas text-muted",
  primary: "bg-lavender-soft text-primary-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", tones[tone], className)}>{children}</span>;
}

export function Alert({ tone = "primary", title, children, role }: { tone?: Tone; title?: string; children?: ReactNode; role?: "alert" | "status" }) {
  return (
    <div role={role} className={cx("rounded-2xl border px-4 py-3 text-sm", tones[tone], "border-current/20")}>
      {title && <p className="font-bold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm font-semibold text-muted">
        <span>{label}</span>
        <span>{value}/{max} · {pct}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
    </header>
  );
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
}
