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
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-brand-600 font-bold text-white">PW</div>
          <div>
            <p className="font-semibold text-ink">PetWealth</p>
            <p className="text-sm text-ink-muted">Staff portal</p>
          </div>
        </div>
        <SignIn />
      </div>
    </main>
  );
}
