import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { LAB_SUMMARY_MODEL } from "./lab-summary";
import { LabRunReviewError, writeLabRunReview, type LabRunReviewInput } from "./lab-run-review";

const input: LabRunReviewInput = {
  filename: "WellResult.csv",
  cleanup: { idsNormalized: 3, plateControlRows: 162, qualityCheckRows: 137, offPanelRows: 0, heldRows: 4 },
  runControls: [{ kind: "positive", panelCode: "FGI", passed: true, issues: [] }],
  matchedCount: 40,
  flagged: [],
  unmatched: [{ sample: "FFEC004926", reason: "Not a valid kit code.", panelCode: "FGI", detected: [] }],
  held: [{ panelCode: "RWP", kitPrefix: null, wells: ["H1"], detected: ["Microsporum canis"] }],
  candidateKits: [{ code: "FFEC-004-926", status: "received_at_lab" }],
};

function fakeClient(response: Record<string, unknown>) {
  const calls: Record<string, unknown>[] = [];
  const client = { beta: { messages: { parse: async (req: Record<string, unknown>) => (calls.push(req), response) } } } as unknown as Anthropic;
  return { client, calls };
}

describe("writeLabRunReview", () => {
  it("sends the upload's leftovers and tidies dashes out of the notes", async () => {
    const { client, calls } = fakeClient({
      model: LAB_SUMMARY_MODEL,
      stop_reason: "end_turn",
      parsed_output: {
        summary: "One sample is a kit ID without dashes — easy fix.",
        notes: [{ severity: "check", about: " FFEC004926 ", message: "Same as FFEC-004-926 – missing dashes.", suggestedKitCode: "FFEC-004-926" }],
      },
    });
    const out = await writeLabRunReview(input, client);
    expect(out.review.summary).toBe("One sample is a kit ID without dashes, easy fix.");
    expect(out.review.notes[0]).toEqual({ severity: "check", about: "FFEC004926", message: "Same as FFEC-004-926, missing dashes.", suggestedKitCode: "FFEC-004-926" });
    const req = calls[0]!;
    expect(req.model).toBe(LAB_SUMMARY_MODEL);
    expect(String(req.system)).toContain("never suggest a kit for held rows");
    expect((req.messages as { content: string }[])[0]!.content).toContain('"candidateKits"');
  });

  it("turns refusals and cut-off replies into clear errors", async () => {
    await expect(writeLabRunReview(input, fakeClient({ stop_reason: "refusal", parsed_output: null }).client)).rejects.toThrow(LabRunReviewError);
    await expect(writeLabRunReview(input, fakeClient({ stop_reason: "max_tokens", parsed_output: null }).client)).rejects.toThrow(/cut off/);
  });
});
