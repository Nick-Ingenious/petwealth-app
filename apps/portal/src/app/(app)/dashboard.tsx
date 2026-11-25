"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { ArrowRight, ArrowUpRight, ChevronRight, Menu, PencilLine, Search, X } from "lucide-react";
import { cn } from "@petwealth/ui";

export type TestTab = "all" | "registered" | "processing" | "completed";

export interface TestRow {
  code: string;
  href: string;
  petName: string | null;
  petPhoto: string | null;
  species: "dog" | "cat";
  kitName: string;
  date: string | null;
  group: Exclude<TestTab, "all">;
  hasResults: boolean;
}

const PAWP_URL = "https://app.pawp.com/partner/petwealth/otp/";
const STORE_URL = "https://petwealth.com";
const EXPLORE_URL = "https://petwealth.com/collections/all";
const SUPPORT_EMAIL = "support@petwealth.com";

const CHIP: Record<TestRow["group"], { label: string; className: string }> = {
  registered: { label: "Registered", className: "bg-[#F1F5F9] text-[#334155]" },
  processing: { label: "Processing", className: "bg-[#FFF7ED] text-[#C2410C]" },
  completed: { label: "Results Ready", className: "bg-[#DCFCE7] text-[#065F46]" },
};

const TABS: { key: TestTab; label: string }[] = [
  { key: "all", label: "All Tests" },
  { key: "registered", label: "Registered" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
];

// ── Hero ─────────────────────────────────────────────────────────────────

function TestsSlide({ greeting, counts }: { greeting: string; counts: Record<TestTab, number> }) {
  return (
    <div className="relative h-full w-full shrink-0 snap-start overflow-hidden">
      <Image src="/home/hero-dog.jpg" alt="" fill priority sizes="448px" className="object-cover" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(140deg, #0E2A30 5%, rgba(14,70,85,0.76) 47.5%)" }} aria-hidden />
      <div className="relative px-5 pt-[104px]">
        <h1 className="font-display text-[28px] leading-[34px] text-white">{greeting}</h1>
        <p className="mt-2 text-[17px] text-white/85">Let&apos;s check in on your pets&apos; health.</p>
        <div className="mt-8 space-y-3.5 rounded-2xl border border-white/15 bg-white/[0.07] px-[18px] py-6 backdrop-blur-sm">
          <p className="flex items-center gap-1.5">
            <Image src="/home/wordmark-white.png" alt="petwealth" width={125} height={20} className="h-5 w-auto" />
            <span className="font-display text-2xl italic tracking-[-0.02em] text-white">tests</span>
          </p>
          {(
            [
              [counts.registered, "Registered tests"],
              [counts.processing, "Tests processing"],
              [counts.completed, "Test results ready"],
            ] as const
          ).map(([n, label]) => (
            <p key={label} className="flex items-baseline gap-2.5 text-white">
              <span className="font-display text-2xl tabular-nums">{n}</span>
              <span className="text-[15px] font-medium text-white/85">{label}</span>
            </p>
          ))}
          <Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white">
            Register New Kit
          </Link>
        </div>
      </div>
    </div>
  );
}

function PawpSlide() {
  return (
    <div
      className="flex h-full w-full shrink-0 snap-start flex-col items-center justify-center px-6 pb-20 pt-14 text-center"
      style={{ background: "linear-gradient(140deg, #EAC8F4 0%, #938FDA 100%)" }}
    >
      <Image src="/report/pawp-phone.png" alt="" width={599} height={399} className="h-auto w-full max-w-[280px] rounded-[20px]" />
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6F6A64]">Need help?</p>
      <h2 className="mt-1 font-display text-2xl leading-7 text-[#5B3FA8]">24/7 Vet Support is Available</h2>
      <p className="mt-2 text-sm leading-[21px] text-[#4B5563]">Our vets can assess symptoms, advise if ER is needed, prescribe medications and help you prepare.</p>
      <a href={PAWP_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#19242B]">
        Ask a Vet Anything <ArrowRight className="size-4" aria-hidden />
      </a>
    </div>
  );
}

function ExploreSlide() {
  return (
    <div className="flex h-full w-full shrink-0 snap-start flex-col items-center justify-center bg-[#F3ECE3] px-6 pb-20 pt-14 text-center">
      <Image src="/home/explore-box.png" alt="" width={1100} height={733} className="h-44 w-auto object-contain" />
      <h2 className="mt-2 font-display text-[26px] leading-7 text-[#19242B]">More Answers. Better Care.</h2>
      <p className="mt-2 max-w-[330px] text-sm leading-[21px] text-[#4B5563]">
        You don&apos;t have to wait for symptoms to start asking questions. Explore at-home testing for a clearer picture of your pet&apos;s health.
      </p>
      <a href={EXPLORE_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[#19242B] px-6 text-sm font-semibold text-white">
        Explore Health Tests <ArrowRight className="size-4" aria-hidden />
      </a>
    </div>
  );
}

// ── Menu drawer ──────────────────────────────────────────────────────────

function SignOut() {
  const { signOut } = useClerk();
  return (
    <button type="button" onClick={() => signOut({ redirectUrl: "/sign-in" })} className="h-12 w-full rounded-2xl bg-[#BE123C] text-base font-semibold text-white">
      Sign out
    </button>
  );
}

function Drawer({ name, onClose, clerk }: { name: string | null; onClose: () => void; clerk: boolean }) {
  const initial = (name ?? "").trim().slice(0, 1).toUpperCase();
  const row = "flex h-14 items-center justify-between rounded-[20px] bg-[#EAE0FF]/50 px-5 text-base font-semibold text-[#19242B]";
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="Account">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-[#19242B]/30" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[92%] max-w-[400px] flex-col overflow-y-auto bg-[#FBF8F4] p-5">
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold text-[#19242B]">Account</p>
          <button type="button" onClick={onClose} aria-label="Close menu" className="grid size-11 place-items-center">
            <X className="size-6" aria-hidden />
          </button>
        </div>
        <span
          className="mx-auto mt-4 grid size-[140px] place-items-center rounded-full font-display text-5xl text-[#19242B]"
          style={{ background: "linear-gradient(135deg, #E0E7FF, #F3E8FF, #FCE7F3)" }}
          aria-hidden
        >
          {initial}
        </span>
        <p className="mt-3 text-center text-xl font-semibold text-[#19242B]">{name ?? "Your account"}</p>
        <nav className="mt-6 space-y-3">
          <Link href="/my-information" className={row} onClick={onClose}>
            My Information <ChevronRight className="size-5" aria-hidden />
          </Link>
          <Link href="/pets" className={row} onClick={onClose}>
            Manage Pets <ChevronRight className="size-5" aria-hidden />
          </Link>
          <Link href="/register" className={row} onClick={onClose}>
            Register New Test Kit <ChevronRight className="size-5" aria-hidden />
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={row}>
            Help center <ChevronRight className="size-5" aria-hidden />
          </a>
        </nav>
        {clerk ? (
          <div className="mt-6">
            <SignOut />
          </div>
        ) : null}
        <Link href="/delete-account" className="mt-4 text-center text-sm font-medium text-[#BE123C]" onClick={onClose}>
          Delete account
        </Link>
      </div>
    </div>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────

export function Dashboard({ greeting, firstName, rows, clerk }: { greeting: string; firstName: string | null; rows: TestRow[]; clerk: boolean }) {
  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState<TestTab>("all");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c: Record<TestTab, number> = { all: rows.length, registered: 0, processing: 0, completed: 0 };
    for (const r of rows) c[r.group]++;
    return c;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => (tab === "all" || r.group === tab) && (!q || (r.petName ?? "").toLowerCase().includes(q)));
  const light = slide !== 0;

  return (
    <div className="min-h-dvh bg-[#FBF8F4]">
      <div className="mx-auto max-w-md">
        {/* Hero carousel */}
        <section className="relative h-[555px] overflow-hidden bg-[#19242B]" aria-label="Highlights">
          <header className="absolute inset-x-5 top-3 z-10 flex h-12 items-center justify-between">
            <Link href="/" aria-label="PetWealth home">
              {light ? (
                <Image src="/brand/logo-dark.svg" alt="petwealth" width={136} height={22} className="h-[22px] w-auto" />
              ) : (
                <Image src="/home/wordmark-white.png" alt="petwealth" width={136} height={22} className="h-[22px] w-auto" />
              )}
            </Link>
            <span className={cn("flex items-center", light ? "text-[#19242B]" : "text-white")}>
              <Link href="/register" aria-label="Register a kit" className="grid size-11 place-items-center">
                <PencilLine className="size-6" aria-hidden />
              </Link>
              <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="grid size-11 place-items-center">
                <Menu className="size-7" aria-hidden />
              </button>
            </span>
          </header>
          <div
            ref={track}
            className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={(e) => {
              const el = e.currentTarget;
              setSlide(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
            <TestsSlide greeting={greeting} counts={counts} />
            <PawpSlide />
            <ExploreSlide />
          </div>
          <div className="absolute inset-x-0 bottom-[54px] flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show slide ${i + 1}`}
                onClick={() => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: "smooth" })}
                className={cn("h-1 w-2 rounded-sm", i === slide ? (light ? "bg-[#19242B]" : "bg-white") : light ? "bg-[#19242B]/30" : "bg-white/55")}
              />
            ))}
          </div>
        </section>

        {/* Sheet */}
        <main className="relative -mt-[25px] space-y-3.5 rounded-t-[18px] bg-[#FBF8F4] px-3.5 pb-12 pt-3">
          <div role="tablist" aria-label="Tests" className="flex h-12 gap-1 overflow-x-auto rounded-full bg-[#EFE9E1] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "flex h-10 shrink-0 grow items-center justify-center gap-2 rounded-full pl-3.5 pr-2.5 text-[13.5px] font-semibold",
                    active ? "bg-white text-[#101828] shadow-sm" : "text-[#6F6A64]",
                  )}
                >
                  {t.label}
                  <span className={cn("min-w-[22px] rounded-full px-[7px] py-0.5 text-[11px] font-bold", active ? "bg-[#19242B] text-white" : "bg-[#E7DFD4] text-[#6F6A64]")}>
                    {counts[t.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {rows.length ? (
            <>
              <label className="flex h-[50px] items-center gap-2.5 rounded-[14px] border border-[#D1D3D5] bg-white px-3.5 focus-within:border-2 focus-within:border-[#19242B]">
                <Search className="size-4 text-[#6F6A64]" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by pet name"
                  aria-label="Search by pet name"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[#19242B] outline-none placeholder:text-[#8A847B]"
                />
                {query ? (
                  <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                    <X className="size-4 text-[#6F6A64]" aria-hidden />
                  </button>
                ) : null}
              </label>

              {visible.length ? (
                <ul className="space-y-1">
                  {visible.map((r) => (
                    <li key={r.code}>
                      <Link href={r.href as never} className="flex h-24 items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_6px_14px_rgba(15,23,41,0.04)]">
                        <span
                          className={cn(
                            "relative grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-full border-[3px] border-white/55 text-lg font-bold",
                            r.species === "cat" ? "bg-[#FBF1DF] text-[#8A6321]" : "bg-[#E2D5FF] text-[#5B3FA8]",
                          )}
                          aria-hidden
                        >
                          {r.petPhoto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.petPhoto} alt="" className="absolute inset-0 size-full object-cover" />
                          ) : (
                            (r.petName ?? "Y").slice(0, 1).toUpperCase()
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-bold text-[#101828]">{r.petName ?? "Your pet"}</span>
                            <span className={cn("shrink-0 rounded-[7px] px-2 py-1 text-[11px] font-bold leading-[15px]", CHIP[r.group].className)}>{CHIP[r.group].label}</span>
                          </span>
                          <span className="mt-1 block truncate text-[13px] text-[#4A5565]">{[r.date, r.kitName].filter(Boolean).join(" • ")}</span>
                        </span>
                        {r.hasResults ? (
                          <span className="grid size-8 shrink-0 place-items-center rounded-[14px] bg-[#F6F1EA]" aria-hidden>
                            <ArrowUpRight className="size-4 text-[#19242B]" strokeWidth={3} />
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : q ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-[#6F6A64]">No tests match “{query.trim()}”.</p>
                  <button type="button" onClick={() => setQuery("")} className="mt-3 h-10 rounded-full border border-[#E7DFD4] bg-white px-5 text-sm font-semibold text-[#19242B]">
                    Show all tests
                  </button>
                </div>
              ) : (
                <p className="py-6 text-center text-[13px] text-[#6F6A64]">No tests in this tab yet.</p>
              )}
            </>
          ) : (
            <section className="flex flex-col items-center rounded-2xl bg-white px-5 py-8 text-center">
              <Image src="/home/empty-state-illustration.png" alt="" width={317} height={237} className="h-auto w-full max-w-[316px]" />
              <h2 className="mt-4 font-display text-[26px] leading-8 text-[#1E293B]">Start with your pet&apos;s first health check</h2>
              <p className="mt-2 text-[14.5px] leading-[21px] text-[#4A5565]">Understand what&apos;s happening beneath the surface, before symptoms appear.</p>
              <div className="mt-5 grid w-full grid-cols-2 gap-3">
                <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center rounded-full border border-[#19242B] text-sm font-semibold text-[#19242B]">
                  Order Test Kit
                </a>
                <Link href="/register" className="flex h-12 items-center justify-center gap-1 rounded-full bg-[#19242B] text-sm font-semibold text-white">
                  Register New Kit <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </section>
          )}

          {/* Recommendations */}
          <section className="space-y-3 pt-4">
            <h2 className="text-[14.5px] font-bold text-[#19242B]">Recommendations</h2>
            <a href={PAWP_URL} target="_blank" rel="noopener noreferrer" className="block rounded-2xl bg-white p-4 shadow-[0_6px_14px_rgba(15,23,41,0.04)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8A847B]">Need help?</p>
              <p className="mt-1 font-display text-[19px] leading-[25px] text-[#101828]">24/7 Vet Support is Available</p>
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#5B3FA8]">
                Ask a Vet Anything <ArrowRight className="size-4" aria-hidden />
              </p>
            </a>
            <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="flex h-16 items-center gap-3 rounded-2xl bg-[#F6F1EA] px-4">
              <Image src="/home/shortcut-tube.png" alt="" width={192} height={192} className="size-10 object-contain" />
              <span className="flex-1 text-[14.5px] font-semibold text-[#101828]">Purchase a health panel</span>
              <ChevronRight className="size-5 text-[#6F6963]" aria-hidden />
            </a>
            <Link href="/register" className="flex h-16 items-center gap-3 rounded-2xl bg-[#F6F1EA] px-4">
              <Image src="/home/shortcut-kit.png" alt="" width={240} height={180} className="h-10 w-auto object-contain" />
              <span className="flex-1 text-[14.5px] font-semibold text-[#101828]">Activate another kit</span>
              <ChevronRight className="size-5 text-[#6F6963]" aria-hidden />
            </Link>
          </section>
        </main>
      </div>
      {menuOpen ? <Drawer name={firstName} onClose={() => setMenuOpen(false)} clerk={clerk} /> : null}
    </div>
  );
}
