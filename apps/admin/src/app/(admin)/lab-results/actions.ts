"use server";

import { revalidatePath } from "next/cache";
import {
  assignUnmatchedSample,
  draftAiReport,
  holdLabResultForRerun,
  releaseLabResults,
  saveAiReport,
  uploadLabFile,
  type AiReportView,
} from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function uploadLabFileAction(filename: string, csv: string): Promise<ActionResult<{ id: string }>> {
  const result = await runAction(async (staff) => {
    const r = await uploadLabFile(staff, { filename, csv });
    return { id: r.id };
  });
  if (result.ok) revalidatePath("/lab-results");
  return result;
}

export async function releaseResultsAction(batchId: string, resultIds: string[]): Promise<ActionResult<{ released: string[] }>> {
  const result = await runAction((staff) => releaseLabResults(staff, { resultIds }));
  revalidatePath(`/lab-results/${batchId}`);
  return result;
}

export async function rerunResultAction(batchId: string, resultId: string, reason: string): Promise<ActionResult<{ code: string }>> {
  const result = await runAction((staff) => holdLabResultForRerun(staff, { resultId, reason }));
  revalidatePath(`/lab-results/${batchId}`);
  return result;
}

export async function assignSampleAction(batchId: string, sample: string, kitCode: string): Promise<ActionResult> {
  const result = await runAction(async (staff) => {
    await assignUnmatchedSample(staff, { batchId, sample, kitCode });
    return undefined;
  });
  revalidatePath(`/lab-results/${batchId}`);
  return result;
}

/** Ask Claude for a draft summary of one result (takes a few seconds). */
export async function draftSummaryAction(batchId: string, resultId: string): Promise<ActionResult<AiReportView>> {
  const result = await runAction((staff) => draftAiReport(staff, resultId));
  revalidatePath(`/lab-results/${batchId}`);
  return result;
}

/** Save staff edits to a summary, as a draft or approved for the customer. */
export async function saveSummaryAction(batchId: string, reportId: string, content: unknown, approve: boolean): Promise<ActionResult<AiReportView>> {
  const result = await runAction((staff) => saveAiReport(staff, { reportId, content, approve }));
  revalidatePath(`/lab-results/${batchId}`);
  return result;
}
