"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@petwealth/ui";
import { deletePetAction } from "./actions";

/** Trash button on a pet row. Pets with kits keep their profile, so the button only explains why. */
export function DeletePetButton({ petId, name, canDelete, redirectTo }: { petId: string; name: string; canDelete: boolean; redirectTo?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="relative">
      <button
        type="button"
        aria-label={`Delete ${name}`}
        disabled={pending}
        onClick={() => {
          if (!canDelete) {
            setMessage(`${name} has test kits, so the profile is kept with their results.`);
            return;
          }
          if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
          start(async () => {
            const res = await deletePetAction(petId);
            if (!res.ok) setMessage(res.error);
            else if (redirectTo) router.push(redirectTo as never);
          });
        }}
        className={cn("grid size-9 place-items-center rounded-full text-[#BE123C]", !canDelete && "opacity-50")}
      >
        <Trash2 className="size-5" aria-hidden />
      </button>
      {message ? (
        <span role="status" className="absolute right-0 top-10 z-10 w-60 rounded-xl bg-ink px-3 py-2 text-sm text-white shadow-lg" onClick={() => setMessage(null)}>
          {message}
        </span>
      ) : null}
    </span>
  );
}
