/**
 * Lab results: upload the lab's PCR export, review it per kit, then release
 * results to customers or hold kits for a rerun.
 *
 * Kit status changes go through `changeKitStatus`, so releasing a result moves
 * the kit to Completed and queues the "results ready" email like any other
 * status change.
 */
import {
  LabFileError,
  labPanelCodeFor,
  parseKitCode,
  parseLabRun,
  pathogenInfo,
  type KitStatus,
  type SampleGroup,
} from "@petwealth/domain";
import { and, desc, eq, getDb, inArray, ne, schema as s, sql, type DbOrTx } from "@petwealth/db";
import { z } from "zod";
import { recordEvent } from "../audit";
import { actorFields, requirePermission, type CustomerContext, type StaffContext } from "../context";
import { AppError, conflict, invalid, notFound } from "../errors";
import { approvedAiSummary, latestAiReports, type LabSummary } from "./ai-reports";
import { changeKitStatus } from "./kits";

type KitRow = typeof s.kits.$inferSelect;

/** Kit statuses that mean the sample hasn't been checked in at the lab. */
const BEFORE_LAB: readonly KitStatus[] = [
  "ordered",
  "label_created",
  "shipped",
  "delivered",
  "activated",
  "assigned",
  "sample_collected",
  "in_transit",
];

const MAX_CSV_CHARS = 5_000_000;

export const labUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  csv: z.string().min(1, "The file is empty.").max(MAX_CSV_CHARS, "The file is too large (5 MB max)."),
});

// ── Upload ─────────────────────────────────────────────────────────────

/** Attach one sample's results to a kit, inside the upload (or assign) transaction. */
async function attachSample(tx: DbOrTx, ctx: StaffContext, batchId: string, batchNumber: number, sample: SampleGroup, kit: KitRow) {
  const flags = [...sample.flags];
  if (BEFORE_LAB.includes(kit.status)) flags.unshift("Kit hasn't been received at the lab yet. Receive it before releasing.");
  if (kit.status === "completed") flags.unshift("Results were already released for this kit. Releasing replaces them.");
  if (!kit.petId) flags.push("No pet is registered to this kit.");

  // A newer upload replaces results still waiting for review.
  const replaced = await tx
    .update(s.labResults)
    .set({ status: "discarded" })
    .where(and(eq(s.labResults.kitId, kit.id), eq(s.labResults.status, "pending")))
    .returning({ id: s.labResults.id });
  if (replaced.length) flags.push("Replaces an earlier upload that hadn't been released.");

  if (kit.status === "received_at_lab" || kit.status === "rerun") {
    kit = await changeKitStatus(tx, kit, "processing", actorFields(ctx), { via: ctx.via, labBatch: batchNumber });
  }

  const [result] = await tx
    .insert(s.labResults)
    .values({
      kitId: kit.id,
      batchId,
      status: "pending",
      healthStatus: sample.detected.length ? "needs_attention" : "clean",
      sample: sample.sample,
      panelCode: sample.panelCode,
      targets: sample.targets,
      controls: sample.controls,
      flags,
      raw: { sample: sample.sample, panelCode: sample.panelCode },
      reportedAt: new Date(),
    })
    .returning();
  await recordEvent(tx, {
    entityType: "kit",
    entityId: kit.id,
    type: "lab_result.uploaded",
    ...actorFields(ctx),
    payload: { labBatch: batchNumber, detected: sample.detected.length, flags: flags.length },
  });
  return result!;
}

