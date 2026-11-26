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

describe("cleanup of messy lab files", () => {
  const H = "Well,Omit,Target,Sample,Cq,Dyes,Cq Conf,Amp Score,Task,Amp Status,Annotated,Threshold,Baseline Start,Baseline End,Curve Quality,Result Quality Issues";
  const row = (well: string, target: string, sample: string, cq: string, amp = cq ? "Amp" : "No Amp") => `${well},false,${target},${sample},${cq},FAM,,,UNKNOWN,${amp},,,,,,`;
  const file = [
    H,
    row("A1", "Giardia spp._FGI", " ffec-004-926 ", "30.1"),
    row("A2", "NADH_FGI", " ffec-004-926 ", "25.0"),
    row("A3", "FGI Extraction Control_FGI", " ffec-004-926 ", "27.0"),
    row("A4", "Spike-in Control_FGI", " ffec-004-926 ", "22.0"),
    row("A5", "New Marker_FGI", " ffec-004-926 ", ""),
    row("B1", "Giardia spp._FGI", "Positive Control", "24.0"),
    row("B2", "Giardia spp._FGI", "Negative Control", ""),
    row("C1", "Giardia spp._CGI", "", "31.0"),
    row("C2", "Toxocara canis_CGI", "", ""),
    row("D1", "Microsporum canis_RWP", "", "29.0"),
  ].join("\n");

  it("uppercases kit IDs and keeps plate controls out of the samples", () => {
    const run = parseLabRun(file);
    expect(run.samples.map((s) => s.kitCode)).toEqual(["FFEC-004-926"]);
    expect(run.runControls.map((c) => `${c.kind}:${c.passed}`)).toEqual(["positive:true", "negative:true"]);
  });

  it("only counts targets on the panel list, and flags a detected one that isn't", () => {
    const s = parseLabRun(file).samples[0]!;
    expect(s.targets.map((t) => t.name)).toEqual(["Giardia spp."]);
    expect(s.controls.map((c) => c.name)).toEqual(["NADH", "FGI Extraction Control"]);
    expect(s.ignoredTargets).toEqual(["New Marker", "Spike-in Control"]);
    expect(s.flags).toEqual([
      "Spike-in Control isn't on the FGI panel list, so it was left out (Cq 22.00). If it's a real pathogen, it needs adding to the panel list.",
    ]);
  });

  it("holds rows with no kit ID by panel, never guessing a kit", () => {
    const run = parseLabRun(file);
    expect(run.held).toEqual([
      { panelCode: "CGI", kitPrefix: "CFEC", wells: ["C1", "C2"], rowCount: 2, detected: ["Giardia spp."] },
      { panelCode: "RWP", kitPrefix: null, wells: ["D1"], rowCount: 1, detected: ["Microsporum canis"] },
    ]);
    expect(run.cleanup).toEqual({ idsNormalized: 1, plateControlRows: 2, qualityCheckRows: 2, offPanelRows: 2, heldRows: 3 });
  });

  it("accepts a file that only has held rows", () => {
    expect(parseLabRun([H, row("C1", "Giardia spp._CGI", "", "31.0")].join("\n")).held).toHaveLength(1);
  });
});

describe("suggestKitCode", () => {
  it("fixes missing dashes, spaces and look-alike characters", () => {
    expect(suggestKitCode("FFEC004926")).toBe("FFEC-004-926");
    expect(suggestKitCode("ffec 004 926")).toBe("FFEC-004-926");
    expect(suggestKitCode("FFEC-0O4-926")).toBe("FFEC-004-926");
    expect(suggestKitCode("FRES_1I8_302")).toBe("FRES-118-302");
  });
  it("still fixes one extra character, and gives up on anything else", () => {
    expect(suggestKitCode("FFFEC-002-586")).toBe("FFEC-002-586");
    expect(suggestKitCode("Sample 12")).toBeNull();
    expect(suggestKitCode("ZZZZ-000-000")).toBeNull();
  });
});
