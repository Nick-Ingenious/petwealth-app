import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@petwealth/ui";
import { PageSizeSelect } from "./list-controls";

interface Props {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  noun: string;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}

/** Server-rendered pager: links are real URLs, so pages are shareable and work without JS. */
export function Pagination({ page, pageCount, total, pageSize, noun, basePath, searchParams }: Props) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return (qs ? `${basePath}?${qs}` : basePath) as never;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const btn = "grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3 text-sm text-ink-muted">
      <div className="flex items-center gap-3">
        <span>
          Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {noun}
        </span>
        <PageSizeSelect />
      </div>
      <nav aria-label="Pagination" className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} className={cn(btn, "hover:bg-canvas")} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Link>
        ) : null}
        {pages.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && p - pages[i - 1]! > 1 ? <span className="px-1">…</span> : null}
            <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={cn(btn, p === page ? "bg-ink text-white" : "hover:bg-canvas")}>
              {p}
            </Link>
          </span>
        ))}
        {page < pageCount ? (
          <Link href={href(page + 1)} className={cn(btn, "hover:bg-canvas")} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
