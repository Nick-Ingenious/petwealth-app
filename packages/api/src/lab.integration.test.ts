/**
 * Lab upload, review and release against a real database.
 *   RUN_DB_TESTS=1 pnpm --filter @petwealth/api test
 * Uses random kit codes, so it can re-run without reseeding.
 */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ALL_PERMISSIONS } from "@petwealth/domain";
import { and, eq, getDb, schema as s } from "@petwealth/db";
import type { CustomerContext, StaffContext } from "./context";
import { freshKitCodes } from "./test-kit-codes";
import { draftAiReport, saveAiReport } from "./services/ai-reports";
import { reviewLabBatch, type LabRunReviewWriter } from "./services/lab-review";
import {
  dismissHeldRows,
  assignUnmatchedSample,
  getLabBatch,
  getMyLabReport,
  holdLabResultForRerun,
  listLabBatches,
  releaseLabResults,
  uploadLabFile,
} from "./services/lab";

const run = process.env.RUN_DB_TESTS === "1";

const HEADER = "Well,Omit,Target,Sample,Cq,Dyes,Cq Conf,Amp Score,Task,Amp Status,Annotated,Threshold,Baseline Start,Baseline End,Curve Quality,Result Quality Issues";
const row = (target: string, sample: string, cq: string, amp: string) => `A1,FALSE,${target},${sample},${cq},FAM,0.9,1.9,Unknown,${amp},FALSE,1000,3,20,,`;
const fecal = (sample: string, giardiaCq: string) => [
  row("Giardia spp._FGI", sample, giardiaCq, giardiaCq === "Undetermined" ? "No Amp" : "Amp"),
  row("Salmonella spp._FGI", sample, "Undetermined", "No Amp"),
  row("FGI Extraction Control_FGI", sample, "21.0", "Amp"),
];

async function setup() {
  const db = getDb();
  const n = randomInt(1e9);
  const [staffRow] = await db.insert(s.staffUsers).values({ email: `lab.${n}@petwealth.com`, role: "super_admin", status: "active" }).returning();
  const staff: StaffContext = {
    kind: "staff",
    staffId: staffRow!.id,
    email: staffRow!.email,
    name: null,
    role: "super_admin",
    permissions: new Set(ALL_PERMISSIONS),
    via: "admin_ui",
  };
  const [customer] = await db.insert(s.customers).values({ email: `lab.${n}@example.com`, firstName: "Lab", lastName: `Test${n}` }).returning();
  const [pet] = await db.insert(s.pets).values({ customerId: customer!.id, name: "Mochi", species: "cat" }).returning();
  const codes = await freshKitCodes(4, "cat", "fecal", { sameLot: true });
  const kits = await db
    .insert(s.kits)
    .values(
      codes.map((code, i) => ({
        code,
        customerId: customer!.id,
        petId: pet!.id,
        species: "cat" as const,
        panel: "fecal" as const,
        status: i === 3 ? ("in_transit" as const) : ("received_at_lab" as const),
      })),
    )
    .returning();
  const byCode = new Map(kits.map((k) => [k.code!, k]));
  const ordered = codes.map((c) => byCode.get(c)!);
  const customerCtx: CustomerContext = { kind: "customer", customerId: customer!.id, email: customer!.email, needsOnboarding: false };
  return { staff, customerCtx, kits: ordered, customerId: customer!.id };
}

