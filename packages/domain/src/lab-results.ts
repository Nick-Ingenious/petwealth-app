/**
 * Reading the lab's PCR export ("WellResult" CSV from the qPCR software).
 *
 * One row per well and target. `Sample` is the kit code (any case), or
 * "Positive Control" / "Negative Control". `Target` is "<name>_<panel code>",
 * e.g. "Giardia spp._FGI". Each panel also runs internal controls (GAPDH,
 * NADH, extraction controls) that are not pathogens.
 *
 * Pure functions only: the upload service matches the groups to kits.
 */
import { parseKitCode, normalizeKitCode } from "./kit-code";
import type { Panel, Species } from "./catalog";

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
  /** Things a reviewer should look at before releasing. Plain sentences. */
  flags: string[];
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
 * Closest valid kit code for a mistyped sample, by deleting one character
 * ("FFFEC-002-586" gives "FFEC-002-586"). Null when there's no single answer.
 */
export function suggestKitCode(sample: string): string | null {
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
    flags,
  };
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
  for (const r of rows) {
    if (!r.sample) continue;
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
  if (!bySample.size) throw new LabFileError("No samples found in the file.");
  const samples = [...bySample.values()].map((g) => buildSample(g.sample, g.rows));
  samples.sort((a, b) => (a.kitCode ?? normalizeKitCode(a.sample)).localeCompare(b.kitCode ?? normalizeKitCode(b.sample)));
  return {
    rowCount: rows.length,
    samples,
    runControls: [...buildRunControls("positive", controlRows.positive), ...buildRunControls("negative", controlRows.negative)],
  };
}
