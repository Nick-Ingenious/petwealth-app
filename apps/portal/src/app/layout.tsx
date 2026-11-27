import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { authLocalization } from "@/components/auth-appearance";
import { CLERK_ENABLED } from "@/lib/env";
import "./globals.css";

const DESCRIPTION = "Register your Petwealth health test kits and follow your pet's results.";

/**
 * Link preview picture: a small JPEG (about 40 KB). Messaging apps skip large
 * preview images (WhatsApp ignores anything over about 300 KB).
 */
const SHARE_IMAGE = {
  url: "/og/petwealth-share.jpg",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "Petwealth: Love, backed by science. At-home fecal, oral and respiratory tests for your pet.",
};

export const metadata: Metadata = {
  // Makes the share image and icon links absolute (the address people share).
  metadataBase: new URL(process.env.PORTAL_URL?.trim() || "https://app.petwealth.com"),
  title: { default: "Petwealth", template: "%s · Petwealth" },
  description: DESCRIPTION,
  // Link previews: the same title on every page, whatever page was shared.
  openGraph: {
    type: "website",
    siteName: "Petwealth",
    title: "Petwealth: Love, backed by science.",
    description: DESCRIPTION,
    locale: "en_US",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", title: "Petwealth: Love, backed by science.", description: DESCRIPTION, images: [SHARE_IMAGE] },
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
