"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  FlaskConical,
  Info,
  Sparkles,
  TestTube2,
  TriangleAlert,
} from "lucide-react";
import type { CustomerLabReport, CustomerPathogenResult } from "@petwealth/api";
import { cn } from "@petwealth/ui";
import {
  CAN_PRESCRIBE,
  CLINICAL_SIGNS,
  CT_EXPLAINER,
  DISCLAIMER,
  EMERGENCY_SIGNS,
  PANEL_TITLE,
  PAWP_URL,
  SIGNS_TO_WATCH,
  SPECIMEN,
  STORE_URL,
  STORY_BODY,
  SUPPORT_EMAIL,
  firstSentence,
  formatAge,
  formatSex,
  formatWeight,
  heroBody,
  heroButton,
  heroTitle,
  nextTest,
  truncName,
  whyWeRan,
} from "./report-copy";

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const fmt = (d: Date | null) => (d ? shortDate.format(new Date(d)) : null);

/** Lab Cq, or 40.0 ("none") when nothing amplified. */
const ctText = (cq: number | null) => (cq ?? 40).toFixed(1);

const VET_LABEL = {
  routine: "Mention it at your next regular vet visit",
  soon: "Book a vet visit in the next week or two",
  promptly: "Contact your vet promptly",
} as const;

const HEADER_TINT = {
  oral: "rgba(168,85,247,0.3)",
  fecal: "rgba(245,158,11,0.3)",
  respiratory: "rgba(20,184,166,0.3)",
} as const;

const HERO_GRADIENT = {
  needs_attention: "linear-gradient(112deg, #F2E93E 3%, #DFC116 28%, #D88220 55%, #B54707 81%)",
  clean: "linear-gradient(110deg, #6C8C86 0%, #4C8770 55%, #2E6A56 100%)",
} as const;

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs font-bold uppercase tracking-[0.06em] text-[#5F666B]", className)}>{children}</p>;
}

