"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input, Select, cn } from "@petwealth/ui";

/** Update one or more query params, resetting pagination. */
function useSetParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}` as never, { scroll: false }));
  };
  return { params, set, pending };
}

/** Debounced search box bound to `?q=`. */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const { params, set, pending } = useSetParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  useEffect(() => {
    if (value === (params.get("q") ?? "")) return;
    const t = setTimeout(() => set({ q: value.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={cn("pl-9", pending && "opacity-70")}
      />
    </div>
  );
}

/** Select bound to a query param. */
export function FilterSelect({ name, label, options }: { name: string; label: string; options: { value: string; label: string }[] }) {
  const { params, set } = useSetParams();
  return (
    <Select aria-label={label} value={params.get(name) ?? ""} onChange={(e) => set({ [name]: e.target.value || null })} className="w-auto min-w-44">
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** Segmented control bound to a query param (e.g. species). */
export function Segmented({ name, options }: { name: string; options: { value: string; label: string }[] }) {
  const { params, set } = useSetParams();
  const current = params.get(name) ?? "";
  return (
    <div role="group" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {[{ value: "", label: "All" }, ...options].map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={current === o.value}
          onClick={() => set({ [name]: o.value || null })}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium", current === o.value ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageSizeSelect() {
  const { params, set } = useSetParams();
  return (
    <Select aria-label="Rows per page" value={params.get("pageSize") ?? "25"} onChange={(e) => set({ pageSize: e.target.value })} className="h-8 w-auto text-xs">
      {[10, 25, 50, 100].map((n) => (
        <option key={n} value={n}>
          {n} / page
        </option>
      ))}
    </Select>
  );
}
