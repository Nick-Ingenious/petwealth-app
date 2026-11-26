/**
 * AI review of a lab upload (after the cleanup rules). Claude writes notes
 * for staff and may suggest a kit for an unmatched sample; every suggestion is
 * re-checked here, and only a person applies it (assignUnmatchedSample).
 */
import { labPanelCodeFor, parseKitCode, type LabReviewNote, type LabRunReview } from "@petwealth/domain";
import { and, eq, getDb, inArray, isNotNull, notInArray, schema as s, sql } from "@petwealth/db";
import { LabRunReviewError, writeLabRunReview, type LabRunReviewInput, type LabRunReviewOutput } from "@petwealth/integrations/ai";
import { z } from "zod";
import { recordEvent } from "../audit";
import { actorFields, requirePermission, type StaffContext } from "../context";
import { notFound } from "../errors";

/** Kits that can still receive lab results: the only ones a suggestion may name. */
const AWAITING_RESULTS = ["assigned", "sample_collected", "in_transit", "received_at_lab", "processing", "rerun"] as const;

export type LabRunReviewWriter = (input: LabRunReviewInput) => Promise<{ review: LabRunReviewOutput; model: string }>;

const norm = (x: string) => x.trim().toUpperCase();

/** Letters and digits only, with look-alikes folded: "ffec 0O4-926" and "FFEC-004-926" both give FFEC004926. */
export function kitCodeKey(x: string): string {
  const s = x.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Only the digit part (after the 4-letter prefix) folds O to 0 and I/L to 1.
  return s.slice(0, 4) + s.slice(4).replace(/O/g, "0").replace(/[IL]/g, "1");
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return dp[b.length]!;
}

/** Up to 5 waiting kits closest in spelling to a sample (at most 3 edits apart), closest first. */
export function closestKits<T extends { code: string }>(sample: string, kits: T[]): T[] {
  const key = kitCodeKey(sample);
  return kits
    .map((k) => ({ k, d: editDistance(key, kitCodeKey(k.code)) }))
    .filter((x) => x.d <= 3)
    .sort((a, b) => a.d - b.d || a.k.code.localeCompare(b.k.code))
    .slice(0, 5)
    .map((x) => x.k);
}

/** Run (or rerun) the AI review of an upload and store it. Never throws for a failed review; it's recorded instead. */
export async function reviewLabBatch(ctx: StaffContext, batchId: string, opts: { writer?: LabRunReviewWriter } = {}): Promise<LabRunReview> {
  requirePermission(ctx, "lab_results.upload");
  if (!z.uuid().safeParse(batchId).success) throw notFound("Lab upload");
  const db = getDb();
  const batch = await db.query.labBatches.findFirst({ where: eq(s.labBatches.id, batchId), columns: { sourceCsv: false } });
  if (!batch) throw notFound("Lab upload");

  const save = async (review: LabRunReview) => {
    await db.update(s.labBatches).set({ aiReview: review }).where(eq(s.labBatches.id, batchId));
    return review;
  };
  const now = () => new Date().toISOString();
  await save({ status: "running", summary: null, notes: [], model: null, error: null, reviewedAt: now() });

  const results = await db
    .select({ kitCode: s.kits.code, flags: s.labResults.flags })
    .from(s.labResults)
    .innerJoin(s.kits, eq(s.labResults.kitId, s.kits.id))
    .where(and(eq(s.labResults.batchId, batchId), inArray(s.labResults.status, ["pending", "released", "rerun"])));
  const inUpload = results.map((r) => r.kitCode!).filter(Boolean);
  // Only kits that could be the unmatched samples: the closest waiting kits by spelling, per sample.
  const waiting = batch.unmatched.length
    ? (
        await db
          .select({ code: s.kits.code, status: s.kits.status, species: s.kits.species, panel: s.kits.panel })
          .from(s.kits)
          .where(and(isNotNull(s.kits.code), inArray(s.kits.status, [...AWAITING_RESULTS]), inUpload.length ? notInArray(s.kits.code, inUpload) : sql`true`))
      ).map((k) => ({ ...k, code: k.code! }))
    : [];
  const candidates = [...new Map(batch.unmatched.flatMap((u) => closestKits(u.sample, waiting)).map((k) => [k.code, k])).values()];

  const input: LabRunReviewInput = {
    filename: batch.filename,
    cleanup: batch.cleanup ?? { idsNormalized: 0, plateControlRows: 0, qualityCheckRows: 0, offPanelRows: 0, heldRows: 0 },
    runControls: batch.runControls,
    matchedCount: results.length,
    flagged: results.filter((r) => r.flags.length).map((r) => ({ kitCode: r.kitCode!, flags: r.flags })),
    unmatched: batch.unmatched.map((u) => ({ sample: u.sample, reason: u.reason, panelCode: u.panelCode, detected: u.detected })),
    held: batch.held.filter((h) => !h.dismissedAt).map(({ panelCode, kitPrefix, wells, detected }) => ({ panelCode, kitPrefix, wells, detected })),
    candidateKits: candidates.map((c) => ({ code: c.code, status: c.status })),
  };

  let out: { review: LabRunReviewOutput; model: string };
  try {
    out = await (opts.writer ?? writeLabRunReview)(input);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // No API key (local development) is "unavailable", not a failure.
    const unavailable = !(e instanceof LabRunReviewError) && /api[_ ]?key|authentication/i.test(message);
    console.warn(`[lab-review] upload ${batch.number}: ${message}`);
    return save({
      status: unavailable ? "unavailable" : "failed",
      summary: null,
      notes: [],
      model: null,
      error: unavailable ? "AI review isn't set up here." : e instanceof LabRunReviewError ? message : "The review couldn't run. Try again.",
      reviewedAt: now(),
    });
  }

  // Re-check every suggestion: an unmatched sample in this upload, a kit waiting for results, and the right panel.
  const byCode = new Map(candidates.map((c) => [c.code, c]));
  const notes: LabReviewNote[] = out.review.notes.map((n) => {
    if (!n.suggestedKitCode) return { severity: n.severity, about: n.about, message: n.message, suggestion: null };
    const sample = batch.unmatched.find((u) => norm(u.sample) === norm(n.about));
    const code = parseKitCode(n.suggestedKitCode)?.code;
    const kit = code ? byCode.get(code) : undefined;
    const panelFits = kit && (!sample?.panelCode || labPanelCodeFor(kit.species, kit.panel) === sample.panelCode);
    const ok = Boolean(sample && kit && panelFits);
    return {
      severity: n.severity,
      about: sample?.sample ?? n.about,
      message: ok ? n.message : `${n.message} (The suggested kit couldn't be confirmed, so it isn't offered.)`,
      suggestion: ok ? { sample: sample!.sample, kitCode: kit!.code } : null,
    };
  });
  const review = await save({ status: "done", summary: out.review.summary, notes, model: out.model, error: null, reviewedAt: now() });
  await recordEvent(db, {
    entityType: "lab_batch",
    entityId: batchId,
    type: "lab_batch.ai_reviewed",
    ...actorFields(ctx),
    payload: { model: out.model, notes: notes.length, suggestions: notes.filter((n) => n.suggestion).length },
  });
  return review;
}