function VetLink({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <a href={PAWP_URL} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

// ── Pathogen card ────────────────────────────────────────────────────────

function CtTile({ cq }: { cq: number | null }) {
  return (
    <div className="rounded-2xl bg-[#F9F8F5] p-4">
      <Eyebrow>CT value</Eyebrow>
      <p className="mt-1 font-display text-2xl text-[#020617]">{Number((cq ?? 40).toFixed(1))}</p>
      <p className="mt-2 text-xs text-[#4A5565]">15 = high · 40 = none</p>
    </div>
  );
}

function PathogenCard({
  p,
  petName,
  defaultOpen,
  meaning = null,
}: {
  p: CustomerPathogenResult;
  petName: string | null;
  defaultOpen: boolean;
  /** From the approved AI summary. */
  meaning?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const detected = p.detected;
  const summary = firstSentence(p.whatIsIt);
  return (
    <li
      className="overflow-hidden rounded-[18px] border border-black/[0.06] p-4"
      style={{ background: detected ? "linear-gradient(180deg, #FFF4E7 0%, #FFFFFF 64px)" : "linear-gradient(180deg, #F3FFF1 0%, #FFFFFF 64px)" }}
    >
      <button type="button" className="w-full text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="flex items-start gap-2.5">
          <Image src={detected ? "/report/virus.png" : "/report/virus-green.png"} alt="" width={22} height={22} className="mt-0.5 size-[22px] shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold leading-snug text-[#19242B]">{p.name}</span>
            {open && p.commonName ? <span className="block text-sm italic text-[#6A7282]">{p.commonName}</span> : null}
            {p.tagName ? <span className="block text-sm italic text-[#4B5563]">{p.tagName}</span> : null}
          </span>
          <ChevronRight className={cn("mt-0.5 size-5 shrink-0 text-[#8A847B] transition-transform", open && "rotate-90")} aria-hidden />
        </span>
        <span className="mt-2 flex items-center justify-between gap-3">
          {detected ? (
            <span className="text-base text-[#19242B]">
              CT Value: <strong className="text-xl text-[#FF6900]">{ctText(p.cq)}</strong>
            </span>
          ) : (
            <span className="text-xs text-[#6A7282]">CT Value: {ctText(p.cq)} · not detected</span>
          )}
          {detected ? (
            <span className="shrink-0 rounded-full bg-[#FF6900] px-2 py-1 text-xs font-bold text-white">Detected</span>
          ) : (
            <span className="shrink-0 rounded-full bg-[#ECFDF5] px-2 py-1 text-xs font-semibold text-[#059669]">Not detected</span>
          )}
        </span>
        {summary ? <span className="mt-2 block text-sm leading-5 text-[#4A5565]">{summary}</span> : null}
      </button>

      {open ? (
        <div className="mt-5 space-y-5">
          {!detected ? (
            <p className="rounded-xl border border-[#34D399] bg-[#ECFDF5] px-3 py-2.5 text-sm text-[#065F46]">
              ✓&nbsp;&nbsp;{p.name} was not detected in {petName ? truncName(petName) : "your pet"}&apos;s sample. This is a positive indicator for health.
            </p>
          ) : (
            <CtTile cq={p.cq} />
          )}
          {meaning ? (
            <div className="rounded-xl bg-[#F4F0FF] p-3">
              <Eyebrow>What this means for {petName ? truncName(petName) : "your pet"}</Eyebrow>
              <p className="mt-1 text-sm leading-5 text-[#1E2228]">{meaning}</p>
            </div>
          ) : null}
          {p.whatIsIt ? (
            <div>
              <Eyebrow>What is it</Eyebrow>
              <p className="mt-1 text-sm leading-5 text-[#1E2228]">{p.whatIsIt}</p>
            </div>
          ) : null}
          {p.whyItMatters ? (
            <div>
              <Eyebrow>Why it matters</Eyebrow>
              <p className="mt-1 text-sm leading-5 text-[#1E2228]">{p.whyItMatters}</p>
            </div>
          ) : null}
          {p.impact ? (
            <p className="text-sm leading-5 text-[#1E2228]">
              <strong className="italic text-[#191B1D]">Impact:</strong> {p.impact}
            </p>
          ) : null}
          {detected ? (
            <VetLink className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#CAB3FF] px-4 text-sm font-semibold text-[#19242B] hover:bg-[#B89FFF]">
              Ask a vet about {p.commonName ?? p.name} <ArrowRight className="size-4" aria-hidden />
            </VetLink>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────

function AskAVet({ petName }: { petName: string | null }) {
  return (
    <section className="overflow-hidden rounded-[25px] p-5 text-center" style={{ background: "linear-gradient(180deg, #EAC8F4 0%, #EAC8F4 64.9%, #DEDCFC 99%)" }}>
      <Image src="/report/pawp-phone.png" alt="" width={599} height={399} className="mx-auto h-auto w-full max-w-72" />
      <h2 className="mt-3 font-display text-2xl leading-tight tracking-[-0.03em] text-[#351C6F]">
        Looking for personalized guidance with {petName ? truncName(petName) : "your pet"}’s results?
      </h2>
      <p className="mt-2 text-sm text-[#4B5563]">Schedule a call with our licensed 24/7 tele-vet via Pawp.</p>
      <VetLink className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#19242B]">
        Ask a Vet Anything <ArrowRight className="size-4" aria-hidden />
      </VetLink>
    </section>
  );
}

function InfoCard({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F3ECE3] text-[#19242B]">{icon}</span>
        <div>
          <h2 className="text-base font-medium text-[#1F2937]">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-[#4B5563]">{children}</p>
        </div>
      </div>
    </section>
  );
}

function NextTestCard({ base }: { base: Date }) {
  const { months, label } = nextTest(new Date(base));
  return (
    <section className="rounded-[18px] bg-white p-5 text-center">
      <CalendarCheck className="mx-auto size-6 text-[#19242B]" aria-hidden />
      <Eyebrow className="mt-2">Next recommended test</Eyebrow>
      <p className="mt-1 font-display text-2xl text-[#020617]">
        {months} month{months === 1 ? "" : "s"}
      </p>
      <p className="mt-1 text-xs text-[#4B5563]">Retest in {label}</p>
    </section>
  );
}

function EmergencySigns({ panel }: { panel: CustomerLabReport["panel"] }) {
  return (
    <section className="rounded-[18px] bg-white p-5">
      <Eyebrow>Emergency signs to watch for</Eyebrow>
      <ul className="mt-3 space-y-3">
        {EMERGENCY_SIGNS[panel].map((sign) => (
          <li key={sign} className="flex items-start gap-2.5 text-sm text-[#1E2228]">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#B0791F]" aria-hidden />
            {sign}
          </li>
        ))}
      </ul>
    </section>
  );
}

function KitJourney({ report }: { report: CustomerLabReport }) {
  const j = report.journey;
  const steps: { title: string; detail?: string; meta: string | null }[] = [
    { title: "Activated Kit", detail: "Your kit is registered!", meta: `Kit ID: ${report.kitCode}` },
    { title: "Sample collected", meta: [fmt(j.collectedAt), SPECIMEN[report.panel]].filter(Boolean).join(" · ") },
    { title: "Your shipping QR code is ready", meta: "FedEx has your mailer" },
    { title: "In Transit", meta: fmt(j.inTransitAt) },
    { title: "Received at Lab", meta: j.receivedAt ? `${fmt(j.receivedAt)} · Petwealth Diagnostics, Addison TX` : null },
    { title: "Results ready", meta: fmt(report.releasedAt) },
  ];
  return (
    <section className="rounded-[18px] bg-white p-5">
      <Eyebrow>Kit journey</Eyebrow>
      <ol className="mt-4">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 ? <span className="absolute left-[11px] top-6 h-[calc(100%-20px)] w-0.5 bg-[#2F6B4F]/30" aria-hidden /> : null}
            <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-[#2F6B4F] text-white">
              <Check className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
                <p className={cn("font-semibold text-[#19242B]", s.detail ? "text-xs text-[#6F6A64]" : "text-sm")}>{s.title}</p>
                {s.detail ? <p className="text-lg font-semibold text-[#19242B]">{s.detail}</p> : null}
                {s.meta ? <p className="text-xs text-[#6F6A64]">{s.meta}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  function KitLinks({ report }: { report: CustomerLabReport }) {
    const img = `/kits/${report.species}-${report.panel}.webp`;
    const row = "flex min-h-20 items-center gap-3 rounded-[18px] bg-[#F3ECE3] px-4 py-3";
    return (
      <div className="space-y-3">
        <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className={row}>
          <Image src={img} alt="" width={1200} height={656} className="h-12 w-auto" />
          <span className="flex-1 text-base font-semibold text-[#19242B]">Purchase another kit</span>
          <ChevronRight className="size-5 text-[#8A847B]" aria-hidden />
        </a>
        <Link href="/register" className={row}>
          <Image src={img} alt="" width={1200} height={656} className="h-12 w-auto" />
          <span className="flex-1 text-base font-semibold text-[#19242B]">Activate another kit</span>
          <ChevronRight className="size-5 text-[#8A847B]" aria-hidden />
        </Link>
      </div>
    );
  }

  function CareTab({ report }: { report: CustomerLabReport }) {
    const pet = report.pet.name;
    const clean = report.status === "clean";
    const tiles = [
      { title: pet ? `${truncName(pet)}'s results pre-loaded` : "Results pre-loaded", body: "CT values loaded before appointment." },
      { title: "Specialist matched", body: "Routed to vets with experience." },
      { title: "Available right now", body: "No waiting room. Connect in minutes." },
      { title: "Can prescribe*", body: CAN_PRESCRIBE[report.panel] },
    ];
    const ai = report.aiSummary;
    const steps = ai?.nextSteps.map((x) => x.trim()).filter(Boolean) ?? [];
    return (
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
          {ai && steps.length ? (
            <section className="rounded-[18px] bg-white p-5">
              <h2 className="font-display text-2xl text-[#1F2937]">Your next steps</h2>
              <ol className="mt-3 space-y-3">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-5 text-[#1E2228]">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#F2ECFF] text-xs font-bold text-[#5B3FA8]">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="mt-4 rounded-xl bg-[#F9F8F5] px-4 py-3 text-sm text-[#1E2228]">
                <strong>{VET_LABEL[ai.vetUrgency]}.</strong> {ai.vetReason}
              </p>
            </section>
          ) : null}
          <AskAVet petName={pet} />
        </div>
        <div className="space-y-4">
          <section className="rounded-2xl border-2 border-[#EAE0FF] bg-[#F4F0FF] p-5">
            <h2 className="font-display text-2xl leading-tight text-[#5B21B6]">Get a personalized plan from a licensed vet</h2>
            <p className="mt-1 text-sm text-[#5B21B6]">Powered by Pawp. Licensed vets available 24/7.</p>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {tiles.map((t) => (
                <li key={t.title} className="rounded-xl bg-white/65 p-3">
                  <p className="text-sm font-semibold text-[#5B21B6]">{t.title}</p>
                  <p className="mt-0.5 text-xs text-[#5B21B6]">{t.body}</p>
                </li>
              ))}
            </ul>
            <VetLink className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-[#CAB3FF] text-sm font-semibold text-[#19242B]">
              Ask a Vet Anything <ArrowRight className="size-4" aria-hidden />
            </VetLink>
            <p className="mt-2 text-center text-xs text-[#846ABF]">Licensed vets · Available 24/7 · Powered by Pawp</p>
          </section>
          <section className="rounded-[18px] bg-white p-5">
            <h2 className="font-display text-2xl text-[#1F2937]">Signs to Watch for</h2>
            <p className="mt-1 text-sm text-[#4B5563]">
              {clean
                ? `${pet ?? "Your pet"} doesn't need intervention right now. Focus on prevention to keep their results clear.`
                : `Emergency Signs to tell the vet if ${pet ?? "your pet"} has:`}
            </p>
            <ul className="mt-4 space-y-4">
              {SIGNS_TO_WATCH[report.panel].map((s) => (
                <li key={s.title} className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#FEF3C7]">
                    <TriangleAlert className="size-4 text-[#D97706]" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#19242B]">{s.title}</p>
                    <p className="text-sm text-[#4B5563]">{s.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <NextTestCard base={report.journey.collectedAt ?? report.releasedAt} />
          <EmergencySigns panel={report.panel} />
        </div>
      </div>
    );
  }

  // ── Screen ───────────────────────────────────────────────────────────────

  export function ReportView({ report }: { report: CustomerLabReport }) {
    const [tab, setTab] = useState<"overview" | "care">("overview");
    const pet = report.pet;
    const clean = report.status === "clean";
    const total = report.detected.length + report.notDetected.length;
    const panelTitle = PANEL_TITLE[report.panel];
    const ai = report.aiSummary;
    const [lead, rest] = ai ? [ai.summary, ""] : heroBody(clean, report.detected.length, pet.name);
    const meaningFor = (name: string) => ai?.findings.find((f) => f.name.toLowerCase() === name.toLowerCase())?.meaning ?? null;
    const meta = [pet.breed, formatAge(pet.dateOfBirth), formatWeight(pet.weightLbs), formatSex(pet.sex)].filter(Boolean).join(" · ");
    const collected = fmt(report.journey.collectedAt);

    return (
      <div className="min-h-dvh bg-[#FBF8F4]">
        {/* Header: pet photo (or a panel-tinted backdrop) under a dark shade. */}
        <header className="relative isolate overflow-hidden bg-[#061D23] px-4 pb-12 pt-4 text-white lg:px-10 lg:pb-16 lg:pt-6">
          {pet.photoUrl ? (
            // Phones: the photo fills the header. Desktop shows a portrait instead (stretched this wide, it would blur).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pet.photoUrl} alt="" className="absolute inset-0 -z-20 size-full object-cover lg:hidden" />
          ) : null}
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: pet.photoUrl
                ? "linear-gradient(180deg, rgba(6,29,35,0) 24%, #061D23 100%)"
                : `linear-gradient(180deg, ${HEADER_TINT[report.panel]} 0%, rgba(0,0,0,0.8) 100%)`,
            }}
            aria-hidden
          />
          <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-6xl">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/kits/${report.kitCode}`} aria-label="Back to kit" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15">
                <ChevronLeft className="size-5" aria-hidden />
              </Link>
              <p className="line-clamp-2 text-center text-lg font-semibold">
                {pet.name ?? "Your pet"}&apos;s {panelTitle} Health Report
              </p>
              <a href={`/api/kits/${report.kitCode}/report`} aria-label="Download report" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15">
                <Download className="size-5" aria-hidden />
              </a>
            </div>
            <div className="lg:mt-10 lg:flex lg:items-end lg:gap-8">
              {pet.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pet.photoUrl} alt="" className="hidden size-40 shrink-0 rounded-[28px] object-cover ring-4 ring-white/15 lg:block" />
              ) : null}
              <div className="min-w-0">
              <h1 className="mt-16 truncate font-display text-6xl leading-[1.1] tracking-[-0.02em] lg:mt-0 lg:text-7xl">{pet.name ?? "Your pet"}</h1>
              {meta ? <p className="mt-1 text-sm text-[#F1F5F9] lg:text-base">{meta}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {collected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-0.5 text-sm text-[#F1F5F9]">
                    <CalendarDays className="size-4" aria-hidden /> {collected}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-0.5 text-sm text-[#F1F5F9]">
                  <TestTube2 className="size-4" aria-hidden /> {report.kitCode}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative -mt-6 rounded-t-[18px] bg-[#FBF8F4] px-4 pb-12 pt-4 lg:px-10 lg:pt-6">
        <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-6xl">
          <div role="tablist" aria-label="Report sections" className="grid grid-cols-2 rounded-full bg-[#E7DFD4] p-1 lg:max-w-md">
            {(
              [
                ["overview", "Overview"],
                ["care", "Care & Next Steps"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn("h-11 rounded-full text-sm font-semibold transition-colors", tab === key ? "bg-white text-[#19242B] shadow-sm" : "text-[#6F6A64]")}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "overview" ? (
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
                <div className="space-y-4">
                  {/* Status hero */}
                  <section className="rounded-[18px] p-6 text-center text-white shadow-[0_4px_4px_rgba(0,0,0,0.25)] lg:px-12 lg:py-10" style={{ background: HERO_GRADIENT[report.status] }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/80">{panelTitle} health status</p>
                    <span className="mx-auto mt-3 grid size-10 place-items-center rounded-full bg-white/10">
                      <FlaskConical className="size-5" aria-hidden />
                    </span>
                    <h2 className="mt-3 font-display text-[32px] leading-tight lg:text-[40px]">{heroTitle(clean, pet.name)}</h2>
                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-5 lg:text-base lg:leading-6">
                      {lead}
                      {rest ? (
                        <>
                          <br />
                          {rest}
                        </>
                      ) : null}
                    </p>
                    <VetLink className="mx-auto mt-5 flex h-10 w-fit items-center gap-2 rounded-full bg-white/25 px-5 text-sm font-semibold text-[#FFFDFA]">
                      {heroButton(clean)} <ArrowRight className="size-4" aria-hidden />
                    </VetLink>
                    <p className="mt-3 text-sm">
                      <strong>Connect with a licensed vet in minutes.</strong> <span className="font-medium">No appointment needed.</span>
                    </p>
                  </section>

                  {/* Count */}
                  <section className="rounded-[18px] bg-white p-5">
                    <p className="text-center font-display text-3xl text-[#19242B]">
                      {report.detected.length} of {total}
                    </p>
                    <p className="text-center text-sm font-semibold text-[#19242B]">Pathogens Detected</p>
                    {report.detected.length ? <p className="mt-3 text-sm leading-[1.6] text-[#4A5565]">{CLINICAL_SIGNS}</p> : null}
                  </section>

                  {/* Pathogen profile */}
                  {total ? (
                    <section>
                      <h2 className="mt-4 font-display text-2xl text-[#1F2937]">Complete Pathogen Profile</h2>
                      <p className="mt-1 text-sm text-[#6F6A64]">
                        {[`${total} strain${total === 1 ? "" : "s"} tested via qPCR`, SPECIMEN[report.panel], collected ? `Collected ${collected}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <ul className="mt-4 space-y-3">
                        {report.detected.map((p) => (
                          <PathogenCard key={p.name} p={p} petName={pet.name} defaultOpen meaning={meaningFor(p.name)} />
                        ))}
                        {report.notDetected.map((p) => (
                          <PathogenCard key={p.name} p={p} petName={pet.name} defaultOpen={false} />
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <div className="lg:hidden">
                    <AskAVet petName={pet.name} />
                  </div>

                  <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                    <InfoCard icon={<Info className="size-5" />} title="What do CT values mean?" className="border border-[#E2DAD0] bg-[#F8F2EA]">
                      {CT_EXPLAINER}
                    </InfoCard>
                    <InfoCard icon={<FlaskConical className="size-5" />} title="Why we ran this check" className="bg-[#F3F0EB]">
                      {whyWeRan(report.species, report.panel, total, pet.name)}
                    </InfoCard>
                  </div>

                  <div className="lg:hidden">
                    <NextTestCard base={report.journey.collectedAt ?? report.releasedAt} />
                  </div>

                  <section className="rounded-xl bg-[#F4F0FF] p-5 text-center">
                    <Sparkles className="mx-auto size-6 text-[#5B21B6]" aria-hidden />
                    <h2 className="mt-2 font-display text-lg text-[#020617]">Every test tells a story.</h2>
                    <p className="mt-1 text-sm font-medium text-[#1F2937]">{STORY_BODY}</p>
                  </section>

                  <div className="space-y-4 lg:hidden">
                    <EmergencySigns panel={report.panel} />
                    <KitJourney report={report} />
                    <KitLinks report={report} />
                  </div>
                </div>

                {/* Desktop sidebar: the same cards as above, beside the results instead of below them. */}
                <aside className="hidden space-y-4 lg:sticky lg:top-6 lg:block">
                  <AskAVet petName={pet.name} />
                  <NextTestCard base={report.journey.collectedAt ?? report.releasedAt} />
                  <KitJourney report={report} />
                  <EmergencySigns panel={report.panel} />
                  <KitLinks report={report} />
                </aside>
              </div>
            ) : (
              <CareTab report={report} />
            )}
          </div>

          <footer className="mx-auto mt-10 max-w-2xl space-y-2 text-center text-sm">
            <p className="font-bold text-[#19242B]">
              Questions?{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p className="text-[#6A7282]">{DISCLAIMER}</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
