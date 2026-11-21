import type { ReactNode } from "react";
import { KIT_STATUS_META, type KitStatus } from "@petwealth/domain";
import { cn } from "./cn";

export type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  progress: "bg-violet-50 text-violet-700 ring-violet-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function KitStatusBadge({ status }: { status: KitStatus }) {
  const meta = KIT_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className="cursor-default">
      <span title={meta.description}>{meta.label}</span>
    </Badge>
  );
}
