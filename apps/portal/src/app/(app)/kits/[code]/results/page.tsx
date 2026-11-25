import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Stethoscope } from "lucide-react";
import { getMyLabReport, type CustomerPathogenResult } from "@petwealth/api";
import { PANEL_LABEL } from "@petwealth/domain";
import { Header, Screen } from "@/components/brand";
import { requireCustomer } from "@/lib/auth";

export const metadata = { title: "Results" };

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

function DetectedCard({ p }: { p: CustomerPathogenResult }) {
  return (
    <li className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold leading-snug">{p.name}</h3>
          {p.commonName ? <p className="text-zinc-500">{p.commonName}</p> : null}
        </div>
        <span className="shrink-0 rounded-full bg-lilac-300 px-3 py-1 text-sm font-medium">Detected</span>
      </div>
      {p.whatIsIt ? <p className="mt-3 text-lg leading-snug text-zinc-700">{p.whatIsIt}</p> : null}
      {p.whyItMatters ? <p className="mt-2 text-lg leading-snug text-zinc-700">{p.whyItMatters}</p> : null}
      {p.symptoms?.length ? (
        <div className="mt-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Signs to watch for</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {p.symptoms.map((s) => (
              <li key={s} className="rounded-full bg-canvas px-3 py-1 text-sm text-zinc-700">
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.zoonotic ? (
        <p className="mt-4 rounded-2xl bg-sun-50 px-4 py-3 text-base text-zinc-700">
          This can pass between pets and people. Wash your hands after handling your pet or their waste.
        </p>
      ) : null}
    </li>
  );
}

export default async function ResultsPage({ params }: PageProps<"/kits/[code]/results">) {
  const { code } = await params;
  const raw = decodeURIComponent(code);
  const ctx = await requireCustomer({ next: `/kits/${encodeURIComponent(raw)}/results` });
  const report = await getMyLabReport(ctx, raw);
  if (!report) notFound();

  const petName = report.petName ?? "Your pet";
  const petInSentence = report.petName ?? "your pet";
  const total = report.detected.length + report.notDetected.length;
  const clear = report.status === "clean";

  return (
    <Screen>
      <Header />
      <p className="mt-4">
        <Link href={`/kits/${report.kitCode}`} className="inline-flex items-center gap-1 text-zinc-500 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back to kit
        </Link>
      </p>
      <h1 className="mt-4 text-4xl font-semibold leading-tight">
        {petName}&apos;s {PANEL_LABEL[report.panel]} results
      </h1>
      <p className="mt-2 text-lg text-zinc-500">
        Released {dateFmt.format(report.releasedAt)} · <span className="whitespace-nowrap">Kit {report.kitCode}</span>
      </p>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm" aria-label="Summary">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-5xl font-semibold tabular-nums">
              {report.detected.length} <span className="text-2xl font-normal text-zinc-500">of {total}</span>
            </p>
            <p className="mt-1 whitespace-nowrap text-lg text-zinc-600">pathogens found</p>
          </div>
          <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${clear ? "bg-lime-100 text-lime-800" : "bg-lilac-300"}`}>
            {clear ? "Clear" : "Needs attention"}
          </span>
        </div>
        <p className="mt-5 text-lg leading-snug text-zinc-700">
          {clear
            ? `None of the ${total} pathogens on ${petInSentence}'s ${PANEL_LABEL[report.panel].toLowerCase()} panel were found.`
            : `We found ${report.detected.map((d) => d.name).join(", ")}. Share this report with your vet so you can decide on next steps together.`}
        </p>
      </section>

      {report.detected.length ? (
        <section className="mt-10">
          <h2 className="text-2xl font-semibold">What we found</h2>
          <ul className="mt-4 space-y-4">
            {report.detected.map((p) => (
              <DetectedCard key={p.name} p={p} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Not detected</h2>
        <p className="mt-1 text-lg text-zinc-500">
          {report.notDetected.length} of {total} pathogens
        </p>
        <ul className="mt-4 divide-y divide-zinc-100 rounded-3xl bg-white px-5 shadow-sm">
          {report.notDetected.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 py-3">
              <span className="text-lg">{p.name}</span>
              <span className="shrink-0 text-sm text-zinc-500">Not detected</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 flex gap-3 rounded-3xl bg-lilac-100 p-5 text-lg text-zinc-700">
        <Stethoscope className="mt-1 size-6 shrink-0 text-violet-600" aria-hidden />
        <p>Your vet knows {petInSentence} best. Download this report and bring it to your next visit.</p>
      </div>

      <a
        href={`/api/kits/${report.kitCode}/report`}
        className="mt-6 flex h-16 items-center justify-center gap-2 rounded-full bg-ink text-xl font-semibold text-white"
      >
        <Download className="size-5" aria-hidden /> Download PDF
      </a>
    </Screen>
  );
}