export async function uploadLabFile(ctx: StaffContext, input: z.input<typeof labUploadSchema>) {
  requirePermission(ctx, "lab_results.upload");
  const { filename, csv } = labUploadSchema.parse(input);
  let run;
  try {
    run = parseLabRun(csv);
  } catch (e) {
    if (e instanceof LabFileError) throw invalid(e.message);
    throw e;
  }

  return getDb().transaction(async (tx) => {
    const [batch] = await tx
      .insert(s.labBatches)
      .values({ filename, sourceCsv: csv, rowCount: run.rowCount, runControls: run.runControls, uploadedById: ctx.staffId })
      .returning();
    const codes = run.samples.flatMap((x) => (x.kitCode ? [x.kitCode] : []));
    const kits = codes.length ? await tx.select().from(s.kits).where(inArray(s.kits.code, codes)).for("update") : [];
    const byCode = new Map(kits.map((k) => [k.code!, k]));

    const unmatched: (SampleGroup & { reason: string })[] = [];
    let matched = 0;
    for (const sample of run.samples) {
      const kit = sample.kitCode ? byCode.get(sample.kitCode) : undefined;
      if (!sample.kitCode) {
        const reason = sample.suggestedCode ? `Not a valid kit code. Did you mean ${sample.suggestedCode}?` : "Not a valid kit code.";
        unmatched.push({ ...sample, reason });
      } else if (!kit) {
        unmatched.push({ ...sample, reason: "No kit with this code in the system." });
      } else if (kit.status === "cancelled") {
        unmatched.push({ ...sample, reason: "This kit is cancelled." });
      } else {
        await attachSample(tx, ctx, batch!.id, batch!.number!, sample, kit);
        matched++;
      }
    }
    if (unmatched.length) await tx.update(s.labBatches).set({ unmatched }).where(eq(s.labBatches.id, batch!.id));
    await recordEvent(tx, {
      entityType: "lab_batch",
      entityId: batch!.id,
      type: "lab_batch.uploaded",
      ...actorFields(ctx),
      payload: { filename, rows: run.rowCount, matched, unmatched: unmatched.length },
    });
    return { id: batch!.id, number: batch!.number!, matched, unmatched: unmatched.length };
  });
}

/** Attach an unmatched sample (e.g. a typo in the kit code) to the right kit. */
export async function assignUnmatchedSample(ctx: StaffContext, input: { batchId: string; sample: string; kitCode: string }) {
  requirePermission(ctx, "lab_results.upload");
  const parsed = parseKitCode(input.kitCode);
  if (!parsed) throw invalid("Enter a valid kit code, like FFEC-002-586.");
  if (!z.uuid().safeParse(input.batchId).success) throw notFound("Lab upload");
  return getDb().transaction(async (tx) => {
    const [batch] = await tx.select().from(s.labBatches).where(eq(s.labBatches.id, input.batchId)).for("update");
    if (!batch) throw notFound("Lab upload");
    const sample = batch.unmatched.find((u) => u.sample === input.sample);
    if (!sample) throw conflict("That sample was already assigned. Refresh the page.");
    const [kit] = await tx.select().from(s.kits).where(eq(s.kits.code, parsed.code)).for("update");
    if (!kit) throw new AppError(404, "kit_not_found", `No kit found with ID ${parsed.code}.`);
    if (kit.status === "cancelled") throw conflict(`${parsed.code} is cancelled.`);
    const { reason: _reason, ...group } = sample;
    const flags = [`Labelled "${sample.sample}" in the lab file. Assigned to ${parsed.code} by ${ctx.email}.`, ...group.flags];
    const expectedPanel = labPanelCodeFor(kit.species, kit.panel);
    if (group.panelCode && group.panelCode !== expectedPanel) {
      flags.push(`Sample was run on the ${group.panelCode} panel but ${parsed.code} needs ${expectedPanel}.`);
    }
    const result = await attachSample(tx, ctx, batch.id, batch.number!, { ...group, kitCode: parsed.code, flags }, kit);
    await tx
      .update(s.labBatches)
      .set({ unmatched: batch.unmatched.filter((u) => u.sample !== input.sample) })
      .where(eq(s.labBatches.id, batch.id));
    return result;
  });
}

// ── Review lists ───────────────────────────────────────────────────────

