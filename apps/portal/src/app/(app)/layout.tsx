import type { ReactNode } from "react";
import { requireCustomer } from "@/lib/auth";

/** Every page in here needs a signed-in customer; each page enforces onboarding with its own return path. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireCustomer({ allowOnboarding: true });
  return children;
}
