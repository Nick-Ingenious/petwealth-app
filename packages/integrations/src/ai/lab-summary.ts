/**
 * AI-written summary of one pet's lab result, in Petwealth's voice.
 *
 * Staff review (and can edit) every summary before a customer sees it, so
 * this only drafts. Called through the official Anthropic SDK; needs
 * ANTHROPIC_API_KEY (or another credential the SDK resolves).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const LAB_SUMMARY_MODEL = "claude-opus-5-5";

export const labSummarySchema = z.object({
  /** 2 to 4 sentences for the top of the report. */
  summary: z.string(),
  /** One entry per detected pathogen, in plain language. Empty when nothing was detected. */
  findings: z.array(z.object({ name: z.string(), meaning: z.string() })),
  /** 2 to 4 practical next steps for the pet parent. */
  nextSteps: z.array(z.string()),
  /** How soon to involve the vet. */
  vetUrgency: z.enum(["routine", "soon", "promptly"]),
  /** One sentence explaining the urgency. */
  vetReason: z.string(),
});
export type LabSummary = z.infer<typeof labSummarySchema>;

export interface LabSummaryInput {
  petName: string | null;
  species: "dog" | "cat";
  breed: string | null;
  ageText: string | null;
  panel: "fecal" | "respiratory" | "oral";
  pathogens: {
    name: string;
    detected: boolean;
    /** Lab Cq. Lower means more genetic material; null when nothing amplified. */
    cq: number | null;
    whatIsIt: string | null;
    whyItMatters: string | null;
  }[];
}

const SYSTEM = `You write the short summary at the top of a Petwealth pet health test report.

Petwealth makes at-home PCR tests for dogs and cats (fecal, oral and respiratory panels), run in our own lab. Our voice is calm, warm and science-backed: a trusted guide, never alarming, never a salesperson. Love, backed by science.

Rules:
- Never diagnose. A detection means the pathogen's genetic material was found in the sample; it does not by itself mean the pet is sick. Results are interpreted alongside how the pet is feeling.
- The vet is a partner. Encourage sharing the report with the vet; do not suggest skipping the vet, and do not add "this is not a diagnosis" disclaimers.
- Do not recommend specific medications, doses or treatments.
- Use only the facts given. Do not invent symptoms, prevalence numbers or statistics.
- Name the test by panel: fecal, oral or respiratory. Do not say "gut health" or "breathing".
- CT values: lower means more genetic material was found (15 is a high load, 34 is our detection cutoff). You may say a signal is strong or faint; do not quote CT numbers.
- Use the pet's name when given, otherwise "your pet". Write for the pet parent, in second person.
- Plain words, short sentences. No em dashes or en dashes; use commas or periods. No exclamation marks. No emojis.
- vetUrgency: "routine" when nothing was detected or findings are common and usually mild; "soon" when a finding is worth a vet conversation in the next week or two; "promptly" when a finding can be serious, especially in young or vulnerable animals.`;

function describe(input: LabSummaryInput): string {
  const pet = [input.petName ? `Name: ${input.petName}` : "Name: not given", `Species: ${input.species}`, input.breed ? `Breed: ${input.breed}` : null, input.ageText ? `Age: ${input.ageText}` : null]
    .filter(Boolean)
    .join("\n");
  const detected = input.pathogens.filter((p) => p.detected);
  const notDetected = input.pathogens.filter((p) => !p.detected);
  const lines = detected.map(
    (p) =>
      `- ${p.name} (CT ${p.cq?.toFixed(1) ?? "n/a"})${p.whatIsIt ? `\n  What it is: ${p.whatIsIt}` : ""}${p.whyItMatters ? `\n  Why it matters: ${p.whyItMatters}` : ""}`,
  );
  return `${pet}
Panel: ${input.panel}
Pathogens tested: ${input.pathogens.length}

Detected (${detected.length}):
${lines.length ? lines.join("\n") : "- none"}

Not detected (${notDetected.length}): ${notDetected.map((p) => p.name).join(", ") || "none"}

Write the summary.`;
}

/** Replace dash punctuation the house style doesn't allow, in case the model slips. */
const tidy = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",").trim();

export class LabSummaryError extends Error {
  override name = "LabSummaryError";
}

export async function writeLabSummary(input: LabSummaryInput, client: Anthropic = new Anthropic()): Promise<{ summary: LabSummary; model: string }> {
  const response = await client.beta.messages.parse({
    model: LAB_SUMMARY_MODEL,
    max_tokens: 16000,
    // Server-side fallback: if a safety classifier declines, the API retries on another model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(labSummarySchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: describe(input) }],
  });
  if (response.stop_reason === "refusal") throw new LabSummaryError("The model declined to write this summary. Write it by hand instead.");
  if (response.stop_reason === "max_tokens") throw new LabSummaryError("The summary was cut off. Try again.");
  const parsed = response.parsed_output;
  if (!parsed) throw new LabSummaryError("The summary didn't come back in the expected shape. Try again.");
  return {
    model: response.model,
    summary: {
      summary: tidy(parsed.summary),
      findings: parsed.findings.map((f) => ({ name: f.name, meaning: tidy(f.meaning) })),
      nextSteps: parsed.nextSteps.map(tidy),
      vetUrgency: parsed.vetUrgency,
      vetReason: tidy(parsed.vetReason),
    },
  };
}
