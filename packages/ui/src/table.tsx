import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}
export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} className={cn("border-b border-line bg-canvas/60", p.className)} />;
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} className={cn("divide-y divide-line", p.className)} />;
export const TR = (p: HTMLAttributes<HTMLTableRowElement>) => <tr {...p} className={cn("transition-colors hover:bg-canvas/70", p.className)} />;
export const TH = (p: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th scope="col" {...p} className={cn("whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted first:pl-6 last:pr-6", p.className)} />
);
export const TD = (p: TdHTMLAttributes<HTMLTableCellElement>) => <td {...p} className={cn("px-4 py-3.5 align-middle first:pl-6 last:pr-6", p.className)} />;
