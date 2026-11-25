"use server";

import { revalidatePath } from "next/cache";
import { assignUnmatchedSample, holdLabResultForRerun, releaseLabResults, uploadLabFile } from "@petwealth/api";
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
