import Image from "next/image";
import type { ReactNode } from "react";
import { can } from "@petwealth/api";
import { ROLE_LABEL } from "@petwealth/domain";
import { NAV } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { UserMenu } from "@/components/user-menu";
import { requireStaff } from "@/lib/auth";
import { CLERK_ENABLED } from "@/lib/env";

/** Authenticated shell: every page below requires an active staff session. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const sections = NAV.map((s) => ({ ...s, items: s.items.filter((i) => can(staff, i.permission)) })).filter(
    (s) => s.items.length,
  );
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">
        <div className="flex items-center gap-3 border-b border-line px-6 py-5">
          <div>
            <Image src="/brand/logo-dark.svg" alt="Petwealth" width={137} height={22} priority className="h-[22px] w-auto" />
            <p className="mt-1 text-xs text-ink-muted">Admin Portal</p>
          </div>
        </div>
        <Sidebar sections={sections} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-end border-b border-line bg-surface/90 px-6 backdrop-blur">
          <UserMenu email={staff.email} role={ROLE_LABEL[staff.role]} clerk={CLERK_ENABLED} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
