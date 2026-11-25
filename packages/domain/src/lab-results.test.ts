import { describe, expect, it } from "vitest";
import { callFor, LabFileError, parseCsv, parseLabRun, suggestKitCode } from "./lab-results";

const HEADER = "Well,Omit,Target,Sample,Cq,Dyes,Cq Conf,Amp Score,Task,Amp Status,Annotated,Threshold,Baseline Start,Baseline End,Curve Quality,Result Quality Issues";
const row = (well: string, target: string, sample: string, cq: string, amp: string, omit = "FALSE") =>
  `${well},${omit},${target},${sample},${cq},FAM,0.9,1.9,Unknown,${amp},FALSE,1000,3,20,,`;

const FILE = [
  HEADER,
  row("D1", "Giardia spp._FGI", "ffec-002-703", "27.29", "Amp"),
  row("D1", "Salmonella spp._FGI", "ffec-002-703", "Undetermined", "No Amp"),
  row("D1", "FGI Extraction Control_FGI", "ffec-002-703", "20.99", "Amp"),
  row("D2", "Toxocara cati_FGI", "FFEC-002-703", "35.2", "Amp"),
  row("D2", "FGI Extraction Control_FGI", "FFEC-002-703", "20.85", "Amp"),
  row("A1", "Tannerella forsythia_VDP", "fora-002-602", "29.85", "Amp"),
  row("A1", "Treponema denticola_VDP", "fora-002-602", "Undetermined", "No Amp", "TRUE"),
  row("A1", "GAPDH_VDP", "fora-002-602", "Undetermined", "No Amp"),
  row("B1", "Giardia spp._FGI", "Fffec-002-586", "30", "Amp"),
  row("P1", "Giardia spp._FGI", "Positive Control", "25", "Amp"),
  row("P1", "Eimeria spp._FGI", "Positive Control", "Undetermined", "Inconclusive"),
  row("N1", "Giardia spp._FGI", "Negative Control", "Undetermined", "No Amp"),
  row("N1", "NADH_FGI", "Negative Control", "33", "Amp"),
].join("\r\n");

describe("callFor", () => {
  it("detects at or below Cq 34", () => {
    expect(callFor(34)).toBe("detected");
    expect(callFor(34.01)).toBe("not_detected");
    expect(callFor(null)).toBe("not_detected");
  });
});

describe("parseCsv", () => {
  it("handles quotes, BOM and CRLF", () => {
    expect(parseCsv('﻿a,"b,""c"""\r\n1,2\r\n')).toEqual([["a", 'b,"c"'], ["1", "2"]]);
  });
});

describe("suggestKitCode", () => {
  it("fixes one extra character", () => {
    expect(suggestKitCode("Fffec-002-586")).toBe("FFEC-002-586");
    expect(suggestKitCode("hello")).toBeNull();
  });
});

describe("parseLabRun", () => {
  const run = parseLabRun(FILE);

  it("groups samples case-insensitively and calls each target", () => {
    const s = run.samples.find((x) => x.kitCode === "FFEC-002-703")!;
    expect(s.panelCode).toBe("FGI");
    expect(s.detected).toEqual(["Giardia spp."]);
    expect(s.targets.map((t) => [t.name, t.call])).toEqual([
      ["Giardia spp.", "detected"],
      ["Salmonella spp.", "not_detected"],
      ["Toxocara cati", "not_detected"],
    ]);
    expect(s.controls.filter((c) => c.checked)).toHaveLength(2);
    expect(s.flags).toEqual(["Toxocara cati amplified but Cq 35.20 is above the cutoff."]);
  });

  it("flags omitted wells and failed internal controls", () => {
    const s = run.samples.find((x) => x.kitCode === "FORA-002-602")!;
    expect(s.targets.map((t) => t.name)).toEqual(["Tannerella forsythia"]);
    expect(s.flags).toContain("Omitted by the lab: Treponema denticola.");
    expect(s.flags).toContain("Internal control did not amplify (GAPDH).");
  });

  it("keeps mistyped samples unmatched with a suggestion", () => {
    const s = run.samples.find((x) => x.sample === "Fffec-002-586")!;
    expect(s.kitCode).toBeNull();
    expect(s.suggestedCode).toBe("FFEC-002-586");
  });

  it("checks run controls per panel, ignoring internal controls", () => {
    expect(run.runControls).toEqual([
      { kind: "positive", panelCode: "FGI", passed: false, issues: ["Did not detect Eimeria spp. (no Cq)."] },
      { kind: "negative", panelCode: "FGI", passed: true, issues: [] },
    ]);
  });

  it("rejects files that aren't lab exports", () => {
    expect(() => parseLabRun("name,email\nx,y")).toThrow(LabFileError);
  });
});
