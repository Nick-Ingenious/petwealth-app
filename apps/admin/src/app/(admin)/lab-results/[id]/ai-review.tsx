"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import type { LabRunReview } from "@petwealth/domain";
import { Badge, Button } from "@petwealth/ui";
import { formatDateTime } from "@/lib/format";
import { assignSampleAction, rerunReviewAction } from "../actions";

const SEVERITY = {
  problem: { label: "Problem", tone: "danger" },
  check: { label: "Check", tone: "warning" },
  info: { label: "Note", tone: "neutral" },
} as const;

/** The AI review of an upload: summary, notes, and suggested kits a person can apply. */
export function AiReview({
  batchId,
  review,
  unmatchedSamples,
  canManage,
}: {
  batchId: string;
  review: LabRunReview | null;
  /** Samples still without a kit: a suggestion for any other sample was already applied. */
  unmatchedSamples: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const running = review?.status === "running";

  // While the review runs (after upload), check back every few seconds.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [running, router]);

  const rerun = () =>
    start(async () => {
      setError(null);
      const r = await rerunReviewAction(batchId);
      if (!r.ok) setError(r.error);
    });

  return (
    <div className="space-y-3 text-sm">
      {!review ? <p className="text-ink-muted">This upload hasn't been reviewed yet.</p> : null}
      {running || pending ? (
        <p className="flex items-center gap-2 text-ink-muted">
          <RefreshCw className="size-4 animate-spin" aria-hidden /> Reviewing the upload… this takes up to a minute.
        </p>
      ) : null}
      {review && !running && !pending && (review.status === "failed" || review.status === "unavailable") ? (
        <p className="text-amber-700">{review.error}</p>
      ) : null}
      {review?.status === "done" && !pending ? (
        <>
          {review.summary ? <p className="text-ink">{review.summary}</p> : null}
          {review.notes.length ? (
            <ul className="divide-y divide-line">
              {review.notes.map((n, i) => (
                <ReviewNote key={i} batchId={batchId} note={n} applied={Boolean(n.suggestion && !unmatchedSamples.includes(n.suggestion.sample))} canManage={canManage} />
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-ink-muted">
            Reviewed {formatDateTime(review.reviewedAt)} · suggestions are only applied when you click Apply
          </p>
        </>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {canManage && !running && !pending ? (
        <Button size="sm" variant="ghost" onClick={rerun}>
          <Sparkles className="size-3.5" aria-hidden /> {review ? "Run review again" : "Review this upload"}
        </Button>
      ) : null}
    </div>
  );
}

function ReviewNote({ batchId, note, applied, canManage }: { batchId: string; note: LabRunReview["notes"][number]; applied: boolean; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const s = SEVERITY[note.severity];
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          <span className="font-mono text-xs text-ink-muted">{note.about}</span>
        </p>
        <p className="mt-1">{note.message}</p>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
      {note.suggestion ? (
        applied ? (
          <span className="shrink-0 text-xs text-emerald-700">Applied: {note.suggestion.kitCode}</span>
        ) : canManage ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              confirm(`Attach the results labelled "${note.suggestion!.sample}" to kit ${note.suggestion!.kitCode}?`) &&
              start(async () => {
                const r = await assignSampleAction(batchId, note.suggestion!.sample, note.suggestion!.kitCode);
                if (!r.ok) setError(r.error);
              })
            }
          >
            {pending ? "Applying…" : `Apply: ${note.suggestion.kitCode}`}
          </Button>
        ) : null
      ) : null}
    </li>
  );
}
