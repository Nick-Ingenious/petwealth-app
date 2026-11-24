import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { authLocalization } from "@/components/auth-appearance";
import { CLERK_ENABLED } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PetWealth", template: "%s · PetWealth" },
  description: "Register your PetWealth health test kits and follow your pet's results.",
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
