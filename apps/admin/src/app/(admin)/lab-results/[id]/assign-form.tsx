"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@petwealth/ui";
import { assignSampleAction } from "../actions";

/** Attach an unmatched sample (e.g. a mistyped code) to the right kit. */
export function AssignForm({ batchId, sample, suggestion }: { batchId: string; sample: string; suggestion: string }) {
  const [code, setCode] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex shrink-0 flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await assignSampleAction(batchId, sample, code);
          if (!res.ok) setError(res.error);
        });
      }}
    >
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Kit code"
          aria-label={`Kit code for ${sample}`}
          className="w-40 font-mono"
          required
        />
        <Button type="submit" variant="secondary" disabled={pending || !code.trim()}>
          {pending ? "Saving…" : "Assign"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