export async function listLabBatches(ctx: StaffContext, limit = 50) {
  requirePermission(ctx, "lab_results.view");
  const count = (status: string) =>
    sql<number>`(select count(*) from lab_results r where r.batch_id = ${s.labBatches.id} and r.status = ${status})`.mapWith(Number);
  return getDb()
    .select({
      id: s.labBatches.id,
      number: s.labBatches.number,
      filename: s.labBatches.filename,
      status: s.labBatches.status,
      createdAt: s.labBatches.createdAt,
      uploadedBy: s.staffUsers.email,
      unmatched: sql<number>`jsonb_array_length(${s.labBatches.unmatched})`.mapWith(Number),
      controlsFailed:
        sql<number>`(select count(*) from jsonb_array_elements(${s.labBatches.runControls}) c where (c->>'passed')::boolean = false)`.mapWith(
          Number,
        ),
      pending: count("pending"),
      released: count("released"),
      rerun: count("rerun"),
    })
    .from(s.labBatches)
    .leftJoin(s.staffUsers, eq(s.labBatches.uploadedById, s.staffUsers.id))
    .orderBy(desc(s.labBatches.createdAt))
    .limit(limit);
}

export async function getLabBatch(ctx: StaffContext, id: string) {
  requirePermission(ctx, "lab_results.view");
  if (!z.uuid().safeParse(id).success) throw notFound("Lab upload");
  const db = getDb();
  const batch = await db.query.labBatches.findFirst({ where: eq(s.labBatches.id, id), columns: { sourceCsv: false } });
  if (!batch) throw notFound("Lab upload");
  const uploader = batch.uploadedById
    ? await db.query.staffUsers.findFirst({ where: eq(s.staffUsers.id, batch.uploadedById), columns: { email: true } })
    : null;
  const results = await db
    .select({
      id: s.labResults.id,
      status: s.labResults.status,
      healthStatus: s.labResults.healthStatus,
      sample: s.labResults.sample,
      panelCode: s.labResults.panelCode,
      targets: s.labResults.targets,
      controls: s.labResults.controls,
      flags: s.labResults.flags,
      releasedAt: s.labResults.releasedAt,
      kitCode: s.kits.code,
      kitStatus: s.kits.status,
      species: s.kits.species,
      panel: s.kits.panel,
      petName: s.pets.name,
      customerId: s.customers.id,
      customerName: sql<string | null>`nullif(trim(concat_ws(' ', ${s.customers.firstName}, ${s.customers.lastName})), '')`,
    })
    .from(s.labResults)
    .innerJoin(s.kits, eq(s.labResults.kitId, s.kits.id))
    .leftJoin(s.pets, eq(s.kits.petId, s.pets.id))
    .leftJoin(s.customers, eq(s.kits.customerId, s.customers.id))
    .where(and(eq(s.labResults.batchId, id), ne(s.labResults.status, "discarded")))
    .orderBy(s.kits.code);
  const reports = await latestAiReports(results.map((r) => r.id));
  return { ...batch, uploadedBy: uploader?.email ?? null, results: results.map((r) => ({ ...r, aiReport: reports.get(r.id) ?? null })) };
}

// ── Release / rerun ────────────────────────────────────────────────────

const resultIdsSchema = z.object({ resultIds: z.array(z.uuid()).min(1).max(500) });

async function lockPending(tx: DbOrTx, resultId: string) {
  const [result] = await tx.select().from(s.labResults).where(eq(s.labResults.id, resultId)).for("update");
  if (!result) throw notFound("Lab result");
  if (result.status !== "pending") throw conflict("This result was already reviewed. Refresh the page.");
  const [kit] = await tx.select().from(s.kits).where(eq(s.kits.id, result.kitId)).for("update");
  return { result, kit: kit! };
}

async function settleBatch(tx: DbOrTx, batchId: string | null) {
  if (!batchId) return;
  const [left] = await tx
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(s.labResults)
    .where(and(eq(s.labResults.batchId, batchId), eq(s.labResults.status, "pending")));
  const [batch] = await tx.select({ unmatched: s.labBatches.unmatched }).from(s.labBatches).where(eq(s.labBatches.id, batchId));
  if (!left?.n && !batch?.unmatched.length) {
    await tx.update(s.labBatches).set({ status: "released" }).where(eq(s.labBatches.id, batchId));
  }
}

