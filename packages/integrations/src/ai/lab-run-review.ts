/**
 * AI review of a lab upload, after the cleanup rules have run. Claude reads
 * what the rules couldn't settle (unmatched samples, held rows, odd flags,
 * run controls) and writes plain-English notes for staff, with a suggested
 * kit where a sample ID is clearly a misformatted one.
 *
 * It only suggests: the server re-checks every suggested kit, and a person
 * applies it. It never changes a Cq value or a result.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { LAB_SUMMARY_MODEL } from "./lab-summary";

export const labRunReviewSchema = z.object({
  /** One to three sentences on the upload as a whole. */
  summary: z.string(),
  notes: z.array(
    z.object({
      severity: z.enum(["info", "check", "problem"]),
      /** The sample text from the file, a kit ID, or "run". */
      about: z.string(),
      message: z.string(),
      /** Only for an unmatched sample that is clearly one of the candidate kits written differently. */
      suggestedKitCode: z.string().nullable(),
    }),
  ),
});
export type LabRunReviewOutput = z.infer<typeof labRunReviewSchema>;

export interface LabRunReviewInput {
  filename: string;
  cleanup: { idsNormalized: number; plateControlRows: number; qualityCheckRows: number; offPanelRows: number; heldRows: number };
  runControls: { kind: string; panelCode: string; passed: boolean; issues: string[] }[];
  matchedCount: number;
  /** Matched samples that have review flags. */
  flagged: { kitCode: string; flags: string[] }[];
  unmatched: { sample: string; reason: string; panelCode: string | null; detected: string[] }[];
  held: { panelCode: string; kitPrefix: string | null; wells: string[]; detected: string[] }[];
  /** For the unmatched samples, the closest kits by spelling that are waiting for lab results: the only kits a suggestion may name. */
  candidateKits: { code: string; status: string }[];
}

const SYSTEM = `You review a qPCR results upload for Petwealth's lab staff before they release results to pet owners.

The upload has already been cleaned by fixed rules: kit IDs trimmed and uppercased, plate Positive/Negative Control wells checked separately, internal quality-check targets (extraction controls, NADH, GAPDH) set aside, targets not on the kit's panel list left out, and rows with no kit ID held. You see what those rules could not settle.

Kit IDs look like FFEC-004-926: species F (cat) or C (dog), then FEC (fecal), RES (respiratory) or ORA (oral), then two groups of three digits. Panel codes: FGI cat fecal, CGI dog fecal, FRP cat respiratory, CRP dog respiratory, VDP oral (cats and dogs).

Write short notes staff can act on:
- For an unmatched sample that is clearly a candidate kit written differently (missing dashes, spaces, the letter O for zero, a dropped or doubled character, wrong case), set suggestedKitCode to that candidate's code, exactly as listed. The kit's species and panel must fit the sample's panel code. If two candidates could fit, or none clearly does, leave it null and say why.
- For held rows, say what the panel suggests (e.g. CGI means a dog fecal kit, CFEC) and that a person must decide which kit they belong to; never suggest a kit for held rows. A panel code that isn't listed above means a test type Petwealth doesn't have yet.
- Point out failed run controls and patterns across flags (e.g. many samples missing an internal control, a kit run on the wrong panel).
- Don't repeat every flag; group them. Don't comment on what is fine. If nothing needs attention, return an empty notes list and say so in the summary.

severity: "problem" blocks a correct release (failed run control, wrong panel), "check" needs a person's look, "info" is context.
Never invent kit codes, Cq values or pathogen names. Never give medical advice. Plain words, no em dashes or en dashes, no exclamation marks.`;

export class LabRunReviewError extends Error {
  override name = "LabRunReviewError";
}

export async function writeLabRunReview(input: LabRunReviewInput, client: Anthropic = new Anthropic()): Promise<{ review: LabRunReviewOutput; model: string }> {
  const response = await client.beta.messages.parse({
    model: LAB_SUMMARY_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(labRunReviewSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Review this upload.\n\n${JSON.stringify(input, null, 1)}` }],
  });
  if (response.stop_reason === "refusal") throw new LabRunReviewError("The review was declined. Check the upload by hand.");
  if (response.stop_reason === "max_tokens") throw new LabRunReviewError("The review was cut off. Run it again.");
  const parsed = response.parsed_output;
  if (!parsed) throw new LabRunReviewError("The review didn't come back in the expected shape. Run it again.");
  const tidy = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").trim();
  return {
    model: response.model,
    review: {
      summary: tidy(parsed.summary),
      notes: parsed.notes.map((n) => ({ ...n, about: n.about.trim(), message: tidy(n.message) })),
    },
  };
}
