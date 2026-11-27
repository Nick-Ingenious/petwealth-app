import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Petwealth Admin", template: "%s · Petwealth Admin" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
  return CLERK_ENABLED ? <ClerkProvider>{body}</ClerkProvider> : body;
}
