"use client";

import { useState, useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { sampleCollectedAction } from "./actions";

export function CollectedButton({ code, petName }: { code: string; petName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await sampleCollectedAction(code);
          if (!r.ok) setError(r.error);
        })}
        className="flex h-14 items-center gap-2 rounded-full border border-zinc-300 bg-white px-6 text-lg font-semibold disabled:opacity-50"
      >
        <CheckCheck className="size-5" aria-hidden /> {pending ? "Saving…" : `${petName}'s sample is collected`}
      </button>
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
