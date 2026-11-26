/**
 * Reading the lab's PCR export ("WellResult" CSV from the qPCR software).
 *
 * One row per well and target. `Sample` is the kit code (any case), or
 * "Positive Control" / "Negative Control". `Target` is "<name>_<panel code>",
 * e.g. "Giardia spp._FGI". Each panel also runs internal controls (GAPDH,
 * NADH, extraction controls) that are not pathogens.
 *
 * Cleanup the lab files need (they vary run to run), applied every time:
 * - kit IDs are trimmed and uppercased ("ffec-004-926" is FFEC-004-926);
 * - plate control wells (Positive / Negative Control) check the run as a
 *   whole and never become patient results;
 * - rows with no kit ID are held for a person, never guessed or dropped;
 * - only targets on the kit's panel list count as results, so a new internal
 *   control can't show up on a customer's report. A *detected* target that
 *   isn't on the list is flagged, in case the lab renamed a real pathogen.
 *
 * Pure functions only: the upload service matches the groups to kits.
 */
import { parseKitCode, normalizeKitCode, formatKitCode } from "./kit-code";
import type { Panel, Species } from "./catalog";
import { pathogenInfo } from "./pathogens";

/** A pathogen is "detected" when its Cq is at or below this. Same rule as the old app. */
export const DETECTION_CQ_CUTOFF = 34;

export const LAB_PANEL_CODES = {
  FGI: { species: "cat", panel: "fecal" },
  CGI: { species: "dog", panel: "fecal" },
  FRP: { species: "cat", panel: "respiratory" },
  CRP: { species: "dog", panel: "respiratory" },
  VDP: { species: null, panel: "oral" }, // one oral panel for cats and dogs
} as const satisfies Record<string, { species: Species | null; panel: Panel }>;
export type LabPanelCode = keyof typeof LAB_PANEL_CODES;

export function labPanelCodeFor(species: Species, panel: Panel): LabPanelCode {
  const hit = (Object.keys(LAB_PANEL_CODES) as LabPanelCode[]).find((c) => {
    const p = LAB_PANEL_CODES[c];
    return p.panel === panel && (p.species === null || p.species === species);
  });
  return hit!;
}

/**
 * The control each sample must amplify for its result to be trusted, per panel.
 * NADH is also reported on fecal panels but often fails to amplify in healthy
 * samples, so it's shown to staff but not checked.
 */
const SAMPLE_CONTROL: Record<LabPanelCode, RegExp> = {
  FGI: /extraction control/i,
  CGI: /extraction control/i,
  FRP: /^GAPDH$/i,
  CRP: /^NADH5$/i,
  VDP: /^GAPDH$/i,
};

export function isInternalControlTarget(name: string): boolean {
  return /^(GAPDH|NADH\d*)$/i.test(name) || /extraction control/i.test(name);
}

export type AmpStatus = string; // "Amp" | "No Amp" | "Inconclusive" | "N/A"
export type LabCall = "detected" | "not_detected";

export interface LabRow {
  line: number;
  well: string;
  omitted: boolean;
  sample: string;
  target: string;
  panelCode: LabPanelCode | null;
  /** Target name without the panel suffix. */
  name: string;
  cq: number | null;
  ampStatus: AmpStatus;
}

export interface TargetResult {
  /** Lab code as written in the file, e.g. "Giardia spp._FGI". */
  labCode: string;
  name: string;
  cq: number | null;
  ampStatus: AmpStatus;
  call: LabCall;
  wells: string[];
}

export interface ControlReading {
  name: string;
  well: string;
  cq: number | null;
  ampStatus: AmpStatus;
  /** Counted toward the sample's control check. */
  checked: boolean;
}

/** Kit ID prefix for a lab panel, e.g. CGI gives CFEC. Null for the shared oral panel (cat or dog) and unknown codes. */
export function kitPrefixForPanel(code: string): string | null {
  const p = (LAB_PANEL_CODES as Record<string, { species: Species | null; panel: Panel }>)[code.toUpperCase()];
  return p?.species ? formatKitCode(p.species, p.panel, 0, 0).slice(0, 4) : null;
}

export interface SampleGroup {
  /** Sample text exactly as in the file (first occurrence). */
  sample: string;
  /** Valid kit code, or null when the sample text isn't one. */
  kitCode: string | null;
  /** For a mistyped code, the closest valid code (e.g. FFFEC-002-586 gives FFEC-002-586). */
  suggestedCode: string | null;
  panelCode: LabPanelCode | null;
  targets: TargetResult[];
  controls: ControlReading[];
  detected: string[];
  /** Targets left out because they aren't on the kit's panel list (e.g. a new internal control). */
  ignoredTargets: string[];
  /** Things a reviewer should look at before releasing. Plain sentences. */
  flags: string[];
}

