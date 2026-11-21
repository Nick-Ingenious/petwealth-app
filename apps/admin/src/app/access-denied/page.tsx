import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { PERMISSIONS, isPermission } from "@petwealth/domain";
import { buttonClasses } from "@petwealth/ui";

export const metadata = { title: "Access denied" };

export default async function AccessDenied({ searchParams }: PageProps<"/access-denied">) {
  const { need } = await searchParams;
  const perm = typeof need === "string" && isPermission(need) ? PERMISSIONS[need] : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-xs">
        <ShieldAlert className="mx-auto size-10 text-amber-500" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold text-ink">You don&apos;t have access</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {perm
            ? `Your role doesn't include “${perm.label}”. Ask a Super Admin to grant it on the Permissions page.`
            : "Your account isn't an active PetWealth staff account. Ask a Super Admin to invite your @petwealth.com email."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {perm ? (
            <Link href="/" className={buttonClasses("secondary")}>
              Back to dashboard
            </Link>
          ) : (
            <Link href={"/sign-in" as never} className={buttonClasses("secondary")}>
              Sign in with another account
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