describe.skipIf(!run)("lab results (db)", () => {
  afterAll(async () => {
    await getDb().$client.end();
  });

  it("cleans a messy file, holds rows with no kit ID, and only offers checked AI suggestions", async () => {
    const { staff, kits } = await setup();
    const [messy, misformatted] = kits as [(typeof kits)[0], (typeof kits)[0]];
    const noDashes = misformatted.code!.replace(/-/g, ""); // e.g. FFEC850123
    const blank = (target: string, cq: string) => row(target, "", cq, cq === "Undetermined" ? "No Amp" : "Amp");
    const csv = [
      HEADER,
      ...fecal(`  ${messy.code!.toLowerCase()} `, "27.5"),
      row("NADH_FGI", messy.code!.toLowerCase(), "24", "Amp"),
      row("Spike-in Control_FGI", messy.code!.toLowerCase(), "22", "Amp"),
      ...fecal(noDashes, "Undetermined"),
      blank("Giardia spp._CGI", "31"),
      blank("Microsporum canis_RWP", "29"),
      row("Giardia spp._FGI", "Positive Control", "25", "Amp"),
      row("Giardia spp._FGI", "Negative Control", "Undetermined", "No Amp"),
    ].join("\n");

    const up = await uploadLabFile(staff, { filename: "WellResult-messy.csv", csv });
    expect(up).toMatchObject({ matched: 1, unmatched: 1, heldRows: 2 });
    expect(up.cleanup).toEqual({ idsNormalized: 1, plateControlRows: 2, qualityCheckRows: 3, offPanelRows: 1, heldRows: 2 }); // 2 extraction controls + NADH

    let batch = await getLabBatch(staff, up.id);
    const result = batch.results[0]!;
    expect(result.kitCode).toBe(messy.code);
    expect(result.targets.map((x) => x.name)).toEqual(["Giardia spp.", "Salmonella spp."]); // no NADH, no Spike-in
    expect(result.flags.some((f) => f.startsWith("Spike-in Control isn't on the FGI panel list"))).toBe(true);
    expect(batch.held.map((h) => [h.panelCode, h.kitPrefix])).toEqual([["CGI", "CFEC"], ["RWP", null]]);

    // AI review: one good suggestion, one for a kit that doesn't exist, one on the wrong panel.
    let seen: Parameters<LabRunReviewWriter>[0] | null = null;
    const writer: LabRunReviewWriter = async (input) => {
      seen = input;
      return {
        model: "test/fake",
        review: {
          summary: "One sample is a kit ID without dashes; two rows have no kit ID.",
          notes: [
            { severity: "check", about: noDashes, message: `This is ${misformatted.code} without dashes.`, suggestedKitCode: misformatted.code! },
            { severity: "check", about: noDashes, message: "Or maybe this one.", suggestedKitCode: "FFEC-000-000" },
            { severity: "info", about: "CGI", message: "Rows with no kit ID look like a dog fecal kit.", suggestedKitCode: null },
          ],
        },
      };
    };
    const review = await reviewLabBatch(staff, up.id, { writer });
    expect(seen!.candidateKits.map((c) => c.code)).toContain(misformatted.code);
    expect(seen!.candidateKits.map((c) => c.code)).not.toContain(messy.code); // already in this upload
    expect(seen!.held.map((h) => h.panelCode)).toEqual(["CGI", "RWP"]);
    expect(review.status).toBe("done");
    expect(review.notes[0]!.suggestion).toEqual({ sample: noDashes, kitCode: misformatted.code });
    expect(review.notes[1]!.suggestion).toBeNull();
    expect(review.notes[1]!.message).toMatch(/couldn't be confirmed/);
    expect(review.notes[2]!.suggestion).toBeNull();

    // A failing writer is recorded, not thrown.
    const failed = await reviewLabBatch(staff, up.id, { writer: async () => Promise.reject(new Error("Could not resolve authentication method. Expected the apiKey")) });
    expect(failed).toMatchObject({ status: "unavailable", error: "AI review isn't set up here." });

    // A person applies the suggestion; the upload only completes once held rows are set aside too.
    await assignUnmatchedSample(staff, { batchId: up.id, sample: noDashes, kitCode: misformatted.code! });
    batch = await getLabBatch(staff, up.id);
    await releaseLabResults(staff, { resultIds: batch.results.map((r) => r.id) });
    expect((await getLabBatch(staff, up.id)).status).toBe("uploaded"); // held rows still open
    await dismissHeldRows(staff, { batchId: up.id, panelCode: "CGI" });
    await dismissHeldRows(staff, { batchId: up.id, panelCode: "RWP" });
    await expect(dismissHeldRows(staff, { batchId: up.id, panelCode: "RWP" })).rejects.toMatchObject({ status: 409 });
    batch = await getLabBatch(staff, up.id);
    expect(batch.status).toBe("released");
    expect(batch.held.every((h) => h.dismissedBy === staff.email)).toBe(true);
  });

  it("uploads, releases, reruns and assigns mistyped samples", async () => {
    const { staff, customerCtx, kits, customerId } = await setup();
    const [positive, clean, rerunKit, notReceived] = kits as [(typeof kits)[0], (typeof kits)[0], (typeof kits)[0], (typeof kits)[0]];
    const typo = "F" + positive.code!.toLowerCase(); // e.g. "Fffec-850-123"
    const csv = [
      HEADER,
      ...fecal(positive.code!.toLowerCase(), "27.5"),
      ...fecal(clean.code!, "Undetermined"),
      ...fecal(rerunKit.code!, "36"),
      ...fecal(notReceived.code!, "Undetermined"),
      ...fecal("ZZZZ-000-000", "30"),
      row("Giardia spp._FGI", "Positive Control", "25", "Amp"),
      row("Giardia spp._FGI", "Negative Control", "Undetermined", "No Amp"),
    ].join("\n");

    const up = await uploadLabFile(staff, { filename: "WellResult-test.csv", csv });
    expect(up).toMatchObject({ matched: 4, unmatched: 1 });

    const batch = await getLabBatch(staff, up.id);
    expect(batch.runControls.every((c) => c.passed)).toBe(true);
    expect(batch.unmatched[0]!.reason).toBe("Not a valid kit code.");
    const byCode = new Map(batch.results.map((r) => [r.kitCode, r]));
    expect(byCode.get(positive.code)!).toMatchObject({ status: "pending", healthStatus: "needs_attention", kitStatus: "processing" });
    expect(byCode.get(clean.code)!).toMatchObject({ healthStatus: "clean", kitStatus: "processing" });
    expect(byCode.get(notReceived.code)!.flags[0]).toMatch(/hasn't been received/);
    expect(byCode.get(rerunKit.code)!.flags).toContain("Giardia spp. amplified but Cq 36.00 is above the cutoff.");

    // Nothing is visible to the customer before release.
    expect(await getMyLabReport(customerCtx, positive.code!)).toBeNull();

    // A kit that never reached the lab can't be released.
    await expect(releaseLabResults(staff, { resultIds: [byCode.get(notReceived.code)!.id] })).rejects.toThrow(/Receive Kits/);

    const rel = await releaseLabResults(staff, { resultIds: [byCode.get(positive.code)!.id, byCode.get(clean.code)!.id] });
    expect(rel.released.sort()).toEqual([positive.code, clean.code].sort());
    const db = getDb();
    const [k] = await db.select().from(s.kits).where(eq(s.kits.id, positive.id));
    expect(k!.status).toBe("completed");
    const queued = await db
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.customerId, customerId), eq(s.notifications.template, "results_ready")));
    expect(queued).toHaveLength(2);

    const report = (await getMyLabReport(customerCtx, positive.code!.toLowerCase()))!;
    expect(report.status).toBe("needs_attention");
    expect(report.detected.map((d) => d.name)).toEqual(["Giardia"]);
    expect(report.detected[0]!.whatIsIt).toBeTruthy();
    expect(report.notDetected.map((d) => d.name)).toHaveLength(1);
    expect((await getMyLabReport(customerCtx, clean.code!))!.status).toBe("clean");
    // Another customer can't see it.
    expect(await getMyLabReport({ ...customerCtx, customerId: randomUUID() }, positive.code!)).toBeNull();

    // Rerun: kit is held, queued, and nothing is emailed.
    await holdLabResultForRerun(staff, { resultId: byCode.get(rerunKit.code)!.id, reason: "Weak Giardia signal" });
    const [rk] = await db.select().from(s.kits).where(eq(s.kits.id, rerunKit.id));
    expect(rk!.status).toBe("rerun");
    const [q] = await db.select().from(s.rerunQueue).where(eq(s.rerunQueue.kitId, rerunKit.id));
    expect(q).toMatchObject({ status: "active", attempts: 1, target: "FGI" });

    // Re-uploading the rerun kit moves it back to processing; releasing resolves the queue item.
    const again = await uploadLabFile(staff, {
      filename: "rerun.csv",
      csv: [HEADER, ...fecal(rerunKit.code!, "Undetermined"), ...fecal(typo, "29")].join("\n"),
    });
    const b2 = await getLabBatch(staff, again.id);
    expect(b2.unmatched[0]!.reason).toMatch(/Did you mean/);
    expect(b2.results[0]!.kitStatus).toBe("processing");
    await releaseLabResults(staff, { resultIds: [b2.results[0]!.id] });
    const [q2] = await db.select().from(s.rerunQueue).where(eq(s.rerunQueue.kitId, rerunKit.id));
    expect(q2!.status).toBe("resolved");

    // Assign the mistyped sample to the right kit (already completed, so it's flagged as a replacement).
    const assigned = await assignUnmatchedSample(staff, { batchId: again.id, sample: typo, kitCode: positive.code! });
    expect(assigned.flags.some((f) => /Assigned to/.test(f))).toBe(true);
    expect(assigned.flags).toContain("Results were already released for this kit. Releasing replaces them.");
    const b3 = await getLabBatch(staff, again.id);
    expect(b3.unmatched).toHaveLength(0);

    const list = await listLabBatches(staff);
    expect(list.find((b) => b.id === up.id)).toMatchObject({ released: 2, rerun: 1, pending: 1, unmatched: 1 });

    await expect(uploadLabFile(staff, { filename: "x.csv", csv: "name,email\na,b" })).rejects.toThrow(/lab results export/);
  });
  it("drafts, approves and shows AI summaries only once approved", async () => {
    const { staff, customerCtx, kits } = await setup();
    const [kit] = kits as [(typeof kits)[0]];
    const up = await uploadLabFile(staff, { filename: "ai.csv", csv: [HEADER, ...fecal(kit.code!, "27.5")].join("\n") });
    const batch = await getLabBatch(staff, up.id);
    const result = batch.results[0]!;
    expect(result.aiReport).toBeNull();

    const seen: unknown[] = [];
    const writer = async (input: unknown) => {
      seen.push(input);
      return {
        model: "claude-opus-5-5",
        summary: {
          summary: "We found Giardia in Mochi's fecal sample. Share this with your vet.",
          findings: [{ name: "Giardia", meaning: "A common parasite that is usually treatable." }],
          nextSteps: ["Share the report with your vet.", "Pick up stool promptly."],
          vetUrgency: "soon" as const,
          vetReason: "Giardia is worth a conversation with your vet.",
        },
      };
    };
    const draft = await draftAiReport(staff, result.id, { writer });
    expect(draft).toMatchObject({ version: 1, approved: false });
    expect(seen[0]).toMatchObject({ petName: "Mochi", species: "cat", panel: "fecal" });
    expect((await getLabBatch(staff, up.id)).results[0]!.aiReport).toMatchObject({ id: draft.id, approved: false });

    await releaseLabResults(staff, { resultIds: [result.id] });
    // Released, but the draft isn't shown to the customer.
    expect((await getMyLabReport(customerCtx, kit.code!))!.aiSummary).toBeNull();

    await expect(saveAiReport(staff, { reportId: draft.id, content: { ...draft.content, summary: "Bad — dash" }, approve: true })).rejects.toThrow(/dashes/);
    const approved = await saveAiReport(staff, { reportId: draft.id, content: { ...draft.content, summary: "Edited by staff." }, approve: true });
    expect(approved).toMatchObject({ version: 2, approved: true });
    expect((await getMyLabReport(customerCtx, kit.code!))!.aiSummary?.summary).toBe("Edited by staff.");

    // A newer draft doesn't hide the approved one.
    await saveAiReport(staff, { reportId: approved.id, content: { ...approved.content, summary: "Work in progress." }, approve: false });
    expect((await getMyLabReport(customerCtx, kit.code!))!.aiSummary?.summary).toBe("Edited by staff.");
  });
});