/** Rows with no kit ID in the Sample column, grouped by the panel code on their targets. Held for a person. */
export interface HeldRows {
  /** Panel code from the targets, e.g. "CGI"; "RWP" for a panel we don't have; "" when none. */
  panelCode: string;
  /** What the panel says the sample is, e.g. "CFEC" (canine fecal). Null when the panel isn't one of ours. */
  kitPrefix: string | null;
  wells: string[];
  rowCount: number;
  /** Targets at or below the cutoff in these rows. */
  detected: string[];
}

/** What cleanup did to this file, for the upload page. */
export interface LabCleanupSummary {
  /** Kit IDs that needed trimming or uppercasing. */
  idsNormalized: number;
  /** Positive / Negative Control rows (checked as run controls). */
  plateControlRows: number;
  /** Internal quality-check rows (extraction controls, NADH, GAPDH). */
  qualityCheckRows: number;
  /** Rows for targets not on the kit's panel list, left out of results. */
  offPanelRows: number;
  /** Rows with no kit ID, held for a person. */
  heldRows: number;
}

export interface RunControl {
  kind: "positive" | "negative";
  panelCode: LabPanelCode;
  passed: boolean;
  /** Why it failed, e.g. "Did not detect Eimeria spp." */
  issues: string[];
}

export interface ParsedLabRun {
  rowCount: number;
  samples: SampleGroup[];
  runControls: RunControl[];
  held: HeldRows[];
  cleanup: LabCleanupSummary;
}

export class LabFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabFileError";
  }
}

// ── CSV ────────────────────────────────────────────────────────────────

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const REQUIRED_COLUMNS = ["Well", "Target", "Sample", "Cq", "Amp Status"] as const;

