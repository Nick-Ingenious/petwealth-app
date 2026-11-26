"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Barcode, BookOpen, Building2, FileUp, FlaskConical, ImageIcon, KeyRound, LayoutGrid, Microscope,
  Package, PawPrint, ShieldCheck, Truck, Users, type LucideIcon,
} from "lucide-react";
import { cn } from "@petwealth/ui";
import type { NavItem } from "./nav";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutGrid, orders: Package, kits: FlaskConical, customers: Users, pets: PawPrint, breedPictures: ImageIcon,
  receive: Barcode, results: Microscope, upload: FileUp, returns: Truck,
  wholesale: Building2, users: ShieldCheck, permissions: KeyRound, api: BookOpen,
};

export function Sidebar({ sections }: { sections: { section: string; items: NavItem[] }[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav aria-label="Main" className="flex flex-col gap-6 px-3 py-4">
      {sections.map((s) => (
        <div key={s.section}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{s.section}</p>
          <ul className="space-y-0.5">
            {s.items.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutGrid;
              const cls = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
              if (item.soon) {
                return (
                  <li key={item.href}>
                    <span className={cn(cls, "cursor-not-allowed text-ink-subtle")} title="Coming in Milestone 2">
                      <Icon className="size-4" aria-hidden />
                      {item.label}
                      <span className="ml-auto rounded bg-canvas px-1.5 py-0.5 text-[10px] uppercase">Soon</span>
                    </span>
                  </li>
                );
              }
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href as never}
                    prefetch={item.href.startsWith("/api") ? false : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(cls, active ? "bg-brand-50 text-brand-700" : "text-ink-muted hover:bg-canvas hover:text-ink")}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
