import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Lightbulb, TestTube2 } from "lucide-react";
import { AppError, getMyKit, type JourneyStep } from "@petwealth/api";
import { DROP_OFF_WITHIN_DAYS, PANEL_LABEL } from "@petwealth/domain";
import { cn } from "@petwealth/ui";
import { Header, KitImage, Screen } from "@/components/brand";
import { requireCustomer } from "@/lib/auth";
import { CollectedButton } from "./collected-button";
import { COLLECT } from "./instructions";

export const metadata = { title: "Your kit" };

const maskEmail = (e: string) => e.replace(/^(.)[^@]*(@.*)$/, "$1••••$2");

function Step({ n, title, state, children }: { n?: number; title: string; state: "done" | "current" | "todo"; children: React.ReactNode }) {
  return (
    <li className="relative pb-10 pl-12 last:pb-0">
      <span className={cn("absolute left-[15px] top-8 h-full w-1 rounded", state === "done" ? "bg-lime-600/70" : state === "current" ? "bg-amber-500" : "bg-zinc-200")} aria-hidden />
      <span
        className={cn(
          "absolute left-0 top-0 grid size-9 place-items-center rounded-full border-4",
          state === "done" ? "border-lime-600 bg-lime-600 text-white" : state === "current" ? "border-amber-500 bg-white" : "border-zinc-200 bg-white",
        )}
        aria-hidden
      >
        {state === "done" ? <Check className="size-4" /> : null}
      </span>
      <h2 className={cn("text-lg font-semibold uppercase tracking-wide", state === "done" ? "text-lime-700" : state === "current" ? "text-amber-600" : "text-zinc-400")}>
        {n ? `Step ${n}: ` : ""}
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </li>
  );
}