/** Release results to customers: kit moves to Completed and the "results ready" email is queued. */
export async function releaseLabResults(ctx: StaffContext, input: z.input<typeof resultIdsSchema>) {
  requirePermission(ctx, "lab_results.release");
  const { resultIds } = resultIdsSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const released: string[] = [];
    for (const id of resultIds) {
      const { result, kit: locked } = await lockPending(tx, id);
      let kit = locked;
      if (BEFORE_LAB.includes(kit.status)) {
        throw conflict(`${kit.code} hasn't been received at the lab. Receive it on the Receive Kits page first.`);
      }
      if (kit.status === "cancelled") throw conflict(`${kit.code} is cancelled.`);
      const actor = actorFields(ctx);
      const payload = { via: ctx.via, labResultId: result.id };
      if (kit.status === "received_at_lab" || kit.status === "rerun") kit = await changeKitStatus(tx, kit, "processing", actor, payload);
      if (kit.status === "processing") kit = await changeKitStatus(tx, kit, "completed", actor, payload);
      const now = new Date();
      // Earlier released results stay as history; the newest one is what the customer sees.
      await tx
        .update(s.labResults)
        .set({ status: "released", releasedAt: now, reviewedById: ctx.staffId, reviewedAt: now })
        .where(eq(s.labResults.id, result.id));
      await tx
        .update(s.rerunQueue)
        .set({ status: "resolved" })
        .where(and(eq(s.rerunQueue.kitId, kit.id), inArray(s.rerunQueue.status, ["active", "escalated"])));
      await recordEvent(tx, {
        entityType: "kit",
        entityId: kit.id,
        type: "lab_result.released",
        ...actor,
        payload: { labResultId: result.id, healthStatus: result.healthStatus },
      });
      await settleBatch(tx, result.batchId);
      released.push(kit.code!);
    }
    return { released };
  });
}

const rerunSchema = z.object({ resultId: z.uuid(), reason: z.string().trim().min(3, "Add a short reason.").max(500) });

/** Hold a result and queue the sample to be run again. Nothing is sent to the customer. */
export async function holdLabResultForRerun(ctx: StaffContext, input: z.input<typeof rerunSchema>) {
  requirePermission(ctx, "lab_results.release");
  const { resultId, reason } = rerunSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const { result, kit } = await lockPending(tx, resultId);
    if (kit.status === "received_at_lab" || kit.status === "processing" || kit.status === "completed") {
      await changeKitStatus(tx, kit, "rerun", actorFields(ctx), { via: ctx.via, labResultId: result.id, note: reason });
    }
    const now = new Date();
    await tx
      .update(s.labResults)
      .set({ status: "rerun", reviewedById: ctx.staffId, reviewedAt: now })
      .where(eq(s.labResults.id, result.id));
    const [open] = await tx
      .select()
      .from(s.rerunQueue)
      .where(and(eq(s.rerunQueue.kitId, kit.id), inArray(s.rerunQueue.status, ["active", "escalated"])));
    if (open) {
      const attempts = open.attempts + 1;
      await tx
        .update(s.rerunQueue)
        .set({ attempts, reason, status: attempts >= 3 ? "escalated" : "active" })
        .where(eq(s.rerunQueue.id, open.id));
    } else {
      await tx.insert(s.rerunQueue).values({ kitId: kit.id, target: result.panelCode ?? kit.panel, reason });
    }
    await recordEvent(tx, {
      entityType: "kit",
      entityId: kit.id,
      type: "lab_result.rerun",
      ...actorFields(ctx),
      payload: { labResultId: result.id, reason },
    });
    await settleBatch(tx, result.batchId);
    return { code: kit.code! };
  });
}

// ── Customer view ──────────────────────────────────────────────────────

export interface CustomerPathogenResult {
  name: string;
  commonName: string | null;
  tagName: string | null;
  detected: boolean;
  /** Lab Cq; null when nothing amplified (shown as 40.0, "none"). */
  cq: number | null;
  whatIsIt: string | null;
  whyItMatters: string | null;
  impact: string | null;
  symptoms: string[] | null;
  zoonotic: boolean | null;
}

