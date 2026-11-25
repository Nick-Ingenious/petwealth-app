"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import type { AiReportView, LabSummary } from "@petwealth/api";
import { Badge, Button, Select } from "@petwealth/ui";
import { draftSummaryAction, saveSummaryAction } from "../actions";

const URGENCY: Record<LabSummary["vetUrgency"], string> = {
  routine: "Routine (next regular visit)",
  soon: "Soon (within a week or two)",
  promptly: "Promptly",
};

const area = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none";

/**
 * Claude drafts the customer-facing summary; staff edit and approve it.
 * Only an approved summary appears in the customer's report.
 */
export function AiSummaryPanel({ batchId, resultId, report, canEdit }: { batchId: string; resultId: string; report: AiReportView | null; canEdit: boolean }) {
  const [current, setCurrent] = useState(report);
  const [draft, setDraft] = useState<LabSummary | null>(report?.content ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function write() {
    setError(null);
    start(async () => {
      const res = await draftSummaryAction(batchId, resultId);
      if (res.ok) {
        setCurrent(res.data);
        setDraft(res.data.content);
      } else setError(res.error);
    });
  }

  function save(approve: boolean) {
    if (!current || !draft) return;
    setError(null);
    start(async () => {
      const res = await saveSummaryAction(batchId, current.id, draft, approve);
      if (res.ok) {
        setCurrent(res.data);
        setDraft(res.data.content);
      } else setError(res.error);
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <Sparkles className="size-3.5" aria-hidden /> Customer summary
        </p>
        <span className="flex items-center gap-2">
          {current ? (
            current.approved ? (
              <Badge tone="success">Approved{current.reviewedBy ? ` by ${current.reviewedBy}` : ""}</Badge>
            ) : (
              <Badge tone="warning">Draft, not shown to customer</Badge>
            )
          ) : null}
          {canEdit ? (
            <Button size="sm" variant="secondary" disabled={pending} onClick={write}>
              {pending && !draft ? "Writing…" : current ? "Rewrite with AI" : "Write with AI"}
            </Button>
          ) : null}
        </span>
      </div>

      {!draft ? (
        <p className="mt-3 text-sm text-ink-muted">
          {pending ? "Claude is writing a summary. This takes about 20 seconds." : "No summary yet. The customer sees the standard text until one is approved."}
        </p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">Summary (top of the report)</span>
            <textarea className={area} rows={4} disabled={!canEdit} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          </label>
          {draft.findings.map((f, i) => (
            <label key={i} className="block">
              <span className="mb-1 block text-xs text-ink-muted">What {f.name} means</span>
              <textarea
                className={area}
                rows={2}
                disabled={!canEdit}
                value={f.meaning}
                onChange={(e) => setDraft({ ...draft, findings: draft.findings.map((x, j) => (j === i ? { ...x, meaning: e.target.value } : x)) })}
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">Next steps (one per line)</span>
            <textarea
              className={area}
              rows={4}
              disabled={!canEdit}
              value={draft.nextSteps.join("\n")}
              onChange={(e) => setDraft({ ...draft, nextSteps: e.target.value.split("\n") })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs text-ink-muted">When to see the vet</span>
              <Select
                disabled={!canEdit}
                value={draft.vetUrgency}
                onChange={(e) => setDraft({ ...draft, vetUrgency: e.target.value as LabSummary["vetUrgency"] })}
              >
                {Object.entries(URGENCY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-muted">Why</span>
              <input className={area} disabled={!canEdit} value={draft.vetReason} onChange={(e) => setDraft({ ...draft, vetReason: e.target.value })} />
            </label>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="brand" disabled={pending} onClick={() => save(true)}>
                {pending ? "Saving…" : current?.approved ? "Save and keep approved" : "Approve for customer"}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(false)}>
                Save as draft
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-ink-subtle">
            Written by {current?.model ?? "Claude"}, version {current?.version}. Check facts against the results before approving.
          </p>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
