"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

export function UserMenu({ email, role, clerk }: { email: string; role: string; clerk: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white" aria-hidden>
        {email.slice(0, 2).toUpperCase()}
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium text-ink">{email}</p>
        <p className="text-xs text-ink-subtle">{role}</p>
      </div>
      {clerk ? (
        <SignOutButton redirectUrl="/sign-in">
          <button type="button" className="rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </SignOutButton>
      ) : (
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title="AUTH_DEV_BYPASS_EMAIL is set">
          Dev bypass
        </span>
      )}
    </div>
  );
}
