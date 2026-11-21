import type { ReactNode } from "react";
import { cn } from "./cn";

export function PageHeader({ icon, title, description, actions }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {icon ? <div className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</div> : null}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-1 text-ink-subtle">{icon}</div> : null}
      <p className="font-medium text-ink">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function StatCard({ icon, label, value, change, hint }: { icon?: ReactNode; label: string; value: ReactNode; change?: number | null; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-xs">
      <div className="flex items-start justify-between">
        {icon ? <div className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</div> : <span />}
        {change != null ? (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-ink-muted">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{i.label}</dt>
          <dd className="mt-1 text-sm text-ink">{i.value ?? <span className="text-ink-subtle">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
