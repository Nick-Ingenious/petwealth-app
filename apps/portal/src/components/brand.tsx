import Image from "next/image";
import Link from "next/link";
import { QrCode } from "lucide-react";
import { PANEL_LABEL, type Panel, type Species } from "@petwealth/domain";

/** The PetWealth logo lockup (icon + wordmark) from the brand files. Never retype it in a font. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Image src="/brand/logo-dark.svg" alt="PetWealth" width={156} height={25} priority className="h-[25px] w-auto" />
      <span className="rounded-md bg-lilac-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-violet-600">BETA</span>
    </span>
  );
}

/**
 * Packshot of a kit (box + open tray) for its species and panel. The source PNGs are cropped
 * symmetrically, so the gap between box and tray stays at the horizontal center.
 */
export function KitImage({ species, panel, className, priority }: { species: Species; panel: Panel; className?: string; priority?: boolean }) {
  return (
    <Image
      src={`/kits/${species}-${panel}.webp`}
      alt={`${PANEL_LABEL[panel]} sample collection kit for ${species === "dog" ? "dogs" : "cats"}`}
      width={1200}
      height={656}
      sizes="(max-width: 448px) 100vw, 448px"
      priority={priority}
      className={className ?? "mx-auto h-auto w-full object-contain"}
    />
  );
}

/**
 * Sign-in hero: the dog render from the old app with sample result cards. The source image has
 * placeholder cards baked in, so live cards sit exactly over them (positions in % of the
 * 915×664 image, text sized in container units so everything scales together). Counts follow
 * the brand facts: Dog Fecal tests 28 pathogens.
 */
export function HeroDog() {
  const card = "absolute rounded-[2.4cqw] bg-[#EEEBE7] text-[#24163F] shadow-[0_0.4cqw_1.6cqw_rgb(36_22_63/0.08)]";
  const pill = "rounded-full bg-[#CAB3FF] px-[1.3cqw] py-[0.3cqw] text-[1.9cqw] font-medium leading-none";
  return (
    <div className="@container relative w-full max-w-sm" aria-hidden>
      <Image src="/brand/hero-dog.webp" alt="" width={915} height={664} priority sizes="(max-width: 448px) 90vw, 400px" className="h-auto w-full" />
      <div className={card} style={{ left: "13.3%", top: "11.8%", width: "22.3%", height: "19.2%" }}>
        <div className="flex h-full flex-col justify-between p-[2.4cqw]">
          <span className="text-[3.2cqw] font-medium leading-none">Stewart</span>
          <span className="text-[1.8cqw] leading-none">Weimaraner</span>
        </div>
      </div>
      <div className={card} style={{ left: "0%", top: "65.4%", width: "36.6%", height: "19.2%" }}>
        <div className="flex h-full flex-col justify-between p-[2.2cqw]">
          <span className="flex items-start justify-between">
            <span className="text-[3cqw] font-medium leading-none">0 of 28</span>
            <span className={pill}>Clear</span>
          </span>
          <span className="flex items-end justify-between">
            <span className="text-[3.2cqw] font-medium leading-none">Fecal</span>
            <span className="text-[1.7cqw] leading-none">Pathogens found</span>
          </span>
        </div>
      </div>
      <div className={card} style={{ left: "69.2%", top: "51%", width: "30.8%", height: "19.2%" }}>
        <div className="flex h-full flex-col justify-between p-[2.2cqw]">
          <span className="self-end"><span className={pill}>Clear</span></span>
          <span className="text-[3.2cqw] font-medium leading-none">Respiratory</span>
        </div>
      </div>
    </div>
  );
}

/** App header: wordmark + the "Code" shortcut to register kits. */
export function Header({ showCode = true }: { showCode?: boolean }) {
  return (
    <header className="flex items-center justify-between py-5">
      <Link href="/" aria-label="PetWealth home">
        <Wordmark />
      </Link>
      {showCode ? (
        <Link href="/register" className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
          <QrCode className="size-4" aria-hidden /> Code
        </Link>
      ) : null}
    </header>
  );
}

/** Narrow, centered column — the portal is designed for phones first. */
export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-md px-5 pb-16">{children}</div>;
}