export default async function KitPage({ params, searchParams }: PageProps<"/kits/[code]">) {
  const { code } = await params;
  const ctx = await requireCustomer({ next: `/kits/${encodeURIComponent(code)}` });
  const { registered } = await searchParams;
  const kit = await getMyKit(ctx, decodeURIComponent(code)).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const petName = kit.pet?.name ?? "your pet";
  const guide = COLLECT[kit.panel];
  const state = (s: JourneyStep): "done" | "current" | "todo" => (kit.journey.done.includes(s) ? "done" : kit.journey.step === s ? "current" : "todo");
  // Packing and shipping happen together once the sample is collected.
  const shipState = state("ship");
  const mailer = kit.mailer;
  const labelUrl = mailer ? `/api/mailers/${mailer.id}/label` : null;

  return (
    <Screen>
      <Header />
      {registered ? (
        <h1 className="mt-4 text-4xl font-semibold leading-tight">
          Success! <span className="font-light">Your test kit is registered.</span>
        </h1>
      ) : (
        <h1 className="mt-4 text-4xl font-semibold leading-tight">{petName}&apos;s {PANEL_LABEL[kit.panel]} test</h1>
      )}
      <KitImage species={kit.species} panel={kit.panel} priority className="mx-auto mt-6 h-auto w-full max-w-sm object-contain" />
      {registered ? (
        <>
          <p className="mt-4 text-3xl font-light leading-snug">Collect your pet&apos;s test sample as instructed and mail it back to our lab.</p>
          <p className="mt-4 text-xl text-zinc-500">Results will begin populating in your dashboard within 24–48 hours of the lab receiving your kit.</p>
        </>
      ) : null}

      <ol className="mt-10">
        <Step title="Activate kit" state="done">
          <p className="text-lg text-zinc-700">
            Your PetWealth health test kit is linked to <strong>{petName}</strong>
          </p>
          <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 rounded-xl bg-lilac-100 px-3 py-1.5 font-mono text-lg">
            <TestTube2 className="size-4 text-violet-500" aria-hidden /> <span className="whitespace-nowrap">ID: {kit.code}</span> <span className="font-sans text-zinc-500">({PANEL_LABEL[kit.panel]})</span>
          </p>
        </Step>

        <Step n={2} title="Collect sample" state={state("collect")}>
          {state("collect") === "current" ? (
            <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-5">
              <h3 className="text-2xl font-semibold">{guide.title}</h3>
              <p className="text-lg text-zinc-500">{guide.intro}</p>
              <ol className="list-decimal space-y-2 pl-5 text-lg">
                {guide.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
              <p className="text-sm text-zinc-500">Your printed booklet has illustrated, step-by-step instructions.</p>
              <CollectedButton code={kit.code} petName={petName} />
            </div>
          ) : (
            <p className="text-lg text-zinc-500">{state("collect") === "done" ? "Sample collected" : "Not collected yet"}</p>
          )}
        </Step>

        <Step n={3} title="Pack the mailer" state={shipState}>
          {kit.journey.step === "ship" ? (
            <ul className="list-disc space-y-1 pl-5 text-lg">
              <li>Secure the cap tightly, then seal the clear specimen bag.</li>
              <li>Place the sealed specimen bag inside, then seal the <strong>white bubble mailer</strong>.</li>
              {kit.mailerKits.length ? <li>Include your other tubes in the same mailer: {kit.mailerKits.map((k) => `${k.code}${k.petName ? ` (${k.petName})` : ""}`).join(", ")}.</li> : null}
            </ul>
          ) : (
            <p className="text-lg text-zinc-500">{shipState === "done" ? "Packed" : "Ready when you are"}</p>
          )}
        </Step>

        <Step n={4} title="Ship to the lab" state={shipState}>
          {!mailer || mailer.status === "pending" || mailer.status === "failed" ? (
            <p className="text-lg text-zinc-600">We&apos;re preparing your FedEx code and will email it to you shortly.</p>
          ) : state("ship") === "done" ? (
            <p className="text-lg text-zinc-500">On its way to the lab with FedEx · {mailer.rmaNumber}</p>
          ) : (
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold">Your shipping label is ready</h3>
              <p className="text-lg text-zinc-600">
                {mailer.labelFormat === "pdf"
                  ? "Print this label and attach it to your sealed mailer, then drop it at any FedEx location."
                  : "Take your sealed mailer to any FedEx counter. Show them this code and they'll print the label and stick it on for you, so you don't need a printer."}
              </p>
              {mailer.labelFormat === "qr_png" ? (
                <div className="rounded-3xl border-2 border-dashed border-lilac-300 bg-white p-6 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={labelUrl!} alt={`FedEx return QR code ${mailer.rmaNumber}`} className="mx-auto aspect-square w-full max-w-64" />
                  <p className="mt-2 text-sm text-zinc-600">RMA Number: {mailer.rmaNumber}</p>
                </div>
              ) : null}
              <a href={labelUrl!} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center rounded-full bg-lilac-300 text-lg font-semibold">
                {mailer.labelFormat === "pdf" ? "Open label to print" : "Show code at the counter"}
              </a>
              <div className="grid grid-cols-2 gap-3">
                <a href={`${labelUrl}?download=1`} className="flex h-14 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg font-semibold">
                  {mailer.labelFormat === "pdf" ? "Download" : "Save to Photos"}
                </a>
                <span className="flex h-14 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-center text-sm text-zinc-600">
                  Emailed to {maskEmail(kit.email)}
                </span>
              </div>
              <div className="flex gap-3 rounded-3xl bg-sun-50 p-5 text-lg text-zinc-700">
                <Lightbulb className="mt-1 size-6 shrink-0 text-amber-500" aria-hidden />
                <p>
                  Drop it off within {DROP_OFF_WITHIN_DAYS} days of collecting. Drop boxes can&apos;t print labels, so hand it over at the counter.
                </p>
              </div>
            </div>
          )}
        </Step>

        <Step title="Sample mailed" state={kit.journey.done.includes("results") ? "done" : kit.journey.step === "results" ? "current" : "todo"}>
          <h3 className="text-2xl font-semibold">{kit.status === "completed" ? `${petName}'s results are ready` : `Awaiting ${petName}'s test results`}</h3>
          <p className="mt-1 text-lg text-zinc-600">
            {kit.status === "completed"
              ? "Your report is available in your dashboard."
              : `${petName}'s report will be sent via email and available in the dashboard.`}
          </p>
          {kit.journey.step === "results" && kit.status !== "completed" ? <p className="mt-2 text-zinc-500">Current status: {kit.statusLabel}</p> : null}
        </Step>
      </ol>

      <Link href="/" className="mt-12 flex h-16 items-center justify-center gap-2 rounded-full bg-ink text-xl font-semibold text-white">
        Go to Dashboard <ArrowRight className="size-5" aria-hidden />
      </Link>
    </Screen>
  );
}
