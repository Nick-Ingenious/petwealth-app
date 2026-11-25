import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAuthInfo, withClerkMcpAuth } from "@clerk/mcp-tools/next";
import { createMcpHandler } from "mcp-handler";
import { AppError, STAFF_TOOLS, assertAssistantAccess, resolveStaffContext, type StaffContext } from "@petwealth/api";
import { STAFF_ALLOWED_DOMAINS } from "@/lib/env";
import { mcpAuthOptions } from "@/lib/mcp";

/**
 * Staff AI assistant (MCP). Staff add this URL as a connector in Claude and
 * sign in with their Petwealth Google account through Clerk. Each tool runs
 * with that person's role and permissions, exactly as in the admin.
 */
export const maxDuration = 120;

type AuthInfo = Parameters<typeof isClerkAuthInfo>[0];

async function staffFor(authInfo: AuthInfo): Promise<StaffContext> {
  if (!isClerkAuthInfo(authInfo)) throw new AppError(401, "unauthenticated", "Sign in with your Petwealth account.");
  const userId = authInfo.extra.userId;
  const user = await (await clerkClient()).users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) throw new AppError(403, "forbidden", "Your login has no email address.");
  const ctx = await resolveStaffContext({ clerkUserId: userId, email }, { allowedDomains: STAFF_ALLOWED_DOMAINS, via: "mcp" });
  if (!ctx) throw new AppError(403, "forbidden", "This login isn't an active Petwealth staff account.");
  assertAssistantAccess(ctx);
  return ctx;
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 1) }] });

const handler = createMcpHandler((server) => {
  for (const t of STAFF_TOOLS) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false },
      },
      async (args: unknown, ctx: { http?: { authInfo?: AuthInfo; req?: Request } }) => {
        try {
          const staff = await staffFor(ctx.http?.authInfo);
          const adminUrl = new URL(mcpAuthOptions.resourceUrl[0]!).origin;
          return text(await t.run(staff, t.inputSchema.parse(args ?? {}), { adminUrl }));
        } catch (e) {
          // Show permission and validation errors to the assistant; log anything unexpected.
          if (e instanceof AppError) return { ...text(e.message), isError: true };
          console.error(`[mcp] ${t.name} failed`, e instanceof Error ? e.message : e);
          return { ...text("Something went wrong running that tool. The error has been logged."), isError: true };
        }
      },
    );
  }
});

const authed = withClerkMcpAuth(handler, mcpAuthOptions);
export { authed as GET, authed as POST, authed as DELETE };
