"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { TextField } from "@/components/fields";
import type { ActionResult } from "@/lib/action";
import { deleteAccountAction } from "./actions";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(deleteAccountAction, null);
  const [typed, setTyped] = useState("");
  const ready = typed.trim() === "DELETE";
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || !window.confirm("Delete your account? This can't be undone.")) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <TextField
        showLabel
        name="confirm"
        label="Type DELETE to confirm"
        autoComplete="off"
        autoCapitalize="characters"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      {state && !state.ok ? (
        <p role="alert" className="rounded-xl border border-[#F0C7C7] bg-[#F5DFDF] px-4 py-3 text-sm text-[#9C3535]">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!ready || pending}
        className="flex h-12 w-full items-center justify-center rounded-full border border-[#F0C7C7] bg-white text-base font-bold text-[#9C3535] disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete my account"}
      </button>
      <Link href="/" className="flex h-12 w-full items-center justify-center rounded-full border border-zinc-200 bg-white text-base font-semibold text-ink">
        Cancel
      </Link>
    </form>
  );
}
