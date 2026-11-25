/**
 * AI summaries for lab results. Claude drafts; staff edit and approve; only
 * an approved summary is shown to the customer. Every draft and edit is a new
 * version in `ai_reports`, so the history is kept.
 */
import { pathogenInfo } from "@petwealth/domain";
import { and, desc, eq, getDb, inArray, schema as s, sql } from "@petwealth/db";
import { LabSummaryError, labSummarySchema, writeLabSummary, type LabSummary, type LabSummaryInput } from "@petwealth/integrations/ai";
import { recordEvent } from "../audit";
import { actorFields, requirePermission, type StaffContext } from "../context";
import { conflict, invalid, notFound } from "../errors";

export type { LabSummary };

export interface AiReportView {
  id: string;
  version: number;
  model: string;
  content: LabSummary;
  approved: boolean;
  reviewedAt: Date | null;
  reviewedBy: string | null;
}

type Writer = (input: LabSummaryInput) => Promise<{ summary: LabSummary; model: string }>;

function ageText(dob: string | null): string | null {
  if (!dob) return null;
  const [y, m] = dob.split("-").map(Number) as [number, number];
  const now = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  return years ? `${years} year${years === 1 ? "" : "s"}${months % 12 ? ` ${months % 12} months` : ""}` : `${months} months`;
}

/** Latest version of each result's AI summary. */
export async function latestAiReports(resultIds: string[]): Promise<Map<string, AiReportView>> {
  if (!resultIds.length) return new Map();
  const rows = await getDb()
    .selectDistinctOn([s.aiReports.labResultId], {
      labResultId: s.aiReports.labResultId,
      id: s.aiReports.id,
      version: s.aiReports.version,
      model: s.aiReports.model,
      content: s.aiReports.content,
      reviewedAt: s.aiReports.reviewedAt,
      reviewedBy: s.staffUsers.email,
    })
    .from(s.aiReports)
    .leftJoin(s.staffUsers, eq(s.aiReports.reviewedById, s.staffUsers.id))
    .where(inArray(s.aiReports.labResultId, resultIds))
    .orderBy(s.aiReports.labResultId, desc(s.aiReports.version));
  return new Map(
    rows.map((r) => [
      r.labResultId,
      { id: r.id, version: r.version, model: r.model, content: r.content as LabSummary, approved: Boolean(r.reviewedAt), reviewedAt: r.reviewedAt, reviewedBy: r.reviewedBy },
    ]),
  );
}

async function nextVersion(labResultId: string) {
  const [row] = await getDb()
    .select({ v: sql<number>`coalesce(max(${s.aiReports.version}), 0)`.mapWith(Number) })
    .from(s.aiReports)
    .where(eq(s.aiReports.labResultId, labResultId));
  return (row?.v ?? 0) + 1;
}

/** Ask Claude for a fresh draft of a result's summary. */
export async function draftAiReport(ctx: StaffContext, resultId: string, opts: { writer?: Writer } = {}): Promise<AiReportView> {
  requirePermission(ctx, "lab_results.release");
  const db = getDb();
  const [row] = await db
    .select({ result: s.labResults, kit: s.kits, pet: s.pets })
    .from(s.labResults)
    .innerJoin(s.kits, eq(s.labResults.kitId, s.kits.id))
    .leftJoin(s.pets, eq(s.kits.petId, s.pets.id))
    .where(eq(s.labResults.id, resultId));
  if (!row) throw notFound("Lab result");
  if (!row.result.targets.length) throw conflict("This result has no pathogen data to summarise.");

  const input: LabSummaryInput = {
    petName: row.pet?.name ?? null,
    species: row.kit.species,
    breed: row.pet?.breed ?? null,
    ageText: ageText(row.pet?.dateOfBirth ?? null),
    panel: row.kit.panel,
    pathogens: row.result.targets.map((t) => {
      const info = pathogenInfo(t.labCode);
      return { name: info?.name ?? t.name, detected: t.call === "detected", cq: t.cq, whatIsIt: info?.whatIsIt ?? null, whyItMatters: info?.whyItMatters ?? null };
    }),
  };
  let out;
  try {
    out = await (opts.writer ?? ((i) => writeLabSummary(i)))(input);
  } catch (e) {
    if (e instanceof LabSummaryError) throw conflict(e.message);
    throw e;
  }
  const version = await nextVersion(resultId);
  const [report] = await db.insert(s.aiReports).values({ labResultId: resultId, version, model: out.model, content: out.summary }).returning();
  await recordEvent(db, {
    entityType: "kit",
    entityId: row.kit.id,
    type: "ai_report.drafted",
    ...actorFields(ctx),
    payload: { labResultId: resultId, version, model: out.model },
  });
  return { id: report!.id, version, model: out.model, content: out.summary, approved: false, reviewedAt: null, reviewedBy: null };
}

/**
 * Save staff edits as a new version, approved or as a draft. Approving makes
 * it the summary customers see.
 */
export async function saveAiReport(ctx: StaffContext, input: { reportId: string; content: unknown; approve: boolean }): Promise<AiReportView> {
  requirePermission(ctx, "lab_results.release");
  const parsed = labSummarySchema.safeParse(input.content);
  if (!parsed.success) throw invalid("Fill in the summary, next steps and vet guidance.");
  const content = parsed.data;
  if (!content.summary.trim()) throw invalid("The summary can't be empty.");
  if (/[—–]/.test(JSON.stringify(content))) throw invalid("Replace em or en dashes with commas or periods (house style).");
  const db = getDb();
  const [current] = await db.select().from(s.aiReports).where(eq(s.aiReports.id, input.reportId));
  if (!current) throw notFound("Summary");
  const version = await nextVersion(current.labResultId);
  const now = new Date();
  const [report] = await db
    .insert(s.aiReports)
    .values({
      labResultId: current.labResultId,
      version,
      model: current.model,
      content,
      reviewedById: input.approve ? ctx.staffId : null,
      reviewedAt: input.approve ? now : null,
    })
    .returning();
  const [kit] = await db.select({ id: s.labResults.kitId }).from(s.labResults).where(eq(s.labResults.id, current.labResultId));
  await recordEvent(db, {
    entityType: "kit",
    entityId: kit!.id,
    type: input.approve ? "ai_report.approved" : "ai_report.edited",
    ...actorFields(ctx),
    payload: { labResultId: current.labResultId, version },
  });
  return { id: report!.id, version, model: current.model, content, approved: input.approve, reviewedAt: input.approve ? now : null, reviewedBy: input.approve ? ctx.email : null };
}

/** The approved summary a customer may see for a result, if any. */
export async function approvedAiSummary(labResultId: string): Promise<LabSummary | null> {
  const [row] = await getDb()
    .select({ content: s.aiReports.content })
    .from(s.aiReports)
    .where(and(eq(s.aiReports.labResultId, labResultId), sql`${s.aiReports.reviewedAt} is not null`))
    .orderBy(desc(s.aiReports.version))
    .limit(1);
  return (row?.content as LabSummary | undefined) ?? null;
}
