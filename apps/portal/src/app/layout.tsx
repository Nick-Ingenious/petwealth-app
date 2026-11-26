import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { authLocalization } from "@/components/auth-appearance";
import { CLERK_ENABLED } from "@/lib/env";
import "./globals.css";

const DESCRIPTION = "Register your PetWealth health test kits and follow your pet's results.";

export const metadata: Metadata = {
  // Makes the share image and icon links absolute (the address people share).
  metadataBase: new URL(process.env.PORTAL_URL?.trim() || "https://app.petwealth.com"),
  title: { default: "PetWealth", template: "%s · PetWealth" },
  description: DESCRIPTION,
  // Link previews: the same title on every page, whatever page was shared.
  openGraph: { type: "website", siteName: "PetWealth", title: "PetWealth: Love, backed by science.", description: DESCRIPTION, locale: "en_US" },
  twitter: { card: "summary_large_image", title: "PetWealth: Love, backed by science.", description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8f6f2" };

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = (
    <html lang="en">
      <body className="min-h-dvh bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
  return CLERK_ENABLED ? <ClerkProvider localization={authLocalization}>{body}</ClerkProvider> : body;
}