export interface CustomerLabReport {
  kitCode: string;
  species: "dog" | "cat";
  panel: "fecal" | "respiratory" | "oral";
  pet: {
    name: string | null;
    breed: string | null;
    dateOfBirth: string | null;
    weightLbs: number | null;
    sex: "male" | "female" | "unknown" | null;
    photoUrl: string | null;
  };
  status: "clean" | "needs_attention";
  releasedAt: Date;
  /** When the kit reached each step, from its status history. */
  journey: {
    activatedAt: Date | null;
    collectedAt: Date | null;
    inTransitAt: Date | null;
    receivedAt: Date | null;
    completedAt: Date | null;
  };
  detected: CustomerPathogenResult[];
  notDetected: CustomerPathogenResult[];
  /** Staff-approved AI summary, when there is one. */
  aiSummary: LabSummary | null;
  /** Kept for the PDF and older callers. */
  petName: string | null;
}

/** The newest released result for one of the customer's kits, or null when none is released yet. */
export async function getMyLabReport(ctx: CustomerContext, rawCode: string): Promise<CustomerLabReport | null> {
  const code = parseKitCode(rawCode)?.code;
  if (!code) return null;
  const db = getDb();
  const [row] = await db
    .select({ result: s.labResults, kit: s.kits, pet: s.pets })
    .from(s.labResults)
    .innerJoin(s.kits, eq(s.labResults.kitId, s.kits.id))
    .leftJoin(s.pets, eq(s.kits.petId, s.pets.id))
    .where(and(eq(s.kits.code, code), eq(s.kits.customerId, ctx.customerId), eq(s.labResults.status, "released")))
    .orderBy(desc(s.labResults.releasedAt))
    .limit(1);
  if (!row) return null;

  // First time the kit entered each status.
  const history = await db
    .select({ to: sql<string>`${s.events.payload}->>'to'`, at: sql<Date>`min(${s.events.occurredAt})`.mapWith((v) => new Date(v)) })
    .from(s.events)
    .where(and(eq(s.events.entityType, "kit"), eq(s.events.entityId, row.kit.id), eq(s.events.type, "kit.status_changed")))
    .groupBy(sql`${s.events.payload}->>'to'`);
  const at = (status: string) => history.find((h) => h.to === status)?.at ?? null;

  const items = row.result.targets.map((t): CustomerPathogenResult => {
    const info = pathogenInfo(t.labCode);
    return {
      name: info?.name ?? t.name,
      commonName: info?.commonName && info.commonName !== info.name ? info.commonName : null,
      tagName: info?.tagName && info.tagName !== info.name ? info.tagName : null,
      detected: t.call === "detected",
      cq: t.cq,
      whatIsIt: info?.whatIsIt ?? null,
      whyItMatters: info?.whyItMatters ?? null,
      impact: info?.impact ?? null,
      symptoms: info?.symptoms ?? null,
      zoonotic: info?.zoonotic ?? null,
    };
  });
  const byName = (a: CustomerPathogenResult, b: CustomerPathogenResult) => a.name.localeCompare(b.name);
  const pet = row.pet;
  return {
    kitCode: code,
    species: row.kit.species,
    panel: row.kit.panel,
    petName: pet?.name ?? null,
    pet: {
      name: pet?.name ?? null,
      breed: pet?.breed ?? null,
      dateOfBirth: pet?.dateOfBirth ?? null,
      weightLbs: pet?.weightLbs ?? null,
      sex: pet?.sex ?? null,
      photoUrl: pet?.photoUrl ?? null,
    },
    status: items.some((i) => i.detected) ? "needs_attention" : "clean",
    releasedAt: row.result.releasedAt!,
    journey: {
      activatedAt: row.kit.activatedAt ?? at("activated"),
      collectedAt: at("sample_collected"),
      inTransitAt: at("in_transit"),
      receivedAt: row.kit.receivedAt ?? at("received_at_lab"),
      completedAt: row.kit.completedAt ?? at("completed"),
    },
    detected: items.filter((i) => i.detected).sort(byName),
    notDetected: items.filter((i) => !i.detected).sort(byName),
    aiSummary: await approvedAiSummary(row.result.id),
  };
}