function parseCq(raw: string): number | null {
  const v = raw.trim();
  if (!v || /^(undetermined|undefined|n\/?a)$/i.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseLabRows(text: string): LabRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new LabFileError("The file is empty.");
  const col = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const missing = REQUIRED_COLUMNS.filter((c) => !col.has(c.toLowerCase()));
  if (missing.length) {
    throw new LabFileError(
      `This doesn't look like a lab results export. Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    );
  }
  const get = (r: string[], name: string) => (r[col.get(name.toLowerCase()) ?? -1] ?? "").trim();
  const rows = body.map((r, i): LabRow => {
    const target = get(r, "Target");
    const sep = target.lastIndexOf("_");
    const suffix = sep > 0 ? target.slice(sep + 1).toUpperCase() : "";
    const panelCode = suffix in LAB_PANEL_CODES ? (suffix as LabPanelCode) : null;
    return {
      line: i + 2,
      well: get(r, "Well"),
      omitted: /^true$/i.test(get(r, "Omit")),
      sample: get(r, "Sample"),
      target,
      panelCode,
      name: panelCode ? target.slice(0, sep).trim() : target,
      cq: parseCq(get(r, "Cq")),
      ampStatus: get(r, "Amp Status"),
    };
  });
  if (!rows.length) throw new LabFileError("The file has a header but no results.");
  return rows;
}

// ── Grouping and calls ─────────────────────────────────────────────────

export function callFor(cq: number | null): LabCall {
  return cq !== null && cq <= DETECTION_CQ_CUTOFF ? "detected" : "not_detected";
}

/**
 * Closest valid kit code for a mistyped sample: missing or odd separators and
 * look-alike characters ("FFEC 0O4926" gives "FFEC-004-926"), or one extra
 * character ("FFFEC-002-586" gives "FFEC-002-586"). Null when there's no single answer.
 */
export function suggestKitCode(sample: string): string | null {
  // Letters and digits only; in the number part, O reads as 0 and I or L as 1.
  const compact = sample.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const folded = compact.slice(0, 4) + compact.slice(4).replace(/O/g, "0").replace(/[IL]/g, "1");
  const reshaped = /^([A-Z]{4})(\d{3})(\d{3})$/.exec(folded);
  if (reshaped) {
    const p = parseKitCode(`${reshaped[1]}-${reshaped[2]}-${reshaped[3]}`);
    if (p) return p.code;
  }
  const s = normalizeKitCode(sample);
  const found = new Set<string>();
  for (let i = 0; i < s.length; i++) {
    const p = parseKitCode(s.slice(0, i) + s.slice(i + 1));
    if (p) found.add(p.code);
  }
  return found.size === 1 ? [...found][0]! : null;
}

function controlKind(sample: string): "positive" | "negative" | null {
  if (/^pos(itive)?\b|^pc$/i.test(sample)) return "positive";
  if (/^neg(ative)?\b|^nc$|^ntc$/i.test(sample)) return "negative";
  return null;
}

const fmtCq = (cq: number | null) => (cq === null ? "no Cq" : `Cq ${cq.toFixed(2)}`);

function buildSample(sample: string, rows: LabRow[]): SampleGroup {
  const parsed = parseKitCode(sample);
  const kitCode = parsed?.code ?? null;
  const flags: string[] = [];
  const panels = [...new Set(rows.map((r) => r.panelCode).filter((p): p is LabPanelCode => !!p))];
  const panelCode = panels.length === 1 ? panels[0]! : null;
  if (panels.length > 1) flags.push(`Rows from more than one panel (${panels.join(", ")}).`);
  if (rows.some((r) => !r.panelCode)) flags.push("Some targets have no recognised panel code.");
  if (parsed && panelCode) {
    const expected = labPanelCodeFor(parsed.species, parsed.panel);
    if (expected !== panelCode) flags.push(`Kit is ${parsed.code.slice(0, 4)} but was run on the ${panelCode} panel.`);
  }

  const targets = new Map<string, TargetResult>();
  const controls: ControlReading[] = [];
  const omitted: string[] = [];
  const offPanel = new Map<string, number | null>();
  for (const r of rows) {
    if (r.omitted) {
      omitted.push(r.name);
      continue;
    }
    if (isInternalControlTarget(r.name)) {
      const checked = r.panelCode ? SAMPLE_CONTROL[r.panelCode].test(r.name) : false;
      controls.push({ name: r.name, well: r.well, cq: r.cq, ampStatus: r.ampStatus, checked });
      continue;
    }
    // Only targets on the panel list are results; keep the best Cq of anything else to flag it.
    if (!pathogenInfo(r.target)) {
      const prev = offPanel.get(r.name);
      if (prev === undefined || (r.cq !== null && (prev === null || r.cq < prev))) offPanel.set(r.name, r.cq);
      continue;
    }
    const prev = targets.get(r.target);
    if (prev) {
      // Same target in two wells: keep the strongest signal (lowest Cq).
      prev.wells.push(r.well);
      if (r.cq !== null && (prev.cq === null || r.cq < prev.cq)) {
        prev.cq = r.cq;
        prev.ampStatus = r.ampStatus;
        prev.call = callFor(r.cq);
      }
      continue;
    }
    targets.set(r.target, { labCode: r.target, name: r.name, cq: r.cq, ampStatus: r.ampStatus, call: callFor(r.cq), wells: [r.well] });
  }

  const list = [...targets.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const [name, cq] of offPanel) {
    if (callFor(cq) === "detected") {
      flags.push(`${name} isn't on the ${panelCode ?? "kit's"} panel list, so it was left out (${fmtCq(cq)}). If it's a real pathogen, it needs adding to the panel list.`);
    }
  }
  if (omitted.length) flags.push(`Omitted by the lab: ${[...new Set(omitted)].join(", ").replace(/\.$/, "")}.`);
  for (const t of list) {
    if (t.wells.length > 1) flags.push(`${t.name} was run in ${t.wells.length} wells; using the lowest Cq.`);
    const amp = t.ampStatus.toLowerCase();
    if (amp === "inconclusive") flags.push(`${t.name} was inconclusive on the machine (${fmtCq(t.cq)}).`);
    else if (amp === "amp" && t.call === "not_detected") flags.push(`${t.name} amplified but ${fmtCq(t.cq)} is above the cutoff.`);
    else if (amp === "no amp" && t.call === "detected") flags.push(`${t.name} marked No Amp but ${fmtCq(t.cq)} is under the cutoff.`);
  }
  const checked = controls.filter((c) => c.checked);
  if (panelCode && !checked.length) flags.push("No internal control result for this sample.");
  const failedControls = checked.filter((c) => c.cq === null);
  if (failedControls.length) {
    flags.push(`Internal control did not amplify (${[...new Set(failedControls.map((c) => c.name))].join(", ")}).`);
  }

  return {
    sample,
    kitCode,
    suggestedCode: kitCode ? null : suggestKitCode(sample),
    panelCode,
    targets: list,
    controls,
    detected: list.filter((t) => t.call === "detected").map((t) => t.name),
    ignoredTargets: [...offPanel.keys()].sort(),
    flags,
  };
}

/** Rows with no kit ID, grouped by the panel code written on their targets. */
function buildHeld(rows: LabRow[]): HeldRows[] {
  const byPanel = new Map<string, LabRow[]>();
  for (const r of rows) {
    const sep = r.target.lastIndexOf("_");
    const code = sep > 0 ? r.target.slice(sep + 1).trim().toUpperCase() : "";
    byPanel.set(code, [...(byPanel.get(code) ?? []), r]);
  }
  return [...byPanel.entries()]
    .map(([panelCode, prs]) => ({
      panelCode,
      kitPrefix: kitPrefixForPanel(panelCode),
      wells: [...new Set(prs.map((r) => r.well))].sort(),
      rowCount: prs.length,
      detected: [
        ...new Set(
          prs
            .filter((r) => !r.omitted && !isInternalControlTarget(r.name) && callFor(r.cq) === "detected")
            // Unknown panels keep their code on the name ("Microsporum canis_RWP"); show the name alone.
            .map((r) => (panelCode && r.name.toUpperCase().endsWith(`_${panelCode}`) ? r.name.slice(0, -panelCode.length - 1).trim() : r.name)),
        ),
      ].sort(),
    }))
    .sort((a, b) => a.panelCode.localeCompare(b.panelCode));
}

function buildRunControls(kind: "positive" | "negative", rows: LabRow[]): RunControl[] {
  const byPanel = new Map<LabPanelCode, LabRow[]>();
  for (const r of rows) {
    if (r.omitted || !r.panelCode || isInternalControlTarget(r.name)) continue;
    byPanel.set(r.panelCode, [...(byPanel.get(r.panelCode) ?? []), r]);
  }
  return [...byPanel.entries()].map(([panelCode, prs]) => {
    // Best (lowest) Cq per target across wells.
    const best = new Map<string, number | null>();
    for (const r of prs) {
      const prev = best.get(r.name);
      if (prev === undefined || (r.cq !== null && (prev === null || r.cq < prev))) best.set(r.name, r.cq);
    }
    const issues: string[] = [];
    for (const [name, cq] of best) {
      if (kind === "positive" && callFor(cq) !== "detected") issues.push(`Did not detect ${name} (${fmtCq(cq)}).`);
      if (kind === "negative" && callFor(cq) === "detected") issues.push(`Detected ${name} (${fmtCq(cq)}).`);
    }
    return { kind, panelCode, passed: issues.length === 0, issues };
  });
}

/** Parse a lab export and group it by sample. Throws `LabFileError` for files we can't read at all. */
export function parseLabRun(text: string): ParsedLabRun {
  const rows = parseLabRows(text);
  const bySample = new Map<string, { sample: string; rows: LabRow[] }>();
  const controlRows = { positive: [] as LabRow[], negative: [] as LabRow[] };
  const heldRows: LabRow[] = [];
  for (const r of rows) {
    if (!r.sample) {
      heldRows.push(r); // no kit ID: a person decides, we never guess
      continue;
    }
    const kind = controlKind(r.sample);
    if (kind) {
      controlRows[kind].push(r);
      continue;
    }
    // Group "ffec-002-703" and "FFEC-002-703" together.
    const key = normalizeKitCode(r.sample);
    const g = bySample.get(key);
    if (g) g.rows.push(r);
    else bySample.set(key, { sample: r.sample, rows: [r] });
  }
  if (!bySample.size && !heldRows.length) throw new LabFileError("No samples found in the file.");
  const samples = [...bySample.values()].map((g) => buildSample(g.sample, g.rows));
  samples.sort((a, b) => (a.kitCode ?? normalizeKitCode(a.sample)).localeCompare(b.kitCode ?? normalizeKitCode(b.sample)));
  const sampleRows = [...bySample.values()].flatMap((g) => g.rows);
  return {
    rowCount: rows.length,
    samples,
    runControls: [...buildRunControls("positive", controlRows.positive), ...buildRunControls("negative", controlRows.negative)],
    held: buildHeld(heldRows),
    cleanup: {
      idsNormalized: samples.filter((s) => s.kitCode && s.sample !== s.kitCode).length,
      plateControlRows: controlRows.positive.length + controlRows.negative.length,
      qualityCheckRows: sampleRows.filter((r) => !r.omitted && isInternalControlTarget(r.name)).length,
      offPanelRows: sampleRows.filter((r) => !r.omitted && !isInternalControlTarget(r.name) && !pathogenInfo(r.target)).length,
      heldRows: heldRows.length,
    },
  };
}

// ── Upload review (stored on the upload) ───────────────────────────────

/** Held rows as stored on an upload, with who set them aside. */
export type StoredHeldRows = HeldRows & { dismissedBy?: string | null; dismissedAt?: string | null };

/** One note from the AI review of an upload. Suggestions are only ever applied by a person. */
export interface LabReviewNote {
  severity: "info" | "check" | "problem";
  /** A sample, kit ID or "run". */
  about: string;
  message: string;
  /** Checked on the server: the kit exists, is waiting for results and fits the panel. */
  suggestion: { sample: string; kitCode: string } | null;
}

export interface LabRunReview {
  status: "running" | "done" | "failed" | "unavailable";
  summary: string | null;
  notes: LabReviewNote[];
  model: string | null;
  error: string | null;
  /** ISO time. */
  reviewedAt: string;
}
