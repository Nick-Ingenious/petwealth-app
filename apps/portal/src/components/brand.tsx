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
