"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { getLabBatch } from "@petwealth/api";
import { KIT_STATUS_META, kitDisplayName } from "@petwealth/domain";
import { Badge, Button, Input, KitStatusBadge, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { releaseResultsAction, rerunResultAction } from "../actions";

type Result = Awaited<ReturnType<typeof getLabBatch>>["results"][number];

const STATUS = {
  pending: ["warning", "To review"],
  released: ["success", "Released"],
  rerun: ["danger", "Rerun"],
  discarded: ["neutral", "Replaced"],
} as const;

const RELEASABLE = new Set(["received_at_lab", "processing", "rerun", "completed"]);

const fmtCq = (cq: number | null) => (cq === null ? "Undetermined" : cq.toFixed(2));

export function ReviewTable({ batchId, results, canRelease }: { batchId: string; results: Result[]; canRelease: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [rerunFor, setRerunFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const releasable = results.filter((r) => r.status === "pending" && RELEASABLE.has(r.kitStatus));
  const unflagged = releasable.filter((r) => r.flags.length === 0);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  function release(ids: string[]) {
    setMessage(null);
    start(async () => {
      const res = await releaseResultsAction(batchId, ids);
      if (res.ok) {
        setSelected(new Set());
        const n = res.data.released.length;
        setMessage({ ok: true, text: `Released ${n} result${n === 1 ? "" : "s"}. Customers will be emailed shortly.` });
      } else setMessage({ ok: false, text: res.error });
    });
  }

  function rerun(id: string) {
    setMessage(null);
    start(async () => {
      const res = await rerunResultAction(batchId, id, reason);
      if (res.ok) {
        setRerunFor(null);
        setReason("");
        setMessage({ ok: true, text: `${res.data.code} is held for a rerun. The customer isn't notified.` });
      } else setMessage({ ok: false, text: res.error });
    });
  }

  if (!results.length) return <p className="px-6 pb-6 pt-4 text-sm text-ink-muted">No kits matched in this file.</p>;

  const status = message ? (
    <p role="status" className={message.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
      {message.text}
    </p>
  ) : null;

  return (
    <div className="mt-4">
      {canRelease && releasable.length ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 pb-4">
          <Button variant="brand" disabled={pending || selected.size === 0} onClick={() => release([...selected])}>
            {pending ? "Working…" : `Release selected (${selected.size})`}
          </Button>
          <Button variant="secondary" disabled={pending || !unflagged.length} onClick={() => setSelected(new Set(unflagged.map((r) => r.id)))}>
            Select all without notes ({unflagged.length})
          </Button>
          {status}
        </div>
      ) : status ? (
        <div className="px-6 pb-4">{status}</div>
      ) : null}
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <tr>
              <TH className="w-10">
                <span className="sr-only">Select</span>
              </TH>
              <TH>Kit</TH>
              <TH>Pet</TH>
              <TH>Detected</TH>
              <TH>Review notes</TH>
              <TH>Result</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {results.map((r) => {
              const canAct = canRelease && r.status === "pending";
              const isOpen = open.has(r.id);
              const detected = r.targets.filter((t) => t.call === "detected");
              return (
                <Fragment key={r.id}>
                  <TR className="align-top">
                    <TD>
                      {canAct && RELEASABLE.has(r.kitStatus) ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.kitCode}`}
                          className="size-4 accent-brand-600"
                          checked={selected.has(r.id)}
                          onChange={() => setSelected((s) => toggle(s, r.id))}
                        />
                      ) : null}
                    </TD>
                    <TD>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-left"
                        aria-expanded={isOpen}
                        onClick={() => setOpen((s) => toggle(s, r.id))}
                      >
                        {isOpen ? <ChevronDown className="size-4 text-ink-muted" /> : <ChevronRight className="size-4 text-ink-muted" />}
                        <span className="font-mono">{r.kitCode}</span>
                      </button>
                      <p className="ml-5 text-xs text-ink-muted">{kitDisplayName(r.species, r.panel)}</p>
                      <div className="ml-5 mt-1">
                        <KitStatusBadge status={r.kitStatus} />
                      </div>
                    </TD>
                    <TD>
                      {r.petName ?? <span className="text-amber-700">No pet</span>}
                      {r.customerName ? <p className="text-xs text-ink-muted">{r.customerName}</p> : null}
                    </TD>
                    <TD className="max-w-72">
                      {detected.length ? (
                        <ul className="space-y-0.5">
                          {detected.map((t) => (
                            <li key={t.labCode}>
                              {t.name} <span className="text-xs tabular-nums text-ink-muted">Cq {fmtCq(t.cq)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-ink-muted">Nothing detected</span>
                      )}
                    </TD>
                    <TD className="max-w-80">
                      {r.flags.length ? (
                        <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                          {r.flags.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-ink-muted">None</span>
                      )}
                    </TD>
                    <TD className="space-y-1">
                      <Badge tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</Badge>
                      {r.healthStatus ? (
                        <p className="text-xs text-ink-muted">{r.healthStatus === "clean" ? "Clean" : "Needs attention"}</p>
                      ) : null}
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      {canAct ? (
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setRerunFor(rerunFor === r.id ? null : r.id)}>
                          Rerun
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                  {rerunFor === r.id ? (
                    <tr className="bg-canvas/60">
                      <td colSpan={7} className="px-6 py-3">
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            rerun(r.id);
                          }}
                        >
                          <label htmlFor={`reason-${r.id}`} className="text-sm">
                            Why rerun {r.kitCode}?
                          </label>
                          <Input
                            id={`reason-${r.id}`}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Extraction control failed"
                            className="w-80"
                            maxLength={500}
                            required
                          />
                          <Button type="submit" variant="danger" size="sm" disabled={pending || reason.trim().length < 3}>
                            Hold for rerun
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setRerunFor(null)}>
                            Cancel
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                  {isOpen ? (
                    <tr className="bg-canvas/40">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="grid gap-6 md:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Targets · {r.panelCode}</p>
                            <table className="w-full text-sm">
                              <tbody>
                                {r.targets.map((t) => (
                                  <tr key={t.labCode} className="border-b border-line/60 last:border-0">
                                    <td className="py-1 pr-3">{t.name}</td>
                                    <td className="py-1 pr-3 text-right tabular-nums text-ink-muted">{fmtCq(t.cq)}</td>
                                    <td className="py-1 text-right">
                                      {t.call === "detected" ? (
                                        <Badge tone="warning">Detected</Badge>
                                      ) : (
                                        <span className="text-xs text-ink-muted">Not detected</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Internal controls</p>
                            <table className="w-full text-sm">
                              <tbody>
                                {r.controls.map((c, i) => (
                                  <tr key={`${c.name}-${c.well}-${i}`} className="border-b border-line/60 last:border-0">
                                    <td className="py-1 pr-3">
                                      {c.name} <span className="text-xs text-ink-muted">{c.well}</span>
                                    </td>
                                    <td className="py-1 pr-3 text-right tabular-nums text-ink-muted">{fmtCq(c.cq)}</td>
                                    <td className="py-1 text-right text-xs text-ink-muted">
                                      {c.checked ? (c.cq === null ? "Failed" : "OK") : "Info only"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="mt-3 text-xs">
                              <Link href={`/kits/${r.kitCode}`} className="text-brand-700 hover:underline">
                                Open kit
                              </Link>
                              <span className="text-ink-muted"> · {KIT_STATUS_META[r.kitStatus].description}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
