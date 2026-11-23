import Image from "next/image";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { DEV_BYPASS_EMAIL } from "@/lib/env";

export const metadata = { title: "Sign in" };

/** Staff sign-in. Google is the only enabled strategy (configured in the Clerk dashboard). */
export default function SignInPage() {
  if (DEV_BYPASS_EMAIL) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <Image src="/brand/logo-dark.svg" alt="PetWealth" width={175} height={28} priority className="h-7 w-auto" />
          <p className="text-sm text-ink-muted">Staff portal</p>
        </div>
        <SignIn />
      </div>
    </main>
  );
}
