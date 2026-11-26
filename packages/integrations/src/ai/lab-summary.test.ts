import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { LAB_SUMMARY_MODEL, LabSummaryError, writeLabSummary, type LabSummaryInput } from "./lab-summary";

const input: LabSummaryInput = {
  petName: "Mochi",
  species: "cat",
  breed: "Domestic Shorthair",
  ageText: "2 years",
  panel: "fecal",
  pathogens: [
    { name: "Giardia", detected: true, cq: 27.3, whatIsIt: "A microscopic parasite.", whyItMatters: "Can cause diarrhea." },
    { name: "Salmonella", detected: false, cq: null, whatIsIt: null, whyItMatters: null },
  ],
};

/** Stand-in for the SDK client: records the request and returns a canned response. */
function fakeClient(response: Record<string, unknown>) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (req: Record<string, unknown>) => {
          calls.push(req);
          return response;
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe("writeLabSummary", () => {
  it("sends the pet and results, and tidies dashes out of the reply", async () => {
    const { client, calls } = fakeClient({
      model: LAB_SUMMARY_MODEL,
      stop_reason: "end_turn",
      parsed_output: {
        summary: "We found Giardia in Mochi's sample — worth a vet chat.",
        findings: [{ name: "Giardia", meaning: "A common parasite – often mild." }],
        nextSteps: ["Share this report with your vet."],
        vetUrgency: "soon",
        vetReason: "Giardia is common and treatable.",
      },
    });
    const out = await writeLabSummary(input, client);
    expect(out.summary.summary).toBe("We found Giardia in Mochi's sample, worth a vet chat.");
    expect(out.summary.findings[0]!.meaning).toBe("A common parasite, often mild.");
    expect(out.model).toBe(LAB_SUMMARY_MODEL);

    const req = calls[0]!;
    expect(req.model).toBe(LAB_SUMMARY_MODEL);
    expect(req.fallbacks).toBe("default");
    const text = (req.messages as { content: string }[])[0]!.content;
    expect(text).toContain("Name: Mochi");
    expect(text).toContain("Giardia (CT 27.3)");
    expect(text).toContain("Not detected (1): Salmonella");
  });

  it("drops findings for pathogens that were not detected, and tells the model not to say normal flora", async () => {
    const { client, calls } = fakeClient({
      model: LAB_SUMMARY_MODEL,
      stop_reason: "end_turn",
      parsed_output: {
        summary: "We found Giardia in Mochi's sample.",
        findings: [
          { name: "Giardia (G. duodenalis)", meaning: "A common parasite." },
          { name: "Salmonella", meaning: "Not detected, which is good news." },
        ],
        nextSteps: ["Share this report with your vet."],
        vetUrgency: "soon",
        vetReason: "Giardia is common and treatable.",
      },
    });
    const out = await writeLabSummary(input, client);
    expect(out.summary.findings.map((f) => f.name)).toEqual(["Giardia (G. duodenalis)"]);
    expect(calls[0]!.system).toContain("normal flora");
  });

  it("turns refusals and cut-off replies into clear errors", async () => {
    await expect(writeLabSummary(input, fakeClient({ stop_reason: "refusal", parsed_output: null }).client)).rejects.toThrow(LabSummaryError);
    await expect(writeLabSummary(input, fakeClient({ stop_reason: "max_tokens", parsed_output: null }).client)).rejects.toThrow(/cut off/);
    await expect(writeLabSummary(input, fakeClient({ stop_reason: "end_turn", parsed_output: null }).client)).rejects.toThrow(/expected shape/);
  });
});
